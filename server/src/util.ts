import { HttpError } from './http.js';

export const TZ = process.env.TZ_NAME || 'Asia/Dushanbe';

/** Текущая дата в часовом поясе центра, YYYY-MM-DD */
export function today(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Части текущего времени в часовом поясе центра */
export function nowParts(d: Date = new Date()) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    weekday: p.weekday, // Mon, Tue...
    day: Number(p.day),
  };
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Понедельник недели, в которую попадает дата */
export function weekStart(date: string): string {
  const d = new Date(date + 'T12:00:00Z');
  const wd = (d.getUTCDay() + 6) % 7; // 0 = пн
  return addDays(date, -wd);
}

export function monthStart(date: string): string {
  return date.slice(0, 8) + '01';
}

export function monthEnd(date: string): string {
  const d = new Date(date.slice(0, 8) + '01T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export function humanDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
export function humanMonth(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return `${MONTHS_NOM[m - 1]} ${y}`;
}

export function money(n: number): string {
  const r = Math.round(n * 100) / 100;
  const [i, f] = Math.abs(r).toFixed(2).split('.');
  const s = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (r < 0 ? '−' : '') + s + (f !== '00' ? ',' + f : '') + ' с.';
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/* ---------- Валидация входных данных ---------- */

type Obj = Record<string, unknown>;

export function body(x: unknown): Obj {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new HttpError(400, 'Ожидался JSON-объект');
  return x as Obj;
}

export function str(o: Obj, key: string, opts: { req?: boolean; max?: number } = {}): string | null {
  const v = o[key];
  if (v === undefined || v === null || v === '') {
    if (opts.req) throw new HttpError(400, `Поле «${key}» обязательно`);
    return null;
  }
  if (typeof v !== 'string' && typeof v !== 'number') throw new HttpError(400, `Поле «${key}» должно быть строкой`);
  const s = String(v).trim();
  if (opts.req && !s) throw new HttpError(400, `Поле «${key}» обязательно`);
  if (s.length > (opts.max ?? 500)) throw new HttpError(400, `Поле «${key}» слишком длинное`);
  return s || null;
}

export function num(o: Obj, key: string, opts: { req?: boolean; min?: number; max?: number } = {}): number | null {
  const v = o[key];
  if (v === undefined || v === null || v === '') {
    if (opts.req) throw new HttpError(400, `Укажите «${key}»`);
    return null;
  }
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').replace(/\s/g, ''));
  if (!Number.isFinite(n)) throw new HttpError(400, `«${key}» должно быть числом`);
  if (opts.min !== undefined && n < opts.min) throw new HttpError(400, `«${key}» не может быть меньше ${opts.min}`);
  if (opts.max !== undefined && n > opts.max) throw new HttpError(400, `«${key}» слишком большое`);
  return round2(n);
}

export function int(o: Obj, key: string, opts: { req?: boolean } = {}): number | null {
  const n = num(o, key, opts);
  if (n === null) return null;
  if (!Number.isInteger(n)) throw new HttpError(400, `«${key}» должно быть целым`);
  return n;
}

export function date(o: Obj, key: string, opts: { req?: boolean } = {}): string | null {
  const v = o[key];
  if (v === undefined || v === null || v === '') {
    if (opts.req) throw new HttpError(400, `Укажите дату`);
    return null;
  }
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, 'Дата в формате ГГГГ-ММ-ДД');
  const d = new Date(v + 'T00:00:00Z');
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw new HttpError(400, 'Неверная дата');
  return v;
}

export function bool(o: Obj, key: string): boolean | null {
  const v = o[key];
  if (v === undefined || v === null) return null;
  return v === true || v === 'true' || v === 1;
}

export function arr(o: Obj, key: string): unknown[] {
  const v = o[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new HttpError(400, `«${key}» должно быть списком`);
  return v;
}

export function oneOf<T extends string>(o: Obj, key: string, values: readonly T[], def?: T): T {
  const v = o[key];
  if ((v === undefined || v === null || v === '') && def !== undefined) return def;
  if (typeof v !== 'string' || !values.includes(v as T)) throw new HttpError(400, `Неверное значение «${key}»`);
  return v as T;
}

/** Период из query: from/to или preset (today|week|month) */
export function period(query: URLSearchParams): { from: string; to: string } {
  const t = today();
  const preset = query.get('period');
  const from = query.get('from');
  const to = query.get('to');
  const valid = (s: string | null) => {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  };
  if (valid(from) && valid(to)) return { from: from!, to: to! };
  if (preset === 'today') return { from: t, to: t };
  if (preset === 'week') return { from: weekStart(t), to: t };
  if (preset === 'all') return { from: '2000-01-01', to: t };
  return { from: monthStart(t), to: t };
}
