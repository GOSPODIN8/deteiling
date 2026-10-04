/**
 * Telegram-бот: кнопка мини-аппа, /start, /id, /today и рассылка итогов.
 * Работает через Bot API напрямую (long polling), без сторонних библиотек.
 */
import { ensureUser, ownerIds, type User } from './auth.js';
import { balances, partners, pnl } from './calc.js';
import { db, one } from './db.js';
import { getSetting } from './routes/settings.js';
import { addDays, humanDate, humanMonth, money, monthEnd, nowParts, today, weekStart } from './util.js';

const token = () => process.env.BOT_TOKEN || '';

export function appUrl(): string | null {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return null;
}

async function api<T = any>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
  return data.result;
}

export async function send(chatId: number, text: string, withButton = true) {
  const url = appUrl();
  const payload: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (withButton && url) payload.reply_markup = { inline_keyboard: [[{ text: 'Открыть приложение', web_app: { url } }]] };
  return api('sendMessage', payload);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------- Тексты отчётов ---------- */

async function header() {
  return `<b>${esc(await getSetting('center_name', 'HAYANMI DETEILING'))}</b>`;
}

const KIND: Record<string, string> = { cash: 'наличными', card: 'на карту', terminal: 'через терминал', person: 'на руки' };

export async function dailyText(date = today()) {
  const p = await pnl(date, date);
  const bal = await balances();
  const cash = bal.filter((b) => b.kind === 'cash').reduce((a, b) => a + b.balance, 0);
  const lines = [
    await header(),
    `Итог дня, ${humanDate(date)}`,
    '',
    `Машин: <b>${p.cars}</b>`,
    `Выручка: <b>${money(p.revenue)}</b>`,
  ];
  if (p.received.length) lines.push('  ' + p.received.map((r) => `${money(r.amount)} ${KIND[r.kind] || ''}`).join(', '));
  lines.push(`Расходы: <b>${money(p.totalCosts)}</b>`);
  lines.push(`Прибыль: <b>${money(p.profit)}</b>`);
  lines.push('', `В кассе сейчас: ${money(cash)}`);
  return lines.join('\n');
}

export async function periodText(from: string, to: string, title: string, withPartners: boolean) {
  const p = await pnl(from, to);
  const lines = [
    await header(),
    title,
    '',
    `Машин: <b>${p.cars}</b>, средний чек ${money(p.avgCheck)}`,
    `Выручка: <b>${money(p.revenue)}</b>`,
    `Расходы: <b>${money(p.totalCosts)}</b>`,
  ];
  for (const c of p.byCategory.slice(0, 6)) lines.push(`  ${esc(c.name)}: ${money(c.amount)}`);
  if (p.salaries) lines.push(`  Зарплаты и авансы: ${money(p.salaries)}`);
  lines.push(`Прибыль: <b>${money(p.profit)}</b> (${p.margin}% от выручки)`);
  if (p.byService.length) {
    lines.push('', 'Больше всего принесли:');
    for (const s of p.byService.slice(0, 3)) lines.push(`  ${esc(s.name)}: ${money(s.amount)} (${s.count})`);
  }
  if (withPartners) {
    const pr = await partners();
    lines.push('', `Можно распределить сейчас: <b>${money(Math.max(0, pr.available))}</b>`);
    if (pr.stage === 'return') lines.push(`Осталось вернуть вложений: ${money(pr.totalOutstanding)}`);
    for (const r of pr.rows) {
      const parts = [];
      if (r.suggestReturn > 0) parts.push(`возврат ${money(r.suggestReturn)}`);
      if (r.suggestDividend > 0) parts.push(`доля ${money(r.suggestDividend)}`);
      if (parts.length) lines.push(`  ${esc(r.name)}: ${parts.join(' + ')}`);
    }
  }
  return lines.join('\n');
}

async function recipients() {
  return db.query<{ chat_id: number }>(`select chat_id from users where active and notify and chat_id is not null and role = 'partner'`);
}

async function broadcast(text: string) {
  for (const r of await recipients()) {
    try { await send(r.chat_id, text); } catch (e) { console.error('send failed', r.chat_id, (e as Error).message); }
  }
}

/** Ровно один раз на ключ, даже после перезапуска */
async function once(key: string) {
  const r = await one('insert into notifications_sent (key) values ($1) on conflict do nothing returning key', [key]);
  return !!r;
}

export function startScheduler() {
  const dailyHour = Number(process.env.DAILY_REPORT_HOUR || 21);
  const tick = async () => {
    try {
      const n = nowParts();
      if (n.hour === dailyHour && (await once(`daily:${n.date}`))) {
        await broadcast(await dailyText(n.date));
      }
      if (n.weekday === 'Mon' && n.hour === 9 && (await once(`weekly:${n.date}`))) {
        const from = addDays(weekStart(n.date), -7);
        const to = addDays(from, 6);
        await broadcast(await periodText(from, to, `Итог недели, ${humanDate(from)} — ${humanDate(to)}`, false));
      }
      if (n.day === 1 && n.hour === 9 && (await once(`monthly:${n.date}`))) {
        const prev = addDays(n.date, -1);
        const from = prev.slice(0, 8) + '01';
        await broadcast(await periodText(from, monthEnd(from), `Итог месяца: ${humanMonth(from)}`, true));
      }
    } catch (e) {
      console.error('scheduler', e);
    }
  };
  setInterval(tick, 60_000);
  setTimeout(tick, 5_000);
}

/* ---------- Обработка сообщений ---------- */

async function onMessage(msg: any) {
  const chatId = msg.chat?.id;
  const from = msg.from;
  if (!chatId || !from || msg.chat.type !== 'private') return;
  const text: string = (msg.text || '').trim();
  let user = await one<User>('select * from users where telegram_id = $1', [from.id]);
  if (!user && ownerIds().includes(from.id)) {
    user = await ensureUser({ id: from.id, name: [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || `ID ${from.id}`, username: from.username });
  }

  if (text.startsWith('/id')) {
    return send(chatId, `Ваш Telegram ID: <code>${from.id}</code>`, false);
  }

  if (!user || !user.active) {
    return send(chatId,
      `Здравствуйте! Это рабочее приложение центра.\n\nВаш Telegram ID: <code>${from.id}</code>\nПерешлите его партнёру, чтобы он добавил вас в «Настройки → Команда».`, false);
  }

  await db.query('update users set chat_id = $1 where id = $2', [chatId, user.id]);

  if (text.startsWith('/today')) return send(chatId, await dailyText());

  return send(chatId,
    `Привет, ${esc(user.name)}! Здесь учёт денег центра: заказы, расходы, касса и зарплаты.\n\nКаждый вечер в ${process.env.DAILY_REPORT_HOUR || 21}:00 пришлю итог дня, по понедельникам — итог недели, 1-го числа — итог месяца с делёжом прибыли.`);
}

export async function startBot() {
  if (!token()) {
    console.warn('BOT_TOKEN не задан — бот выключен');
    return;
  }
  try {
    await api('deleteWebhook', { drop_pending_updates: false });
    await api('setMyCommands', {
      commands: [
        { command: 'start', description: 'Открыть приложение' },
        { command: 'today', description: 'Итог за сегодня' },
        { command: 'id', description: 'Мой Telegram ID' },
      ],
    });
    const url = appUrl();
    if (url) await api('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Касса', web_app: { url } } });
    else console.warn('APP_URL не задан и RAILWAY_PUBLIC_DOMAIN не найден — кнопка мини-аппа не установлена');
  } catch (e) {
    console.error('bot init', (e as Error).message);
  }

  let offset = 0;
  const loop = async () => {
    for (;;) {
      try {
        const updates = await api<any[]>('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] });
        for (const u of updates) {
          offset = u.update_id + 1;
          if (u.message) await onMessage(u.message).catch((e) => console.error('onMessage', e));
        }
      } catch (e) {
        console.error('getUpdates', (e as Error).message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  };
  void loop();
}
