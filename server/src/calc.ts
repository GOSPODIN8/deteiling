import { db } from './db.js';
import { addDays, monthEnd, round2 } from './util.js';

export interface Balance { id: number; name: string; kind: string; user_id: number | null; balance: number }

/** Остатки по всем счетам (касса, карта, терминал, у партнёров на руках) за всё время */
export async function balances(): Promise<Balance[]> {
  const rows = await db.query<Balance>(`
    select a.id, a.name, a.kind, a.user_id,
      coalesce((select sum(p.amount) from payments p join orders o on o.id = p.order_id
                 where p.account_id = a.id and o.deleted_at is null), 0)
    + coalesce((select sum(amount) from investments where account_id = a.id and deleted_at is null), 0)
    + coalesce((select sum(amount) from transfers where to_account = a.id and deleted_at is null), 0)
    - coalesce((select sum(amount) from transfers where from_account = a.id and deleted_at is null), 0)
    - coalesce((select sum(amount) from expenses where account_id = a.id and deleted_at is null), 0)
    - coalesce((select sum(amount) from payouts where account_id = a.id and deleted_at is null), 0)
      as balance
    from accounts a where a.active
    order by a.sort, a.id`);
  return rows.map((r) => ({ ...r, balance: round2(Number(r.balance)) }));
}

export interface Pnl {
  from: string; to: string;
  revenue: number; cars: number; avgCheck: number;
  expenses: number; salaries: number; totalCosts: number; profit: number; margin: number;
  byCategory: { name: string; amount: number }[];
  received: { kind: string; amount: number }[];
  byDay: { day: string; revenue: number }[];
  byService: { name: string; count: number; amount: number }[];
}

/** Доходы и расходы за период */
export async function pnl(from: string, to: string): Promise<Pnl> {
  const [o] = await db.query<{ revenue: number; cars: number }>(
    `select coalesce(sum(total),0) as revenue, count(*)::int as cars from orders
      where deleted_at is null and day between $1 and $2`, [from, to]);
  const byCategory = await db.query<{ name: string; amount: number }>(
    `select coalesce(c.name, 'Без категории') as name, sum(e.amount) as amount
       from expenses e left join expense_categories c on c.id = e.category_id
      where e.deleted_at is null and e.day between $1 and $2
      group by 1 order by 2 desc`, [from, to]);
  const [s] = await db.query<{ amount: number }>(
    `select coalesce(sum(amount),0) as amount from payouts
      where deleted_at is null and kind in ('salary','advance') and day between $1 and $2`, [from, to]);
  const received = await db.query<{ kind: string; amount: number }>(
    `select a.kind, sum(p.amount) as amount from payments p
       join orders o on o.id = p.order_id join accounts a on a.id = p.account_id
      where o.deleted_at is null and p.day between $1 and $2 group by 1`, [from, to]);
  const byService = await db.query<{ name: string; count: number; amount: number }>(
    `select i.name, count(*)::int as count, sum(i.price) as amount from order_items i
       join orders o on o.id = i.order_id
      where o.deleted_at is null and o.day between $1 and $2
      group by 1 order by 3 desc, 2 desc`, [from, to]);

  // График: по дням, не больше 31 последнего дня периода
  const chartFrom = daysBetween(from, to) > 31 ? addDays(to, -30) : from;
  const dayRows = await db.query<{ day: string; revenue: number }>(
    `select day::text as day, sum(total) as revenue from orders
      where deleted_at is null and day between $1 and $2 group by 1`, [chartFrom, to]);
  const map = new Map(dayRows.map((r) => [String(r.day).slice(0, 10), Number(r.revenue)]));
  const byDay: { day: string; revenue: number }[] = [];
  for (let d = chartFrom; d <= to; d = addDays(d, 1)) byDay.push({ day: d, revenue: map.get(d) || 0 });

  const revenue = Number(o.revenue);
  const expenses = byCategory.reduce((a, r) => a + Number(r.amount), 0);
  const salaries = Number(s.amount);
  const totalCosts = expenses + salaries;
  const profit = revenue - totalCosts;
  return {
    from, to,
    revenue: round2(revenue), cars: o.cars, avgCheck: o.cars ? round2(revenue / o.cars) : 0,
    expenses: round2(expenses), salaries: round2(salaries), totalCosts: round2(totalCosts),
    profit: round2(profit), margin: revenue > 0 ? Math.round((profit / revenue) * 100) : 0,
    byCategory: byCategory.map((r) => ({ name: r.name, amount: round2(Number(r.amount)) })),
    received: received.map((r) => ({ kind: r.kind, amount: round2(Number(r.amount)) })),
    byDay,
    byService: byService.map((r) => ({ name: r.name, count: r.count, amount: round2(Number(r.amount)) })),
  };
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

/** Сумма долгов клиентов: заказы, оплаченные не полностью */
export async function debts() {
  const rows = await db.query<{ id: number; day: string; car: string | null; plate: string | null; client_name: string | null; total: number; paid: number }>(`
    select o.id, o.day::text as day, o.car, o.plate, o.client_name, o.total,
           coalesce((select sum(amount) from payments where order_id = o.id), 0) as paid
      from orders o where o.deleted_at is null
       and o.total > coalesce((select sum(amount) from payments where order_id = o.id), 0) + 0.009
     order by o.day desc, o.id desc`);
  const list = rows.map((r) => ({ ...r, debt: round2(Number(r.total) - Number(r.paid)) }));
  return { total: round2(list.reduce((a, r) => a + r.debt, 0)), list };
}

/** Зарплата за месяц (month = YYYY-MM) */
export async function salaries(month: string) {
  const from = month + '-01';
  const to = monthEnd(from);
  const users = await db.query<{ id: number; name: string; role: string; salary_fixed: number; salary_percent: number }>(
    `select id, name, role, salary_fixed, salary_percent from users where active order by id`);
  const shares = await db.query<{ user_id: number; orders: number; share: number }>(`
    select m.user_id, count(*)::int as orders,
           sum(o.total / (select count(*) from order_masters m2 where m2.order_id = o.id)) as share
      from order_masters m join orders o on o.id = m.order_id
     where o.deleted_at is null and o.day between $1 and $2
     group by m.user_id`, [from, to]);
  const paid = await db.query<{ user_id: number; kind: string; amount: number }>(`
    select user_id, kind, sum(amount) as amount from payouts
     where deleted_at is null and kind in ('salary','advance') and day between $1 and $2
     group by 1, 2`, [from, to]);
  return {
    month, from, to,
    rows: users.map((u) => {
      const sh = shares.find((s) => s.user_id === u.id);
      const share = Number(sh?.share || 0);
      const fromPercent = round2((share * Number(u.salary_percent)) / 100);
      const fixed = Number(u.salary_fixed);
      const accrued = round2(fixed + fromPercent);
      const advance = round2(paid.filter((p) => p.user_id === u.id && p.kind === 'advance').reduce((a, p) => a + Number(p.amount), 0));
      const salary = round2(paid.filter((p) => p.user_id === u.id && p.kind === 'salary').reduce((a, p) => a + Number(p.amount), 0));
      return {
        user_id: u.id, name: u.name, role: u.role,
        orders: sh?.orders || 0, revenueShare: round2(share),
        salary_fixed: fixed, salary_percent: Number(u.salary_percent),
        fixed, fromPercent, accrued, advance, paid: salary, due: round2(accrued - advance - salary),
      };
    }),
  };
}

/**
 * Партнёры: вложения, возвраты и делёж прибыли за всё время.
 * Правило: прибыль сначала возвращает вложения (пропорционально невозвращённым суммам),
 * остаток делится по долям из настроек.
 */
export async function partners() {
  const [tot] = await db.query<{ revenue: number; expenses: number; salaries: number }>(`
    select
      (select coalesce(sum(total),0) from orders where deleted_at is null) as revenue,
      (select coalesce(sum(amount),0) from expenses where deleted_at is null) as expenses,
      (select coalesce(sum(amount),0) from payouts where deleted_at is null and kind in ('salary','advance')) as salaries`);
  const people = await db.query<{ id: number; name: string; share_percent: number; invested: number; returned: number; dividends: number }>(`
    select u.id, u.name, u.share_percent,
      coalesce((select sum(amount) from investments where user_id = u.id and deleted_at is null), 0) as invested,
      coalesce((select sum(amount) from payouts where user_id = u.id and kind = 'return' and deleted_at is null), 0) as returned,
      coalesce((select sum(amount) from payouts where user_id = u.id and kind = 'dividend' and deleted_at is null), 0) as dividends
    from users u where u.role = 'partner' and (u.active or exists (select 1 from investments i where i.user_id = u.id))
    order by u.id`);

  const profitAll = round2(Number(tot.revenue) - Number(tot.expenses) - Number(tot.salaries));
  const list = people.map((p) => ({
    id: p.id, name: p.name, share: Number(p.share_percent),
    invested: Number(p.invested), returned: Number(p.returned), dividends: Number(p.dividends),
    outstanding: round2(Math.max(0, Number(p.invested) - Number(p.returned))),
  }));
  const distributed = list.reduce((a, p) => a + p.returned + p.dividends, 0);
  const available = round2(profitAll - distributed);
  const outstanding = list.reduce((a, p) => a + p.outstanding, 0);

  const toReturn = Math.max(0, Math.min(available, outstanding));
  const rest = Math.max(0, available - toReturn);
  const shareSum = list.reduce((a, p) => a + p.share, 0);

  const rows = list.map((p) => {
    const ret = outstanding > 0 ? round2((toReturn * p.outstanding) / outstanding) : 0;
    const shareK = shareSum > 0 ? p.share / shareSum : list.length ? 1 / list.length : 0;
    const div = round2(rest * shareK);
    return { ...p, suggestReturn: ret, suggestDividend: div };
  });

  return {
    profitAll, distributed: round2(distributed), available,
    totalInvested: round2(list.reduce((a, p) => a + p.invested, 0)),
    totalOutstanding: round2(outstanding),
    stage: outstanding > 0.009 ? 'return' : 'dividend',
    sharesConfigured: shareSum > 0,
    rows,
  };
}
