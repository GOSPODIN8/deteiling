import { useState } from 'react';
import { del, get, money, post, shortDate, today } from '../lib';
import { Chips, ErrorBox, Field, Icon, Loader, MoneyInput, Seg, toNum, useApp, useLoad, useSubmit } from '../ui';
import { accLabel } from './Orders';

const KIND_LABEL: Record<string, string> = { salary: 'Зарплата', advance: 'Аванс', return: 'Возврат вложений', dividend: 'Доля прибыли' };

export function Partners() {
  const { open, ref, toast, bump } = useApp();
  const sum = useLoad(() => get('/api/partners'));
  const inv = useLoad(() => get('/api/investments'));
  const pay = useLoad(() => get('/api/payouts?kinds=return,dividend'));
  const { run } = useSubmit();
  const d = sum.data;

  return (
    <main className="screen">
      <h1 className="screen-title">Партнёры</h1>
      <p className="screen-sub">Сначала прибыль возвращает вложения, потом делится по долям</p>
      {sum.error && <ErrorBox text={sum.error} onRetry={sum.reload} />}
      {!d && sum.loading && <Loader />}
      {d && (
        <>
          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div><span className="small muted">Можно распределить сейчас</span>
              <div className={'num' + (d.available < 0 ? ' danger' : ' accent')} style={{ fontSize: 28, fontWeight: 700 }}>{money(d.available)}</div></div>
            <div className="between small"><span className="muted">Прибыль за всё время</span><span className="num">{money(d.profitAll)}</span></div>
            <div className="between small"><span className="muted">Уже выплачено партнёрам</span><span className="num">{money(d.distributed)}</span></div>
            <div className="between small"><span className="muted">Всего вложено</span><span className="num">{money(d.totalInvested)}</span></div>
            <div className="between small"><span className="muted">Осталось вернуть вложений</span><span className="num">{money(d.totalOutstanding)}</span></div>
            {d.totalInvested > 0 && (
              <div className="meter ok" aria-label="Вложения возвращены"><i style={{ width: `${Math.min(100, Math.round(((d.totalInvested - d.totalOutstanding) / d.totalInvested) * 100))}%` }} /></div>
            )}
            <div className="small muted">
              {d.stage === 'return' ? 'Сейчас этап возврата вложений: свободная прибыль идёт на возврат, пропорционально невозвращённым суммам.'
                : d.sharesConfigured ? 'Вложения возвращены. Прибыль делится по долям из настроек.'
                : 'Вложения возвращены. Доли не заданы — пока делим поровну. Задайте доли в «Настройки → Команда».'}
            </div>
          </section>

          {d.rows.map((p: any) => (
            <section key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="between"><b style={{ fontSize: 17 }}>{p.name}</b><span className="badge">доля {p.share}%</span></div>
              <div className="between small"><span className="muted">Вложил</span><span className="num">{money(p.invested)}</span></div>
              <div className="between small"><span className="muted">Вернули</span><span className="num">{money(p.returned)}</span></div>
              <div className="between small"><span className="muted">Получил долю прибыли</span><span className="num">{money(p.dividends)}</span></div>
              {(p.suggestReturn > 0 || p.suggestDividend > 0) && (
                <div className="between" style={{ paddingTop: 8, borderTop: '1px solid var(--line)' }}>
                  <span className="small">Положено сейчас: <b className="num accent">{money(p.suggestReturn + p.suggestDividend)}</b></span>
                  <button className="btn small" onClick={() => open({ name: 'payout', props: {
                    userId: p.id, kinds: ['return', 'dividend'],
                    kind: p.suggestReturn > 0 ? 'return' : 'dividend',
                    amount: p.suggestReturn > 0 ? p.suggestReturn : p.suggestDividend,
                  } })}>Выплатить</button>
                </div>
              )}
            </section>
          ))}
        </>
      )}

      <div className="two">
        <button className="btn ghost" onClick={() => open({ name: 'investment' })}>Вложение</button>
        <button className="btn ghost" onClick={() => open({ name: 'payout', props: { kinds: ['return', 'dividend'], kind: 'dividend' } })}>Выплата</button>
      </div>

      <div className="section-head"><h2>Вложения</h2></div>
      <section className="card tight">
        {inv.data && !inv.data.length && <div className="empty">Добавьте, кто сколько вложил в запуск — от этого считается возврат.</div>}
        {(inv.data || []).map((i: any) => (
          <div key={i.id} className="list-row">
            <span className="grow"><span style={{ fontWeight: 600 }}>{i.partner}</span><br />
              <span className="small muted">{[shortDate(i.day), i.comment, i.account && `в «${i.account}»`].filter(Boolean).join(', ')}</span></span>
            <b className="num">{money(i.amount)}</b>
            <button className="icon-btn" aria-label="Удалить вложение" onClick={() => run(async () => {
              if (!confirm('Удалить вложение?')) return;
              await del(`/api/investments/${i.id}`); toast('Удалено'); bump();
            })}><Icon name="trash" size={16} /></button>
          </div>
        ))}
      </section>

      <div className="section-head"><h2>Выплаты партнёрам</h2></div>
      <section className="card tight">
        {pay.data && !pay.data.length && <div className="empty">Выплат пока не было</div>}
        {(pay.data || []).map((p: any) => (
          <div key={p.id} className="list-row">
            <span className="grow"><span style={{ fontWeight: 600 }}>{p.person}</span><br />
              <span className="small muted">{[shortDate(p.day), KIND_LABEL[p.kind], `из «${p.account}»`].join(', ')}</span></span>
            <b className="num">{money(p.amount)}</b>
            <button className="icon-btn" aria-label="Удалить выплату" onClick={() => run(async () => {
              if (!confirm('Удалить выплату?')) return;
              await del(`/api/payouts/${p.id}`); toast('Удалено'); bump();
            })}><Icon name="trash" size={16} /></button>
          </div>
        ))}
      </section>
      {ref.users.filter((u) => u.role === 'partner').length < 2 && (
        <div className="small muted">Добавьте остальных партнёров в «Настройки → Команда».</div>
      )}
    </main>
  );
}

export function InvestmentForm() {
  const { ref, back, toast, bump } = useApp();
  const partners = ref.users.filter((u) => u.active && u.role === 'partner');
  const accounts = ref.accounts.filter((a) => a.active);
  const [userId, setUserId] = useState<number>(ref.me.id);
  const [amount, setAmount] = useState('');
  const [acc, setAcc] = useState<number | 0>(0);
  const [comment, setComment] = useState('');
  const [day, setDay] = useState(today());
  const { busy, run } = useSubmit();

  return (
    <main className="screen">
      <h1 className="screen-title">Вложение партнёра</h1>
      <Field label="Кто вложил"><Chips value={userId} onChange={setUserId} options={partners.map((u) => ({ id: u.id, label: u.name }))} /></Field>
      <Field label="Сумма" htmlFor="amt"><MoneyInput id="amt" big value={amount} onChange={setAmount} /></Field>
      <Field label="Куда попали деньги">
        <Chips value={acc} onChange={setAcc} options={[{ id: 0, label: 'Сразу потрачены на запуск' }, ...accounts.map((a) => ({ id: a.id, label: accLabel(a) }))]} />
      </Field>
      <div className="small muted" style={{ marginTop: -8 }}>«Сразу потрачены» — если партнёр сам купил оборудование или оплатил ремонт. Тогда в кассе денег не прибавится.</div>
      <Field label="На что" htmlFor="cm"><input id="cm" className="input" placeholder="Аппарат высокого давления, ремонт бокса" value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      <div className="two">
        <Field label="Дата" htmlFor="d"><input id="d" type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
        <div />
      </div>
      <button className="btn" disabled={busy} onClick={() => run(async () => {
        const n = toNum(amount);
        if (n <= 0) throw new Error('Впишите сумму');
        await post('/api/investments', { user_id: userId, amount: n, account_id: acc || null, comment, day });
        toast('Вложение сохранено'); bump(); back();
      })}>Сохранить вложение</button>
      <button className="btn text" onClick={back}>Отмена</button>
    </main>
  );
}

export function PayoutForm({ userId, kinds = ['salary', 'advance'], kind: k0, amount: a0 }: { userId?: number; kinds?: string[]; kind?: string; amount?: number }) {
  const { ref, back, toast, bump } = useApp();
  const people = ref.users.filter((u) => u.active && (kinds.includes('return') || kinds.includes('dividend') ? u.role === 'partner' : true));
  const accounts = ref.accounts.filter((a) => a.active);
  const [uid, setUid] = useState<number>(userId ?? people[0]?.id);
  const [kind, setKind] = useState<string>(k0 ?? kinds[0]);
  const [amount, setAmount] = useState(a0 ? String(Math.round(a0 * 100) / 100) : '');
  const [acc, setAcc] = useState<number>((accounts.find((a) => a.kind === 'cash') || accounts[0])?.id);
  const [comment, setComment] = useState('');
  const [day, setDay] = useState(today());
  const { busy, run } = useSubmit();

  return (
    <main className="screen">
      <h1 className="screen-title">Выплата</h1>
      <Seg value={kind} onChange={setKind} options={kinds.map((x) => ({ id: x, label: KIND_LABEL[x] }))} />
      <Field label="Кому"><Chips value={uid} onChange={setUid} options={people.map((u) => ({ id: u.id, label: u.name }))} /></Field>
      <Field label="Сумма" htmlFor="amt"><MoneyInput id="amt" big value={amount} onChange={setAmount} /></Field>
      <Field label="Откуда"><Chips value={acc} onChange={setAcc} options={accounts.map((a) => ({ id: a.id, label: accLabel(a) }))} /></Field>
      <Field label="Комментарий" htmlFor="cm"><input id="cm" className="input" value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      <div className="two">
        <Field label="Дата" htmlFor="d"><input id="d" type="date" className="input" value={day} max={today()} onChange={(e) => setDay(e.target.value)} /></Field>
        <div />
      </div>
      <button className="btn" disabled={busy} onClick={() => run(async () => {
        const n = toNum(amount);
        if (n <= 0) throw new Error('Впишите сумму');
        await post('/api/payouts', { user_id: uid, kind, amount: n, account_id: acc, comment, day });
        toast(`${KIND_LABEL[kind]}: ${money(n)} — сохранено`); bump(); back();
      })}>Сохранить выплату</button>
      <button className="btn text" onClick={back}>Отмена</button>
    </main>
  );
}
