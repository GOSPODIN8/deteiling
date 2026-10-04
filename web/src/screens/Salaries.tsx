import { useState } from 'react';
import { del, get, money, monthLastDay, monthTitle, shiftMonth, shortDate, today } from '../lib';
import { ErrorBox, Icon, Loader, useApp, useLoad, useSubmit } from '../ui';

export function Salaries() {
  const { open, toast, bump } = useApp();
  const [month, setMonth] = useState(today().slice(0, 7));
  const { data, error, loading, reload } = useLoad(() => get(`/api/salaries?month=${month}`), [month]);
  const pays = useLoad(() => get(`/api/payouts?kinds=salary,advance&from=${month}-01&to=${monthLastDay(month)}`), [month]);
  const { run } = useSubmit();
  const rows = (data?.rows || []).filter((r: any) => r.accrued > 0 || r.advance > 0 || r.paid > 0 || r.salary_percent > 0 || r.salary_fixed > 0);

  return (
    <main className="screen">
      <h1 className="screen-title">Зарплаты</h1>
      <div className="month-nav">
        <button className="icon-btn" aria-label="Предыдущий месяц" onClick={() => setMonth(shiftMonth(month, -1))}><Icon name="left" /></button>
        <b>{monthTitle(month)}</b>
        <button className="icon-btn" aria-label="Следующий месяц" disabled={month >= today().slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}><Icon name="right" /></button>
      </div>
      {error && <ErrorBox text={error} onRetry={reload} />}
      {!data && loading && <Loader />}
      {data && !rows.length && (
        <div className="card empty">Схема зарплаты ещё не задана. Укажите оклад и/или процент с заказа в «Настройки → Команда».</div>
      )}
      {rows.map((r: any) => (
        <section key={r.user_id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="between">
            <b style={{ fontSize: 17 }}>{r.name}</b>
            <span className="small muted">{[r.salary_fixed ? `оклад ${money(r.salary_fixed)}` : '', r.salary_percent ? `${r.salary_percent}% с заказа` : ''].filter(Boolean).join(' + ')}</span>
          </div>
          <div className="between small"><span className="muted">Заказов</span><span className="num">{r.orders} на {money(r.revenueShare)}</span></div>
          {r.fixed > 0 && <div className="between small"><span className="muted">Оклад</span><span className="num">{money(r.fixed)}</span></div>}
          <div className="between small"><span className="muted">С заказов</span><span className="num">{money(r.fromPercent)}</span></div>
          <div className="between small"><span className="muted">Начислено</span><span className="num">{money(r.accrued)}</span></div>
          <div className="between small"><span className="muted">Авансы</span><span className="num">{r.advance ? "−" : ""}{money(r.advance)}</span></div>
          <div className="between small"><span className="muted">Выплачено</span><span className="num">{r.paid ? "−" : ""}{money(r.paid)}</span></div>
          <div className="between" style={{ paddingTop: 8, borderTop: '1px solid var(--line)' }}>
            <span>К выплате: <b className={'num ' + (r.due < 0 ? 'danger' : 'accent')}>{money(r.due)}</b></span>
            <div className="row">
              <button className="btn small ghost" onClick={() => open({ name: 'payout', props: { userId: r.user_id, kinds: ['advance', 'salary'], kind: 'advance' } })}>Аванс</button>
              <button className="btn small" disabled={r.due <= 0} onClick={() => open({ name: 'payout', props: { userId: r.user_id, kinds: ['salary', 'advance'], kind: 'salary', amount: r.due } })}>Выплатить</button>
            </div>
          </div>
        </section>
      ))}
      <div className="small muted" style={{ margin: '0 4px' }}>Если на машине работали несколько мастеров, сумма заказа делится между ними поровну.</div>

      <div className="section-head"><h2>Выплаты за месяц</h2></div>
      <section className="card tight">
        {pays.data && !pays.data.length && <div className="empty">Выплат не было</div>}
        {(pays.data || []).map((p: any) => (
          <div key={p.id} className="list-row">
            <span className="grow"><span style={{ fontWeight: 600 }}>{p.person}</span><br />
              <span className="small muted">{[shortDate(p.day), p.kind === 'advance' ? 'аванс' : 'зарплата', `из «${p.account}»`].join(', ')}</span></span>
            <b className="num">{money(p.amount)}</b>
            <button className="icon-btn" aria-label="Удалить выплату" onClick={() => run(async () => {
              if (!confirm('Удалить выплату?')) return;
              await del(`/api/payouts/${p.id}`); toast('Удалено'); bump();
            })}><Icon name="trash" size={16} /></button>
          </div>
        ))}
      </section>
    </main>
  );
}
