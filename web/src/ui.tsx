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
  return (
    <div className="seg" role="tablist">
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
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="sheet-bg" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grip" />
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </>
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
