import { useState } from 'react';
import { get, money, plural, shortDate, today, weekday } from '../lib';
import { ErrorBox, Loader, Ring, Seg, useApp, useLoad } from '../ui';

type P = 'today' | 'week' | 'month';

export function Home() {
  const { ref, open } = useApp();
  const [period, setPeriod] = useState<P>('today');
  const { data, error, loading, reload } = useLoad(() => get(`/api/dashboard?period=${period}`), [period]);

  const p = data?.pnl;
  const t = today();
  const maxDay = p ? Math.max(1, ...p.byDay.map((d: any) => d.revenue)) : 1;
  const balances = (data?.balances || []).filter((b: any) => b.kind !== 'person' || Math.abs(b.balance) > 0.009);
  const totalMoney = (data?.balances || []).reduce((a: number, b: any) => a + b.balance, 0);

  return (
    <main className="screen">
      <div className="between" style={{ marginTop: 4 }}>
        <div>
          <div className="small muted">{ref.centerName}</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Привет, {ref.me.name.split(' ')[0]}</div>
        </div>
      </div>

      <Seg value={period} onChange={setPeriod} options={[{ id: 'today', label: 'Сегодня' }, { id: 'week', label: 'Неделя' }, { id: 'month', label: 'Месяц' }]} />

      {error && <ErrorBox text={error} onRetry={reload} />}
      {!data && loading && <Loader />}

      {p && (
        <>
          <section className="card ring-card" aria-label="Итоги периода">
            <Ring percent={p.revenue > 0 ? Math.max(0, p.margin) : 0} />
            <div className="kv">
              <div><span>Прибыль</span><b className={'big num' + (p.profit < 0 ? ' danger' : '')}>{money(p.profit)}</b></div>
              <div><span>Пришло</span><b className="num">{money(p.revenue)}</b></div>
              <div><span>Ушло</span><b className="num expense">{money(p.totalCosts)}</b></div>
            </div>
          </section>

          <div className="stats">
            <div className="stat"><b className="num">{p.cars}</b><span>{plural(p.cars, 'машина', 'машины', 'машин')}</span></div>
            <div className="stat"><b className="num">{money(p.avgCheck, false)}</b><span>средний чек</span></div>
          </div>

          {data.debt > 0 && (
            <button className="card between" style={{ border: 'none', textAlign: 'left' }} onClick={() => open({ name: 'debts' })}>
              <span><span className="small muted">Клиенты должны</span><br /><b className="num" style={{ fontSize: 18 }}>{money(data.debt)}</b></span>
              <span className="link">Посмотреть</span>
            </button>
          )}

          {p.byDay.length > 1 && (
            <section className="card">
              <h3>Выручка по дням</h3>
              <div className="bars" role="img" aria-label="Выручка по дням">
                {p.byDay.map((d: any) => (
                  <div key={d.day} className={'bar' + (d.day === t ? ' today' : '')} title={`${shortDate(d.day)}: ${money(d.revenue)}`}>
                    <i style={{ height: `${Math.round((d.revenue / maxDay) * 84) + 3}px` }} />
                    {p.byDay.length <= 8 && <span>{weekday(d.day)}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card tight">
            <div className="between" style={{ paddingTop: 10 }}>
              <h3 style={{ margin: 0 }}>Где деньги</h3>
              <button className="link" onClick={() => open({ name: 'money' })}>Перевести</button>
            </div>
            {balances.map((b: any) => (
              <div key={b.id} className="list-row">
                <span className="grow">{b.name}</span>
                <b className={'num' + (b.balance < 0 ? ' danger' : '')}>{money(b.balance)}</b>
              </div>
            ))}
            <div className="list-row"><span className="grow muted">Всего</span><b className="num">{money(totalMoney)}</b></div>
          </section>

          <div className="section-head"><h2>Последние заказы</h2></div>
          <section className="card tight">
            {!data.recent.length && <div className="empty">Заказов пока нет. Нажмите «+», чтобы добавить первый.</div>}
            {data.recent.map((o: any) => (
              <button key={o.id} className="list-row" onClick={() => open({ name: 'order', props: { id: o.id } })}>
                <span className="dot" style={{ background: o.status === 'in_work' ? 'var(--expense)' : undefined }} />
                <span className="grow">
                  <span className="ellipsis" style={{ display: 'block', fontWeight: 600 }}>{o.services || 'Заказ'}</span>
                  <span className="small muted">{[shortDate(o.day), o.plate || o.car, o.masters].filter(Boolean).join(', ')}</span>
                </span>
                <b className="num">{money(o.total)}</b>
              </button>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
