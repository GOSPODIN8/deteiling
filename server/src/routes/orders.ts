import type { User } from '../auth.js';
import { audit } from '../audit.js';
import { db, one, type Client } from '../db.js';
import { HttpError, type Router } from '../http.js';
import { arr, body, date, int, money, num, oneOf, period, round2, str, today } from '../util.js';

const BODY_TYPES = ['sedan', 'cross', 'jeep', 'other'] as const;

interface OrderInput {
  day: string; body_type: string | null; car: string | null; plate: string | null;
  client_name: string | null; client_phone: string | null; total: number; comment: string | null;
  status: 'in_work' | 'done';
  items: { service_id: number | null; name: string; price: number }[];
  masters: number[];
  payments: { account_id: number; amount: number }[];
}

function parseOrder(raw: unknown): OrderInput {
  const o = body(raw);
  const items = arr(o, 'items').map((x) => {
    const it = body(x);
    return { service_id: int(it, 'service_id'), name: str(it, 'name', { req: true, max: 120 })!, price: num(it, 'price', { min: 0 }) ?? 0 };
  });
  const masters = [...new Set(arr(o, 'masters').map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))];
  const payments = arr(o, 'payments').map((x) => {
    const p = body(x);
    return { account_id: int(p, 'account_id', { req: true })!, amount: num(p, 'amount', { req: true, min: 0 })! };
  }).filter((p) => p.amount > 0);
  const totalRaw = num(o, 'total', { min: 0 });
  const total = totalRaw ?? round2(items.reduce((a, i) => a + i.price, 0));
  const paid = payments.reduce((a, p) => a + p.amount, 0);
  if (paid > total + 0.009) throw new HttpError(400, `Оплата (${money(paid)}) больше суммы заказа (${money(total)})`);
  if (!items.length && !str(o, 'comment')) throw new HttpError(400, 'Выберите хотя бы одну услугу');
  return {
    day: date(o, 'day') ?? today(),
    body_type: o.body_type ? oneOf(o, 'body_type', BODY_TYPES) : null,
    car: str(o, 'car', { max: 80 }), plate: str(o, 'plate', { max: 20 })?.toUpperCase() ?? null,
    client_name: str(o, 'client_name', { max: 80 }), client_phone: str(o, 'client_phone', { max: 30 }),
    total, comment: str(o, 'comment', { max: 1000 }),
    status: oneOf(o, 'status', ['in_work', 'done'] as const, 'done'),
    items, masters, payments,
  };
}

async function writeChildren(c: Client, orderId: number, inp: OrderInput, payDay: string) {
  await c.query('delete from order_items where order_id = $1', [orderId]);
  await c.query('delete from order_masters where order_id = $1', [orderId]);
  for (const it of inp.items) {
    await c.query('insert into order_items (order_id, service_id, name, price) values ($1,$2,$3,$4)', [orderId, it.service_id, it.name, it.price]);
  }
  for (const m of inp.masters) {
    await c.query('insert into order_masters (order_id, user_id) values ($1,$2)', [orderId, m]);
  }
  await c.query('delete from payments where order_id = $1', [orderId]);
  for (const p of inp.payments) {
    await c.query('insert into payments (order_id, account_id, amount, day) values ($1,$2,$3,$4)', [orderId, p.account_id, p.amount, payDay]);
  }
}

function describe(inp: OrderInput) {
  const what = inp.items.map((i) => i.name).join(', ') || 'Заказ';
  const car = [inp.car, inp.plate].filter(Boolean).join(' ');
  return `${what}${car ? `, ${car}` : ''} — ${money(inp.total)}`;
}

export async function getOrder(id: number) {
  const o = await one(`select o.*, o.day::text as day from orders o where id = $1 and deleted_at is null`, [id]);
  if (!o) throw new HttpError(404, 'Заказ не найден');
  const items = await db.query('select id, service_id, name, price from order_items where order_id = $1 order by id', [id]);
  const masters = await db.query('select u.id, u.name from order_masters m join users u on u.id = m.user_id where m.order_id = $1 order by u.id', [id]);
  const payments = await db.query(
    `select p.id, p.account_id, a.name as account_name, a.kind, p.amount, p.day::text as day
       from payments p join accounts a on a.id = p.account_id where p.order_id = $1 order by p.id`, [id]);
  const paid = round2(payments.reduce((a: number, p: any) => a + Number(p.amount), 0));
  return { ...o, items, masters, payments, paid, debt: round2(Number(o.total) - paid) };
}

export function orderRoutes(r: Router<User>) {
  r.get('/api/orders', async ({ query }) => {
    const { from, to } = period(query);
    const q = (query.get('q') || '').trim();
    const where = q
      ? `(lower(coalesce(o.plate,'')) like $1 or lower(coalesce(o.car,'')) like $1
          or lower(coalesce(o.client_name,'')) like $1 or coalesce(o.client_phone,'') like $1)`
      : `o.day between $1 and $2`;
    const params = q ? [`%${q.toLowerCase()}%`] : [from, to];
    return db.query(`
      select o.id, o.day::text as day, o.car, o.plate, o.client_name, o.client_phone, o.total, o.status, o.body_type,
        coalesce((select string_agg(name, ', ' order by id) from order_items where order_id = o.id), '') as services,
        coalesce((select string_agg(u.name, ', ' order by u.id) from order_masters m join users u on u.id = m.user_id where m.order_id = o.id), '') as masters,
        coalesce((select sum(amount) from payments where order_id = o.id), 0) as paid
      from orders o
      where o.deleted_at is null and ${where}
      order by o.day desc, o.id desc limit 300`, params);
  });

  r.get('/api/orders/:id', ({ params }) => getOrder(Number(params.id)));

  r.post('/api/orders', async ({ body: b, user }) => {
    const inp = parseOrder(b);
    const id = await db.tx(async (c) => {
      const [row] = await c.query<{ id: number }>(`
        insert into orders (day, body_type, car, plate, client_name, client_phone, total, comment, status, created_by)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
        [inp.day, inp.body_type, inp.car, inp.plate, inp.client_name, inp.client_phone, inp.total, inp.comment, inp.status, user.id]);
      await writeChildren(c, row.id, inp, inp.day);
      await audit(user.id, 'create', 'order', row.id, describe(inp), c);
      return row.id;
    });
    return getOrder(id);
  });

  r.put('/api/orders/:id', async ({ params, body: b, user }) => {
    const id = Number(params.id);
    await getOrder(id);
    const inp = parseOrder(b);
    await db.tx(async (c) => {
      await c.query(`
        update orders set day=$1, body_type=$2, car=$3, plate=$4, client_name=$5, client_phone=$6, total=$7,
               comment=$8, status=$9, updated_at=now() where id=$10`,
        [inp.day, inp.body_type, inp.car, inp.plate, inp.client_name, inp.client_phone, inp.total, inp.comment, inp.status, id]);
      await writeChildren(c, id, inp, inp.day);
      await audit(user.id, 'update', 'order', id, describe(inp), c);
    });
    return getOrder(id);
  });

  /** Доплата по заказу (закрыть долг) */
  r.post('/api/orders/:id/payments', async ({ params, body: b, user }) => {
    const id = Number(params.id);
    const o = await getOrder(id);
    const p = body(b);
    const amount = num(p, 'amount', { req: true, min: 0.01 })!;
    const account_id = int(p, 'account_id', { req: true })!;
    if (amount > o.debt + 0.009) throw new HttpError(400, `Долг по заказу ${money(o.debt)}, нельзя внести больше`);
    await db.tx(async (c) => {
      await c.query('insert into payments (order_id, account_id, amount, day) values ($1,$2,$3,$4)', [id, account_id, amount, today()]);
      await c.query(`update orders set status = 'done', updated_at = now() where id = $1 and $2::numeric >= $3::numeric`, [id, amount, o.debt]);
      await audit(user.id, 'update', 'order', id, `Доплата ${money(amount)} по заказу #${id}`, c);
    });
    return getOrder(id);
  });

  r.del('/api/orders/:id', async ({ params, user }) => {
    const id = Number(params.id);
    const o = await getOrder(id);
    await db.query('update orders set deleted_at = now() where id = $1', [id]);
    await audit(user.id, 'delete', 'order', id, `Удалён заказ #${id} на ${money(Number(o.total))}`);
    return { ok: true };
  });
}
