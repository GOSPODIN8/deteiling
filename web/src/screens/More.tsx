import { useState } from 'react';
import { dateTime, get, money, monthLastDay, monthTitle, shiftMonth, today } from '../lib';
import { ErrorBox, Icon, Loader, useApp, useLoad } from '../ui';

const ITEMS: { name: string; title: string; sub: string }[] = [
  { name: 'money', title: 'Деньги и касса', sub: 'Остатки и переводы между счетами' },
  { name: 'report', title: 'Отчёт за месяц', sub: 'Выручка, расходы, прибыль, услуги' },
  { name: 'partners', title: 'Партнёры', sub: 'Вложения, возврат и делёж прибыли' },
  { name: 'salaries', title: 'Зарплаты', sub: 'Начисления, авансы, выплаты' },
  { name: 'debts', title: 'Долги клиентов', sub: 'Неоплаченные заказы' },
  { name: 'journal', title: 'Журнал', sub: 'Кто что добавил и изменил' },
  { name: 'settings', title: 'Настройки', sub: 'Команда, услуги, категории, счета' },
];

export function More() {
  const { open, ref } = useApp();
  return (
    <main className="screen">
      <h1 className="screen-title">Ещё</h1>
      <section className="card tight">
        {ITEMS.map((i) => (
          <button key={i.name} className="list-row" onClick={() => open({ name: i.name })}>
            <span className="grow"><span style={{ fontWeight: 600 }}>{i.title}</span><br /><span className="small muted">{i.sub}</span></span>
            <span className="muted"><Icon name="right" size={18} /></span>
          </button>
        ))}
      </section>
      <div className="small muted" style={{ textAlign: 'center' }}>{ref.centerName}<br />Вы вошли как {ref.me.name}</div>
    </main>
  );
}

const ACTION: Record<string, string> = { create: 'добавил', update: 'изменил', delete: 'удалил' };

export function Journal() {
  const { data, error, loading, reload } = useLoad(() => get('/api/audit?limit=200'));
  return (
    <main className="screen">
      <h1 className="screen-title">Журнал</h1>
      <p className="screen-sub">Последние 200 действий</p>
      {error && <ErrorBox text={error} onRetry={reload} />}
      {!data && loading && <Loader />}
      <section className="card tight">
        {data && !data.length && <div className="empty">Пока пусто</div>}
        {(data || []).map((l: any) => (
          <div key={l.id} className="list-row" style={{ alignItems: 'flex-start' }}>
            <span className="dot" style={{ marginTop: 7, background: l.action === 'delete' ? 'var(--danger)' : l.action === 'update' ? 'var(--expense)' : undefined }} />
            <span className="grow">
              <span>{l.summary}</span><br />
              <span className="small muted">{dateTime(l.at)}, {l.author || 'система'} {ACTION[l.action] || ''}</span>
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}

const KIND: Record<string, string> = { cash: 'Наличными', card: 'Переводом на карту', terminal: 'Через терминал', person: 'На руки партнёрам' };

export function Report() {
  const [month, setMonth] = useState(today().slice(0, 7));
  const to = month === today().slice(0, 7) ? today() : monthLastDay(month);
  const { data: p, error, loading, reload } = useLoad(() => get(`/api/report?from=${month}-01&to=${to}`), [month]);

  return (
    <main className="screen">
      <h1 className="screen-title">Отчёт</h1>
      <div className="month-nav">
        <button className="icon-btn" aria-label="Предыдущий месяц" onClick={() => setMonth(shiftMonth(month, -1))}><Icon name="left" /></button>
        <b>{monthTitle(month)}</b>
        <button className="icon-btn" aria-label="Следующий месяц" disabled={month >= today().slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}><Icon name="right" /></button>
      </div>
      {error && <ErrorBox text={error} onRetry={reload} />}
      {!p && loading && <Loader />}
      {p && (
        <>
          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="between"><span>Выручка</span><b className="num">{money(p.revenue)}</b></div>
            <div className="between"><span>Расходы</span><b className="num expense">−{money(p.expenses)}</b></div>
            <div className="between"><span>Зарплаты и авансы</span><b className="num expense">−{money(p.salaries)}</b></div>
            <div className="between" style={{ paddingTop: 10, borderTop: '1px solid var(--line)' }}>
              <span style={{ fontWeight: 600 }}>Прибыль</span>
              <b className={'num ' + (p.profit < 0 ? 'danger' : 'accent')} style={{ fontSize: 22 }}>{money(p.profit)}</b>
            </div>
            <div className="small muted">{p.cars} машин, средний чек {money(p.avgCheck)}, рентабельность {p.margin}%</div>
          </section>

          <section className="card">
            <h3>Услуги</h3>
            {!p.byService.length && <div className="muted small">Нет заказов</div>}
            {p.byService.map((s: any) => (
              <div key={s.name} className="between small" style={{ padding: '6px 0' }}><span>{s.name} <span className="muted">×{s.count}</span></span><span className="num">{money(s.amount)}</span></div>
            ))}
          </section>

          <section className="card">
            <h3>Расходы по статьям</h3>
            {!p.byCategory.length && <div className="muted small">Расходов не было</div>}
            {p.byCategory.map((c: any) => (
              <div key={c.name} className="between small" style={{ padding: '6px 0' }}><span>{c.name}</span><span className="num">{money(c.amount)}</span></div>
            ))}
          </section>

          <section className="card">
            <h3>Как платили клиенты</h3>
            {!p.received.length && <div className="muted small">Оплат не было</div>}
            {p.received.map((r: any) => (
              <div key={r.kind} className="between small" style={{ padding: '6px 0' }}><span>{KIND[r.kind] || r.kind}</span><span className="num">{money(r.amount)}</span></div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
