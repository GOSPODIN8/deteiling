import type { User } from '../auth.js';
import { audit } from '../audit.js';
import { balances } from '../calc.js';
import { db, one } from '../db.js';
import { HttpError, type Router } from '../http.js';
import { body, date, int, money, num, oneOf, period, str, today } from '../util.js';

async function accountName(id: number) {
  const a = await one<{ name: string; active: boolean }>('select name, active from accounts where id = $1', [id]);
  if (!a) throw new HttpError(400, 'Счёт не найден');
  return a.name;
}

async function userName(id: number) {
  const u = await one<{ name: string }>('select name from users where id = $1', [id]);
  if (!u) throw new HttpError(400, 'Человек не найден');
  return u.name;
}

const PAYOUT_KINDS = ['salary', 'advance', 'return', 'dividend'] as const;
const PAYOUT_LABEL: Record<string, string> = { salary: 'Зарплата', advance: 'Аванс', return: 'Возврат вложений', dividend: 'Доля прибыли' };

export function moneyRoutes(r: Router<User>) {
  /* ---------- Расходы ---------- */
  r.get('/api/expenses', async ({ query }) => {
    const { from, to } = period(query);
    return db.query(`
      select e.id, e.day::text as day, e.amount, e.comment, e.receipt_id, e.category_id, e.account_id,
             c.name as category, a.name as account, u.name as author
        from expenses e
        left join expense_categories c on c.id = e.category_id
        join accounts a on a.id = e.account_id
        left join users u on u.id = e.created_by
       where e.deleted_at is null and e.day between $1 and $2
       order by e.day desc, e.id desc`, [from, to]);
  });

  r.post('/api/expenses', async ({ body: b, user }) => {
    const o = body(b);
    const amount = num(o, 'amount', { req: true, min: 0.01, max: 1e9 })!;
    const account_id = int(o, 'account_id', { req: true })!;
    const category_id = int(o, 'category_id');
    const day = date(o, 'day') ?? today();
    const comment = str(o, 'comment', { max: 500 });
    const acc = await accountName(account_id);
    let receiptId: number | null = null;
    const rc = o.receipt as { mime?: string; data?: string } | undefined;
    if (rc?.data) {
      if (!/^image\/(jpeg|png|webp)$/.test(rc.mime || '')) throw new HttpError(400, 'Чек: нужна картинка JPG, PNG или WEBP');
      const buf = Buffer.from(rc.data, 'base64');
      if (buf.length > 3 * 1024 * 1024) throw new HttpError(400, 'Фото чека больше 3 МБ');
      const row = await one<{ id: number }>('insert into receipts (mime, data) values ($1, $2) returning id', [rc.mime, buf]);
      receiptId = row!.id;
    }
    const cat = category_id ? await one<{ name: string }>('select name from expense_categories where id = $1', [category_id]) : null;
    const row = await one<{ id: number }>(`
      insert into expenses (day, category_id, amount, account_id, comment, receipt_id, created_by)
      values ($1,$2,$3,$4,$5,$6,$7) returning id`, [day, category_id, amount, account_id, comment, receiptId, user.id]);
    await audit(user.id, 'create', 'expense', row!.id, `Расход ${money(amount)}: ${cat?.name ?? 'без категории'}, из «${acc}»${comment ? `, ${comment}` : ''}`);
    return { id: row!.id };
  });

  r.del('/api/expenses/:id', async ({ params, user }) => {
    const e = await one<{ amount: number }>('select amount from expenses where id = $1 and deleted_at is null', [Number(params.id)]);
    if (!e) throw new HttpError(404, 'Расход не найден');
    await db.query('update expenses set deleted_at = now() where id = $1', [Number(params.id)]);
    await audit(user.id, 'delete', 'expense', Number(params.id), `Удалён расход на ${money(Number(e.amount))}`);
    return { ok: true };
  });

  r.get('/api/receipts/:id', async ({ params, res }) => {
    const rc = await one<{ mime: string; data: Buffer | string }>('select mime, data from receipts where id = $1', [Number(params.id)]);
    if (!rc) throw new HttpError(404, 'Чек не найден');
    const buf = Buffer.isBuffer(rc.data) ? rc.data : Buffer.from(String(rc.data).replace(/^\\x/, ''), 'hex');
    res.writeHead(200, { 'Content-Type': rc.mime, 'Cache-Control': 'private, max-age=86400' });
    res.end(buf);
    return undefined;
  });

  /* ---------- Счета и остатки ---------- */
  r.get('/api/accounts', () => balances());

  r.post('/api/accounts', async ({ body: b, user }) => {
    const o = body(b);
    const name = str(o, 'name', { req: true, max: 60 })!;
    const kind = oneOf(o, 'kind', ['cash', 'card', 'terminal'] as const, 'card');
    const row = await one<{ id: number }>(`insert into accounts (name, kind, sort) values ($1, $2, 5) returning id`, [name, kind]);
    await audit(user.id, 'create', 'account', row!.id, `Новый счёт «${name}»`);
    return row;
  });

  r.put('/api/accounts/:id', async ({ params, body: b, user }) => {
    const o = body(b);
    const id = Number(params.id);
    const name = str(o, 'name', { max: 60 });
    const active = o.active === undefined ? null : !!o.active;
    if (active === false) {
      const bal = (await balances()).find((x) => x.id === id);
      if (bal && Math.abs(bal.balance) > 0.009) throw new HttpError(400, `На счёте ${money(bal.balance)}. Сначала переведите деньги.`);
    }
    await db.query('update accounts set name = coalesce($1, name), active = coalesce($2, active) where id = $3', [name, active, id]);
    await audit(user.id, 'update', 'account', id, `Изменён счёт «${name ?? (await accountName(id))}»`);
    return { ok: true };
  });

  /* ---------- Переводы между счетами ---------- */
  r.get('/api/transfers', async ({ query }) => {
    const { from, to } = period(query);
    return db.query(`
      select t.id, t.day::text as day, t.amount, t.comment, fa.name as from_name, ta.name as to_name, u.name as author
        from transfers t join accounts fa on fa.id = t.from_account join accounts ta on ta.id = t.to_account
        left join users u on u.id = t.created_by
       where t.deleted_at is null and t.day between $1 and $2 order by t.day desc, t.id desc`, [from, to]);
  });

  r.post('/api/transfers', async ({ body: b, user }) => {
    const o = body(b);
    const amount = num(o, 'amount', { req: true, min: 0.01 })!;
    const from_account = int(o, 'from_account', { req: true })!;
    const to_account = int(o, 'to_account', { req: true })!;
    if (from_account === to_account) throw new HttpError(400, 'Выберите разные счета');
    const day = date(o, 'day') ?? today();
    const comment = str(o, 'comment', { max: 300 });
    const fromName = await accountName(from_account);
    const toName = await accountName(to_account);
    const row = await one<{ id: number }>(`
      insert into transfers (day, from_account, to_account, amount, comment, created_by)
      values ($1,$2,$3,$4,$5,$6) returning id`, [day, from_account, to_account, amount, comment, user.id]);
    await audit(user.id, 'create', 'transfer', row!.id, `Перевод ${money(amount)}: «${fromName}» → «${toName}»`);
    return row;
  });

  r.del('/api/transfers/:id', async ({ params, user }) => {
    await db.query('update transfers set deleted_at = now() where id = $1', [Number(params.id)]);
    await audit(user.id, 'delete', 'transfer', Number(params.id), `Удалён перевод #${params.id}`);
    return { ok: true };
  });

  /* ---------- Вложения партнёров ---------- */
  r.get('/api/investments', () => db.query(`
    select i.id, i.day::text as day, i.amount, i.comment, i.user_id, u.name as partner, a.name as account
      from investments i join users u on u.id = i.user_id left join accounts a on a.id = i.account_id
     where i.deleted_at is null order by i.day desc, i.id desc`));

  r.post('/api/investments', async ({ body: b, user }) => {
    const o = body(b);
    const amount = num(o, 'amount', { req: true, min: 0.01 })!;
    const user_id = int(o, 'user_id', { req: true })!;
    const account_id = int(o, 'account_id');
    const day = date(o, 'day') ?? today();
    const comment = str(o, 'comment', { max: 300 });
    const who = await userName(user_id);
    if (account_id) await accountName(account_id);
    const row = await one<{ id: number }>(`
      insert into investments (day, user_id, amount, account_id, comment, created_by)
      values ($1,$2,$3,$4,$5,$6) returning id`, [day, user_id, amount, account_id, comment, user.id]);
    await audit(user.id, 'create', 'investment', row!.id, `Вложение ${money(amount)} от ${who}${comment ? `: ${comment}` : ''}`);
    return row;
  });

  r.del('/api/investments/:id', async ({ params, user }) => {
    await db.query('update investments set deleted_at = now() where id = $1', [Number(params.id)]);
    await audit(user.id, 'delete', 'investment', Number(params.id), `Удалено вложение #${params.id}`);
    return { ok: true };
  });

  /* ---------- Выплаты: зарплата, аванс, возврат вложений, доля прибыли ---------- */
  r.get('/api/payouts', async ({ query }) => {
    const kinds = (query.get('kinds') || '').split(',').filter((k) => (PAYOUT_KINDS as readonly string[]).includes(k));
    const { from, to } = query.get('from') || query.get('period') ? period(query) : { from: '2000-01-01', to: '2999-12-31' };
    return db.query(`
      select p.id, p.day::text as day, p.kind, p.amount, p.comment, p.user_id, u.name as person, a.name as account
        from payouts p join users u on u.id = p.user_id join accounts a on a.id = p.account_id
       where p.deleted_at is null and p.day between $1 and $2
         and ($3::text = '' or p.kind = any(string_to_array($3::text, ',')))
       order by p.day desc, p.id desc limit 500`, [from, to, kinds.join(',')]);
  });

  r.post('/api/payouts', async ({ body: b, user }) => {
    const o = body(b);
    const kind = oneOf(o, 'kind', PAYOUT_KINDS);
    const amount = num(o, 'amount', { req: true, min: 0.01 })!;
    const user_id = int(o, 'user_id', { req: true })!;
    const account_id = int(o, 'account_id', { req: true })!;
    const day = date(o, 'day') ?? today();
    const comment = str(o, 'comment', { max: 300 });
    const who = await userName(user_id);
    const acc = await accountName(account_id);
    const row = await one<{ id: number }>(`
      insert into payouts (day, user_id, kind, amount, account_id, comment, created_by)
      values ($1,$2,$3,$4,$5,$6,$7) returning id`, [day, user_id, kind, amount, account_id, comment, user.id]);
    await audit(user.id, 'create', 'payout', row!.id, `${PAYOUT_LABEL[kind]} ${who}: ${money(amount)} из «${acc}»`);
    return row;
  });

  r.del('/api/payouts/:id', async ({ params, user }) => {
    await db.query('update payouts set deleted_at = now() where id = $1', [Number(params.id)]);
    await audit(user.id, 'delete', 'payout', Number(params.id), `Удалена выплата #${params.id}`);
    return { ok: true };
  });
}
