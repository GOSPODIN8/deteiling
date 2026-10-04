import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Ref } from './lib';

/* ---------- Глобальный контекст приложения ---------- */

export type Route = { name: string; props?: any };

export interface AppCtx {
  ref: Ref;
  reloadRef: () => Promise<void>;
  open: (r: Route) => void;
  back: () => void;
  toast: (text: string, err?: boolean) => void;
  bump: () => void;       // сообщить, что данные изменились
  version: number;        // номер изменений — экраны перезагружают данные
}

export const Ctx = createContext<AppCtx>(null as any);
export const useApp = () => useContext(Ctx);

/** Загрузка данных с перезагрузкой при изменениях */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const { version } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const load = useCallback(() => {
    const n = ++seq.current;
    setLoading(true);
    fn().then((d) => { if (n === seq.current) { setData(d); setError(null); } })
      .catch((e) => { if (n === seq.current) setError(e.message); })
      .finally(() => { if (n === seq.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load, version]);
  return { data, error, loading, reload: load };
}

/* ---------- Компоненты ---------- */

export function Loader() { return <div className="loader"><i /></div>; }

export function ErrorBox({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="card empty">
      <div>{text}</div>
      {onRetry && <button className="link" onClick={onRetry}>Повторить</button>}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  const idx = Math.max(0, options.findIndex((o) => o.id === value));
  const n = options.length;
  return (
    <div className="seg" role="tablist" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      <span className="seg-ind" aria-hidden="true" style={{ width: `calc((100% - 8px) / ${n})`, transform: `translateX(${idx * 100}%)` }} />
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={o.id === value} className={o.id === value ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string | number>({ value, options, onChange, multi }: {
  value: T | T[] | null; options: { id: T; label: string }[]; onChange: (v: any) => void; multi?: boolean;
}) {
  const sel = (id: T) => (multi ? (value as T[]).includes(id) : value === id);
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={String(o.id)} type="button" aria-pressed={sel(o.id)} className={'chip' + (sel(o.id) ? ' on' : '')}
          onClick={() => {
            if (!multi) return onChange(o.id);
            const arr = value as T[];
            onChange(arr.includes(o.id) ? arr.filter((x) => x !== o.id) : [...arr, o.id]);
          }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return <div className="field"><label htmlFor={htmlFor}>{label}</label>{children}</div>;
}

export function MoneyInput({ value, onChange, id, big, placeholder }: { value: string; onChange: (v: string) => void; id?: string; big?: boolean; placeholder?: string }) {
  return (
    <input id={id} className={'input num' + (big ? ' big' : '')} inputMode="decimal" placeholder={placeholder ?? '0'}
      value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))} />
  );
}

export const toNum = (s: string) => Number(String(s).replace(',', '.').replace(/\s/g, '')) || 0;

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const last = useRef<{ title?: string; children: ReactNode }>({ title, children });
  if (open) last.current = { title, children };

  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); return; }
    if (!mounted) return;
    setClosing(true);
    const t = setTimeout(() => { setMounted(false); setClosing(false); }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const requestClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, requestClose]);

  if (!mounted) return null;
  const c = last.current;
  return (
    <>
      <div className={'sheet-bg' + (closing ? ' closing' : '')} onClick={requestClose} />
      <div className={'sheet' + (closing ? ' closing' : '')} role="dialog" aria-modal="true" aria-label={c.title}>
        <div className="sheet-grip" />
        {c.title && <h3>{c.title}</h3>}
        {c.children}
      </div>
    </>
  );
}

/** Плавный счётчик для крупных чисел */
export function useCountUp(value: number, ms = 650) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = from.current;
    if (reduce || start === value) { setShown(value); from.current = value; return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(start + (value - start) * e);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value, ms]);
  return shown;
}

/* ---------- Логотип HAYANMI ---------- */
export const LOGO_TOP = 'M0 0H354V242H545V0H900V289L450 434L0 289Z';
export const LOGO_BOTTOM = 'M0 373L450 515L900 373V881H545V663H354V881H0Z';
export const LOGO_GAP = 'M0 289L450 434L900 289V373L450 515L0 373Z';

export function Logo({ size = 28, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size * 881 / 900} viewBox="0 0 900 881" aria-hidden="true">
      <path d={LOGO_TOP} fill={color} /><path d={LOGO_BOTTOM} fill={color} />
    </svg>
  );
}

/** Интро при открытии: две половины знака сходятся, по зазору пробегает блик */
export function Intro({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const [minDone, setMinDone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => setMinDone(true), reduce ? 200 : 1700);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!ready || !minDone) return;
    setLeaving(true);
    const t = setTimeout(onDone, 450);
    return () => clearTimeout(t);
  }, [ready, minDone, onDone]);
  return (
    <div className={'intro' + (leaving ? ' out' : '')} aria-label="HAYANMI DETEILING">
      <svg className="intro-logo" width="104" height="102" viewBox="0 0 900 881" aria-hidden="true">
        <defs>
          <linearGradient id="shine" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0" />
            <stop offset="0.5" stopColor="#F4F7EF" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
          <clipPath id="gapclip"><path d={LOGO_GAP} /></clipPath>
        </defs>
        <path className="intro-top" d={LOGO_TOP} fill="var(--text)" />
        <path className="intro-bottom" d={LOGO_BOTTOM} fill="var(--text)" />
        <g clipPath="url(#gapclip)">
          <rect className="intro-shine" x="-400" y="250" width="400" height="300" fill="url(#shine)" />
        </g>
      </svg>
      <div className="intro-name">HAYANMI</div>
      <div className="intro-sub">DETEILING</div>
    </div>
  );
}

export function Ring({ percent }: { percent: number }) {
  const r = 70, C = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className="ring">
      <svg width="132" height="132" viewBox="0 0 160 160" aria-hidden="true">
        <circle cx="80" cy="80" r={r} fill="none" stroke="#33392E" strokeWidth="14" />
        {p > 0 && <circle className="val" cx="80" cy="80" r={r} fill="none" stroke="var(--accent)" strokeWidth="14" strokeLinecap="round"
          strokeDasharray={`${(C * p) / 100} ${C}`} transform="rotate(-90 80 80)" />}
      </svg>
      <div className="center"><b>{percent}%</b><span>остаётся</span></div>
    </div>
  );
}

export function Icon({ name, size = 22 }: { name: 'plus' | 'car' | 'wallet' | 'swap' | 'trash' | 'camera' | 'x' | 'left' | 'right' | 'receipt'; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (name) {
    case 'plus': return <svg {...p} strokeWidth={2.5}><path d="M12 5v14M5 12h14" /></svg>;
    case 'car': return <svg {...p}><path d="M5 17h14M6 17v2M18 17v2M4 13l2-5h12l2 5v4H4z" /></svg>;
    case 'wallet': return <svg {...p}><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18M16 15h2" /></svg>;
    case 'swap': return <svg {...p}><path d="M7 7h12l-3-3M17 17H5l3 3" /></svg>;
    case 'trash': return <svg {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>;
    case 'camera': return <svg {...p}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>;
    case 'x': return <svg {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>;
    case 'left': return <svg {...p}><path d="M15 5l-7 7 7 7" /></svg>;
    case 'right': return <svg {...p}><path d="M9 5l7 7-7 7" /></svg>;
    case 'receipt': return <svg {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" /></svg>;
  }
}

/** Кнопка с блокировкой на время запроса */
export function useSubmit() {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e: any) { toast(e.message || 'Ошибка', true); } finally { setBusy(false); }
  };
  return { busy, run };
}
