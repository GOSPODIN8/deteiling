import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { db, one } from './db.js';
import { HttpError } from './http.js';

export interface User {
  id: number;
  telegram_id: number;
  name: string;
  username: string | null;
  role: 'partner' | 'master';
  share_percent: number;
  salary_fixed: number;
  salary_percent: number;
  active: boolean;
}

interface TgUser { id: number; first_name?: string; last_name?: string; username?: string }

/** Проверка подписи Telegram WebApp initData */
export function verifyInitData(initData: string, botToken: string, maxAgeSec = 7 * 24 * 3600): TgUser {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new HttpError(401, 'Нет подписи Telegram');
  params.delete('hash');
  const dataCheck = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = createHmac('sha256', secret).update(dataCheck).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== calc.length || !timingSafeEqual(given, calc)) throw new HttpError(401, 'Неверная подпись Telegram');
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) throw new HttpError(401, 'Сессия устарела, откройте приложение заново');
  const u = JSON.parse(params.get('user') || 'null') as TgUser | null;
  if (!u?.id) throw new HttpError(401, 'Нет пользователя Telegram');
  return u;
}

export function ownerIds(): number[] {
  return (process.env.OWNER_TELEGRAM_IDS || '')
    .split(/[,\s]+/).map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
}

/** Создаёт пользователя и его личный «счёт на руках» */
export async function ensureUser(tg: { id: number; name: string; username?: string | null }, role: 'partner' | 'master' = 'partner'): Promise<User> {
  const existing = await one<User>('select * from users where telegram_id = $1', [tg.id]);
  if (existing) return existing;
  return db.tx(async (c) => {
    const [u] = await c.query<User>(
      `insert into users (telegram_id, name, username, role) values ($1, $2, $3, $4) returning *`,
      [tg.id, tg.name, tg.username ?? null, role],
    );
    await c.query(`insert into accounts (name, kind, user_id, sort) values ($1, 'person', $2, 10)`, [`На руках: ${u.name}`, u.id]);
    return u;
  });
}

export async function authenticate(req: IncomingMessage): Promise<User> {
  // Режим локальной разработки: DEV_TELEGRAM_ID вместо подписи Telegram
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_TELEGRAM_ID) {
    const id = Number(req.headers['x-dev-user'] || process.env.DEV_TELEGRAM_ID);
    const u = await one<User>('select * from users where telegram_id = $1 and active', [id]);
    if (u) return u;
    if (ownerIds().includes(id)) return ensureUser({ id, name: 'Разработчик' });
    throw new HttpError(403, `Нет доступа. Ваш Telegram ID: ${id}`);
  }
  const token = process.env.BOT_TOKEN;
  if (!token) throw new HttpError(500, 'BOT_TOKEN не задан');
  const init = String(req.headers['x-telegram-init-data'] || '');
  if (!init) throw new HttpError(401, 'Откройте приложение из Telegram');
  const tg = verifyInitData(init, token);
  const u = await one<User>('select * from users where telegram_id = $1', [tg.id]);
  if (u) {
    if (!u.active) throw new HttpError(403, 'Доступ отключён. Обратитесь к партнёру.');
    if (tg.username && tg.username !== u.username) await db.query('update users set username = $1 where id = $2', [tg.username, u.id]);
    return u;
  }
  if (ownerIds().includes(tg.id)) {
    const name = [tg.first_name, tg.last_name].filter(Boolean).join(' ') || tg.username || `ID ${tg.id}`;
    return ensureUser({ id: tg.id, name, username: tg.username });
  }
  throw new HttpError(403, `Нет доступа. Ваш Telegram ID: ${tg.id}. Попросите партнёра добавить вас в «Настройки → Команда».`);
}
