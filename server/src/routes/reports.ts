import type { User } from '../auth.js';
import { balances, debts, partners, pnl, salaries } from '../calc.js';
import { db } from '../db.js';
import type { Router } from '../http.js';
import { period, today } from '../util.js';

export function reportRoutes(r: Router<User>) {
  r.get('/api/dashboard', async ({ query }) => {
    const { from, to } = period(query);
    const [p, bal, d, recent] = await Promise.all([
      pnl(from, to),
      balances(),
      debts(),
      db.query(`
        select o.id, o.day::text as day, o.car, o.plate, o.total, o.status,
          coalesce((select string_agg(name, ', ' order by id) from order_items where order_id = o.id), '') as services,
          coalesce((select string_agg(u.name, ', ' order by u.id) from order_masters m join users u on u.id = m.user_id where m.order_id = o.id), '') as masters
        from orders o where o.deleted_at is null order by o.day desc, o.id desc limit 5`),
    ]);
    return { pnl: p, balances: bal, debt: d.total, recent };
  });

  r.get('/api/report', async ({ query }) => {
    const { from, to } = period(query);
    return pnl(from, to);
  });

  r.get('/api/debts', () => debts());

  r.get('/api/salaries', ({ query }) => {
    const m = query.get('month');
    return salaries(m && /^\d{4}-\d{2}$/.test(m) ? m : today().slice(0, 7));
  });

  r.get('/api/partners', () => partners());

  r.get('/api/audit', ({ query }) => {
    const limit = Math.min(Number(query.get('limit')) || 100, 500);
    return db.query(`
      select l.id, l.at, l.action, l.entity, l.entity_id, l.summary, u.name as author
        from audit_log l left join users u on u.id = l.user_id
       order by l.id desc limit $1`, [limit]);
  });
}
