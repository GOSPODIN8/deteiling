/**
 * Только для локальной разработки без npm-доступа: выполняет SQL через psql.
 * Одно соединение, запросы идут строго по очереди. В продакшене не используется.
 */
import { spawn } from 'node:child_process';

function lit(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Buffer.isBuffer(v)) return `'\\x${v.toString('hex')}'::bytea`;
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

function inline(text: string, params: unknown[] = []): string {
  return text.replace(/\$(\d+)/g, (_, n) => lit(params[Number(n) - 1]));
}

export function createPsqlDriver(url: string) {
  const p = spawn('psql', [url, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=0'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  let waiter: (() => void) | null = null;
  p.stdout.on('data', (d) => { out += d.toString(); if (out.includes('__END__\n') && waiter) waiter(); });
  p.stderr.on('data', (d) => { err += d.toString(); });

  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const r = chain.then(fn, fn);
    chain = r.catch(() => undefined);
    return r;
  };

  function raw(sql: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      out = ''; err = '';
      const t = sql.trim().replace(/;\s*$/, '');
      const head = t.slice(0, 10).toLowerCase();
      let wrapped: string;
      if (/^(select|with)/.test(head)) wrapped = `select coalesce(json_agg(t), '[]'::json) from (${t}) t;`;
      else if (/^(insert|update|delete)/.test(head) && /\breturning\b/i.test(t)) wrapped = `with t as (${t}) select coalesce(json_agg(t), '[]'::json) from t;`;
      else wrapped = `${t};`;
      waiter = () => {
        waiter = null;
        setTimeout(() => {
          const body = out.replace('__END__\n', '').trim();
          if (/ERROR:/.test(err)) return reject(new Error(err.trim()));
          if (!body) return resolve([]);
          try { resolve(JSON.parse(body)); } catch { resolve([]); }
        }, 5);
      };
      p.stdin.write(wrapped + '\n\\echo __END__\n');
    });
  }

  return {
    query: (text: string, params?: unknown[]) => serial(() => raw(inline(text, params))),
    tx: <T>(fn: (c: { query: (t: string, p?: unknown[]) => Promise<any[]> }) => Promise<T>) =>
      serial(async () => {
        await raw('begin');
        try {
          const r = await fn({ query: (t, pp) => raw(inline(t, pp)) });
          await raw('commit');
          return r;
        } catch (e) {
          await raw('rollback');
          throw e;
        }
      }),
  };
}
