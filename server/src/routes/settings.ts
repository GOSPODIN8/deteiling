import { ensureUser, type User } from '../auth.js';
import { audit } from '../audit.js';
import { db, one } from '../db.js';
import { HttpError, type Router } from '../http.js';
import { body, bool, int, num, oneOf, str } from '../util.js';

export async function getSetting<T>(key: string, def: T): Promise<T> {
  const r = await one<{ value: T }>('select value from settings where key = $1', [key]);
  return r ? r.value : def;
}

export async function setSetting(key: string, value: unknown) {
  await db.query(
    `insert into settings (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value`,
    [key, JSON.stringify(value)],
  );
}

export function settingsRoutes(r: Router<User>) {
  /** Всё, что нужно интерфейсу для форм */
  r.get('/api/ref', async ({ user }) => {
    const [users, accounts, services, categories, centerName] = await Promise.all([
      db.query(`select id, telegram_id, name, username, role, share_percent, salary_fixed, salary_percent, active, notify,
                       (chat_id is not null) as bot_started from users order by active desc, id`),
      db.query('select id, name, kind, user_id, active from accounts order by sort, id'),
      db.query('select id, name, price_sedan, price_cross, price_jeep, active from services order by sort, id'),
      db.query('select id, name, active from expense_categories order by sort, id'),
      getSetting('center_name', 'HAYANMI DETEILING'),
    ]);
    return { me: user, users, accounts, services, categories, centerName };
  });

  r.put('/api/settings/center_name', async ({ body: b, user }) => {
    const name = str(body(b), 'value', { req: true, max: 60 })!;
    await setSetting('center_name', name);
    await audit(user.id, 'update', 'settings', null, `Название центра: ${name}`);
    return { ok: true };
  });

  /* ---------- Команда ---------- */
  r.post('/api/users', async ({ body: b, user }) => {
    const o = body(b);
    const telegram_id = int(o, 'telegram_id', { req: true })!;
    const name = str(o, 'name', { req: true, max: 60 })!;
    const role = oneOf(o, 'role', ['partner', 'master'] as const, 'partner');
    const exists = await one('select id from users where telegram_id = $1', [telegram_id]);
    if (exists) throw new HttpError(400, 'Человек с таким Telegram ID уже есть');
    const u = await ensureUser({ id: telegram_id, name }, role);
    await audit(user.id, 'create', 'user', u.id, `Добавлен в команду: ${name} (${role === 'partner' ? 'партнёр' : 'мастер'})`);
    return u;
  });

  r.put('/api/users/:id', async ({ params, body: b, user }) => {
    const id = Number(params.id);
    const o = body(b);
    const cur = await one<User>('select * from users where id = $1', [id]);
    if (!cur) throw new HttpError(404, 'Не найден');
    const name = str(o, 'name', { max: 60 }) ?? cur.name;
    const role = o.role ? oneOf(o, 'role', ['partner', 'master'] as const) : cur.role;
    const share = num(o, 'share_percent', { min: 0, max: 100 }) ?? cur.share_percent;
    const fixed = num(o, 'salary_fixed', { min: 0 }) ?? cur.salary_fixed;
    const pct = num(o, 'salary_percent', { min: 0, max: 100 }) ?? cur.salary_percent;
    const active = bool(o, 'active') ?? cur.active;
    const notify = bool(o, 'notify');
    if (!active && id === user.id) throw new HttpError(400, 'Нельзя отключить самого себя');
    await db.query(`
      update users set name=$1, role=$2, share_percent=$3, salary_fixed=$4, salary_percent=$5, active=$6,
             notify = coalesce($7, notify) where id=$8`, [name, role, share, fixed, pct, active, notify, id]);
    if (name !== cur.name) await db.query(`update accounts set name = $1 where user_id = $2 and kind = 'person'`, [`На руках: ${name}`, id]);
    await audit(user.id, 'update', 'user', id, `Изменены настройки: ${name}`);
    return { ok: true };
  });

  /* ---------- Услуги и прайс ---------- */
  r.post('/api/services', async ({ body: b, user }) => {
    const o = body(b);
    const name = str(o, 'name', { req: true, max: 80 })!;
    const row = await one<{ id: number }>(`
      insert into services (name, price_sedan, price_cross, price_jeep, sort)
      values ($1,$2,$3,$4, (select coalesce(max(sort),0)+1 from services)) returning id`,
      [name, num(o, 'price_sedan', { min: 0 }), num(o, 'price_cross', { min: 0 }), num(o, 'price_jeep', { min: 0 })]);
    await audit(user.id, 'create', 'service', row!.id, `Новая услуга: ${name}`);
    return row;
  });

  r.put('/api/services/:id', async ({ params, body: b, user }) => {
    const o = body(b);
    const id = Number(params.id);
    const name = str(o, 'name', { req: true, max: 80 })!;
    await db.query(`update services set name=$1, price_sedan=$2, price_cross=$3, price_jeep=$4, active=coalesce($5, active) where id=$6`,
      [name, num(o, 'price_sedan', { min: 0 }), num(o, 'price_cross', { min: 0 }), num(o, 'price_jeep', { min: 0 }), bool(o, 'active'), id]);
    await audit(user.id, 'update', 'service', id, `Изменена услуга: ${name}`);
    return { ok: true };
  });

  /* ---------- Категории расходов ---------- */
  r.post('/api/categories', async ({ body: b, user }) => {
    const name = str(body(b), 'name', { req: true, max: 60 })!;
    const row = await one<{ id: number }>(
      `insert into expense_categories (name, sort) values ($1, (select coalesce(max(sort),0)+1 from expense_categories)) returning id`, [name]);
    await audit(user.id, 'create', 'category', row!.id, `Новая категория расходов: ${name}`);
    return row;
  });

  r.put('/api/categories/:id', async ({ params, body: b, user }) => {
    const o = body(b);
    const name = str(o, 'name', { req: true, max: 60 })!;
    await db.query('update expense_categories set name=$1, active=coalesce($2, active) where id=$3', [name, bool(o, 'active'), Number(params.id)]);
    await audit(user.id, 'update', 'category', Number(params.id), `Изменена категория: ${name}`);
    return { ok: true };
  });
}
