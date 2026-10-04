/* Общие функции: запросы к серверу, форматирование, типы */

export const tg: any = (window as any).Telegram?.WebApp;

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (tg?.initData) h['X-Telegram-Init-Data'] = tg.initData;
  const dev = new URLSearchParams(location.search).get('dev');
  if (dev) h['X-Dev-User'] = dev;
  return h;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Нет связи с сервером. Проверьте интернет.');
  }
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(r.status, data?.error || 'Ошибка сервера');
  return data as T;
}
export const get = <T = any>(p: string) => api<T>('GET', p);
export const post = <T = any>(p: string, b?: unknown) => api<T>('POST', p, b ?? {});
export const put = <T = any>(p: string, b?: unknown) => api<T>('PUT', p, b ?? {});
export const del = <T = any>(p: string) => api<T>('DELETE', p);

export async function fetchImage(path: string): Promise<string> {
  const r = await fetch(path, { headers: headers() });
  if (!r.ok) throw new Error('Не удалось загрузить фото');
  return URL.createObjectURL(await r.blob());
}

/** Сжатие фото чека перед отправкой */
export function compressImage(file: File, max = 1400, quality = 0.72): Promise<{ mime: string; data: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/jpeg', quality);
      URL.revokeObjectURL(url);
      resolve({ mime: 'image/jpeg', data: dataUrl.split(',')[1] });
    };
    img.onerror = () => reject(new Error('Не удалось прочитать фото'));
    img.src = url;
  });
}

export function money(n: number | string | null | undefined, withUnit = true): string {
  const v = Math.round(Number(n || 0) * 100) / 100;
  const [i, f] = Math.abs(v).toFixed(2).split('.');
  const s = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (v < 0 ? '−' : '') + s + (f !== '00' ? ',' + f : '') + (withUnit ? ' с.' : '');
}

export function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dushanbe', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function shortDate(d: string): string {
  if (!d) return '';
  const t = today();
  if (d === t) return 'Сегодня';
  const y = new Date(Date.parse(t) - 86400000).toISOString().slice(0, 10);
  if (d === y) return 'Вчера';
  const [, m, day] = d.slice(0, 10).split('-').map(Number);
  return `${day} ${MONTHS[m - 1]}`;
}
export function weekday(d: string) { return WD[new Date(d + 'T12:00:00Z').getUTCDay()]; }
export function monthTitle(ym: string) { const [y, m] = ym.split('-').map(Number); return `${MONTHS_NOM[m - 1]} ${y}`; }
export function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
export function dateTime(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Dushanbe', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
}

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 10, b = Math.abs(n) % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}

export function haptic(type: 'success' | 'error' | 'light' = 'light') {
  try {
    if (type === 'light') tg?.HapticFeedback?.impactOccurred('light');
    else tg?.HapticFeedback?.notificationOccurred(type);
  } catch { /* вне Telegram */ }
}

/* ---------- Типы ---------- */
export interface Me { id: number; name: string; role: 'partner' | 'master'; telegram_id: number }
export interface UserRef extends Me { username: string | null; share_percent: number; salary_fixed: number; salary_percent: number; active: boolean; notify: boolean; bot_started: boolean }
export interface Account { id: number; name: string; kind: 'cash' | 'card' | 'terminal' | 'person'; user_id: number | null; active: boolean; balance?: number }
export interface Service { id: number; name: string; price_sedan: number | null; price_cross: number | null; price_jeep: number | null; active: boolean }
export interface Category { id: number; name: string; active: boolean }
export interface Ref { me: Me; users: UserRef[]; accounts: Account[]; services: Service[]; categories: Category[]; centerName: string }

export const BODY: { id: 'sedan' | 'cross' | 'jeep' | 'other'; label: string }[] = [
  { id: 'sedan', label: 'Седан' }, { id: 'cross', label: 'Кроссовер' }, { id: 'jeep', label: 'Джип' }, { id: 'other', label: 'Другое' },
];

export function hintPrice(s: Service, body: string | null): number | null {
  if (body === 'cross') return s.price_cross ?? s.price_sedan;
  if (body === 'jeep') return s.price_jeep ?? s.price_cross ?? s.price_sedan;
  return s.price_sedan;
}

export function monthLastDay(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
