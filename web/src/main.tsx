import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiError, get, haptic, tg, type Ref } from './lib';
import { Ctx, Icon, Loader, Sheet, type AppCtx, type Route } from './ui';
import { Home } from './screens/Home';
import { Orders, OrderForm, Debts } from './screens/Orders';
import { Expenses, ExpenseForm } from './screens/Expenses';
import { Money, TransferForm } from './screens/Money';
import { Partners, InvestmentForm, PayoutForm } from './screens/Partners';
import { Salaries } from './screens/Salaries';
import { More, Journal, Report } from './screens/More';
import { Settings } from './screens/Settings';

type Tab = 'home' | 'orders' | 'expenses' | 'more';

const SCREENS: Record<string, (p: any) => JSX.Element> = {
  order: OrderForm, debts: Debts, expense: ExpenseForm, money: Money, transfer: TransferForm,
  partners: Partners, investment: InvestmentForm, payout: PayoutForm, salaries: Salaries,
  journal: Journal, report: Report, settings: Settings,
};

function App() {
  const [ref, setRef] = useState<Ref | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [stack, setStack] = useState<Route[]>([]);
  const [version, setVersion] = useState(0);
  const [toastMsg, setToast] = useState<{ text: string; err?: boolean } | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const reloadRef = useCallback(async () => {
    try { setRef(await get<Ref>('/api/ref')); setFatal(null); }
    catch (e) { setFatal((e as ApiError).message); }
  }, []);

  useEffect(() => {
    tg?.ready?.();
    tg?.expand?.();
    try { tg?.setHeaderColor?.('#1B1E1A'); tg?.setBackgroundColor?.('#1B1E1A'); } catch { /* старые клиенты */ }
    void reloadRef();
  }, [reloadRef]);

  const back = useCallback(() => setStack((s) => s.slice(0, -1)), []);

  // Системная кнопка «Назад» в Telegram
  useEffect(() => {
    const bb = tg?.BackButton;
    if (!bb) return;
    if (stack.length) { bb.show(); bb.onClick(back); } else bb.hide();
    return () => bb.offClick?.(back);
  }, [stack.length, back]);

  useEffect(() => { window.scrollTo(0, 0); }, [stack.length, tab]);

  const ctx: AppCtx | null = useMemo(() => ref && {
    ref, reloadRef,
    open: (r) => setStack((s) => [...s, r]),
    back,
    toast: (text, err) => {
      haptic(err ? 'error' : 'success');
      setToast({ text, err });
      window.clearTimeout((window as any).__toastT);
      (window as any).__toastT = window.setTimeout(() => setToast(null), 2600);
    },
    bump: () => setVersion((v) => v + 1),
    version,
  }, [ref, reloadRef, back, version]);

  if (fatal) {
    return (
      <div className="denied">
        <b style={{ fontSize: 18 }}>Не получилось открыть</b>
        <div className="muted">{fatal}</div>
        <button className="btn ghost small" onClick={reloadRef}>Попробовать снова</button>
      </div>
    );
  }
  if (!ctx) return <Loader />;

  const top = stack[stack.length - 1];
  const Top = top ? SCREENS[top.name] : null;

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        {Top ? <Top key={stack.length + top.name} {...(top.props || {})} /> : (
          <>
            {tab === 'home' && <Home />}
            {tab === 'orders' && <Orders />}
            {tab === 'expenses' && <Expenses />}
            {tab === 'more' && <More />}
          </>
        )}

        {!Top && (
          <nav className="nav" aria-label="Разделы">
            <div className="nav-group">
              {([['home', 'Сводка'], ['orders', 'Заказы'], ['expenses', 'Расходы'], ['more', 'Ещё']] as [Tab, string][]).map(([id, label]) => (
                <button key={id} className={tab === id ? 'on' : ''} aria-current={tab === id} onClick={() => { haptic(); setTab(id); }}>{label}</button>
              ))}
            </div>
            <button className="fab" aria-label="Добавить" onClick={() => { haptic(); setAddOpen(true); }}><Icon name="plus" /></button>
          </nav>
        )}

        <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Что добавить?">
          <button className="action" onClick={() => { setAddOpen(false); ctx.open({ name: 'order' }); }}>
            <span className="ico"><Icon name="car" /></span><span>Заказ<small>Машина, услуги, оплата</small></span>
          </button>
          <button className="action" onClick={() => { setAddOpen(false); ctx.open({ name: 'expense' }); }}>
            <span className="ico"><Icon name="wallet" /></span><span>Расход<small>Химия, аренда, покупки</small></span>
          </button>
          <button className="action" onClick={() => { setAddOpen(false); ctx.open({ name: 'transfer' }); }}>
            <span className="ico"><Icon name="swap" /></span><span>Перевод денег<small>Из кассы на карту, передать партнёру</small></span>
          </button>
        </Sheet>

        {toastMsg && <div className={'toast' + (toastMsg.err ? ' err' : '')} role="status">{toastMsg.text}</div>}
      </div>
    </Ctx.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
