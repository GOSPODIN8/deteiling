/**
 * Доступ к PostgreSQL.
 * В продакшене — драйвер `pg`. Для локальных тестов без npm можно включить
 * DB_DRIVER=psql — тогда запросы идут через установленный psql (см. dev/psqlShim.ts).
 */

export interface Client {
  query<T = any>(text: string, params?: unknown[]): Promise<T[]>;
}

interface Driver {
  query<T = any>(text: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (c: Client) => Promise<T>): Promise<T>;
}

let driver: Driver;

export async function initDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL не задан. На Railway добавьте PostgreSQL и переменную DATABASE_URL.');
  if (process.env.DB_DRIVER === 'psql') {
    const { createPsqlDriver } = await import('./dev/psqlShim.js');
    driver = createPsqlDriver(url);
    return;
  }
  const pg = (await import('pg')).default;
  pg.types.setTypeParser(1700, (v: string) => parseFloat(v)); // numeric -> number
  pg.types.setTypeParser(20, (v: string) => parseInt(v, 10)); // bigint -> number
  pg.types.setTypeParser(1082, (v: string) => v); // date -> 'YYYY-MM-DD'
  const pool = new pg.Pool({
    connectionString: url,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
  driver = {
    async query(text, params) {
      const r = await pool.query(text, params as any[]);
      return r.rows;
    },
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query('begin');
        const res = await fn({ query: async (t, p) => (await c.query(t, p as any[])).rows });
        await c.query('commit');
        return res;
      } catch (e) {
        await c.query('rollback');
        throw e;
      } finally {
        c.release();
      }
    },
  };
}

export const db: Driver = {
  query: (t, p) => driver.query(t, p),
  tx: (fn) => driver.tx(fn),
};

export async function one<T = any>(text: string, params?: unknown[], c: Client = db): Promise<T | null> {
  const rows = await c.query<T>(text, params);
  return rows[0] ?? null;
}
