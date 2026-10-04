import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiError, get, haptic, tg, type Ref } from './lib';
import { useRef } from 'react';
import { Ctx, Icon, Intro, Sheet, type AppCtx, type Route } from './ui';
import { Home } from './screens/Home';
import { Orders, OrderForm, Debts } from './screens/Orders';
import { Expenses, ExpenseForm } from './screens/Expenses';
import { Money, TransferForm } from './screens/Money';
import { Partners, InvestmentForm, PayoutForm } from './screens/Partners';
import { Salaries } from './screens/Salaries';
import { More, Journal, Report } from './screens/More';
import { Settings } from './screens/Settings';

type Tab = 'home' | 'orders' | 'expenses' | 'more';
const NAV: [Tab, string][] = [['home', 'Сводка'], ['orders', 'Заказы'], ['expenses', 'Расходы'], ['more', 'Ещё']];

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
  const [toastMsg, setToast] = useState<{ text: string; err?: boolean; leaving?: boolean } | null>(null);
  const [introDone, setIntroDone] = useState(false);
  const dir = useRef<'fwd' | 'back'>('fwd');
  const finishIntro = useCallback(() => setIntroDone(true), []);
  const [addOpen, setAddOpen] = useState(false);

  const reloadRef = useCallback(async () => {
    try { setRef(await get<Ref>('/api/ref')); setFatal(null); }
    catch (e) { setFatal((e as ApiError).message); }
  }, []);

  useEffect(() => {
    tg?.ready?.();
    tg?.expand?.();
    try {
      tg?.setHeaderColor?.('#1B1E1A');
      tg?.setBackgroundColor?.('#1B1E1A');
      tg?.setBottomBarColor?.('#1B1E1A');
      // Во весь экран — только на телефонах (Telegram 8.0+); на компьютере окно не трогаем
      const mobile = ['ios', 'android', 'android_x'].includes(tg?.platform);
      if (mobile && tg?.isVersionAtLeast?.('8.0') && !tg.isFullscreen) tg.requestFullscreen();
      // Свайп вниз не закрывает приложение, пока листаете списки
      if (tg?.isVersionAtLeast?.('7.7')) tg.disableVerticalSwipes();
    } catch { /* старые клиенты Telegram */ }
    void reloadRef();
  }, [reloadRef]);

  const stackWasOpen = useRef(false);
  useEffect(() => { stackWasOpen.current = stack.length > 0; });
  const back = useCallback(() => { dir.current = 'back'; setStack((s) => s.slice(0, -1)); }, []);

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
    open: (r) => { dir.current = 'fwd'; setStack((s) => [...s, r]); },
    back,
    toast: (text, err) => {
      haptic(err ? 'error' : 'success');
      setToast({ text, err });
      const w = window as any;
      window.clearTimeout(w.__toastT); window.clearTimeout(w.__toastT2);
      w.__toastT = window.setTimeout(() => setToast((t) => t && { ...t, leaving: true }), 2400);
      w.__toastT2 = window.setTimeout(() => setToast(null), 2650);
    },
    bump: () => setVersion((v) => v + 1),
    version,
  }, [ref, reloadRef, back, version]);

  if (fatal) {
    return (
      <div className="denied page-fwd">
        <b style={{ fontSize: 18 }}>Не получилось открыть</b>
        <div className="muted">{fatal}</div>
        <button className="btn ghost small" onClick={reloadRef}>Попробовать снова</button>
      </div>
    );
  }
  if (!ctx || !introDone) return <Intro ready={!!ctx} onDone={finishIntro} />;

  const top = stack[stack.length - 1];
  const goTab = (id: Tab) => { if (id === tab) return; haptic(); dir.current = 'fwd'; setTab(id); };
  const Top = top ? SCREENS[top.name] : null;

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        {Top ? (
          <div key={'s' + stack.length + top.name} className={dir.current === 'fwd' ? 'page-fwd' : 'page-back'}>
            <Top {...(top.props || {})} />
          </div>
        ) : (
          <div key={'t' + tab + stack.length} className={dir.current === 'back' && stackWasOpen.current ? 'page-back' : 'tab-in'}>
            {tab === 'home' && <Home />}
            {tab === 'orders' && <Orders />}
            {tab === 'expenses' && <Expenses />}
            {tab === 'more' && <More />}
          </div>
        )}

        <nav className={'nav' + (Top ? ' hidden' : '')} aria-label="Разделы">
          <div className="nav-bar">
            {NAV.slice(0, 2).map(([id, label]) => (
              <button key={id} className={tab === id ? 'on' : ''} aria-current={tab === id} onClick={() => goTab(id)}>{label}</button>
            ))}
            <div className="fab-slot">
              <button className={'fab' + (addOpen ? ' open' : '')} aria-label="Добавить" onClick={() => { haptic(); setAddOpen(true); }}><Icon name="plus" size={26} /></button>
            </div>
            {NAV.slice(2).map(([id, label]) => (
              <button key={id} className={tab === id ? 'on' : ''} aria-current={tab === id} onClick={() => goTab(id)}>{label}</button>
            ))}
          </div>
        </nav>

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

        {toastMsg && <div className={'toast' + (toastMsg.err ? ' err' : '') + (toastMsg.leaving ? ' leaving' : '')} role="status">{toastMsg.text}</div>}
      </div>
    </Ctx.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
