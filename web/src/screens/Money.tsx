import { useState } from 'react';
import { del, get, money, post, shortDate, today } from '../lib';
import { Chips, ErrorBox, Field, Icon, Loader, MoneyInput, toNum, useApp, useLoad, useSubmit } from '../ui';
import { accLabel } from './Orders';

export function Money() {
  const { open, toast, bump } = useApp();
  const bal = useLoad(() => get('/api/accounts'));
  const tr = useLoad(() => get('/api/transfers?period=month'));
  const { run } = useSubmit();
  const total = (bal.data || []).reduce((a: number, b: any) => a + b.balance, 0);

  return (
    <main className="screen">
      <h1 className="screen-title">Деньги</h1>
      <p className="screen-sub">Сколько и где лежит прямо сейчас</p>
      {bal.error && <ErrorBox text={bal.error} onRetry={bal.reload} />}
      {!bal.data && bal.loading && <Loader />}
      {bal.data && (
        <section className="card tight">
          {bal.data.map((b: any) => (
            <div key={b.id} className="list-row">
              <span className="grow">{b.name}</span>
              <b className={'num' + (b.balance < 0 ? ' danger' : '')}>{money(b.balance)}</b>
            </div>
          ))}
          <div className="list-row"><span className="grow muted">Всего</span><b className="num">{money(total)}</b></div>
        </section>
      )}
      <button className="btn" onClick={() => open({ name: 'transfer' })}><Icon name="swap" size={20} /> Перевести между счетами</button>
      <div className="small muted" style={{ margin: '-6px 4px 0' }}>Например: сдали наличку из кассы на карту, или партнёр забрал деньги на закупку.</div>

      <div className="section-head"><h2>Переводы за месяц</h2></div>
      <section className="card tight">
        {tr.data && !tr.data.length && <div className="empty">Переводов не было</div>}
        {(tr.data || []).map((t: any) => (
          <div key={t.id} className="list-row">
            <span className="grow">
              <span>{t.from_name} → {t.to_name}</span><br />
              <span className="small muted">{[shortDate(t.day), t.comment, t.author].filter(Boolean).join(', ')}</span>
            </span>
            <b className="num">{money(t.amount)}</b>
            <button className="icon-btn" aria-label="Удалить перевод" onClick={() => run(async () => {
              if (!confirm('Удалить перевод?')) return;
              await del(`/api/transfers/${t.id}`); toast('Перевод удалён'); bump();
            })}><Icon name="trash" size={16} /></button>
          </div>
        ))}
      </section>
    </main>
  );
}

export function TransferForm() {
  const { ref, back, toast, bump } = useApp();
  const accounts = ref.accounts.filter((a) => a.active);
  const [from, setFrom] = useState<number>((accounts.find((a) => a.kind === 'cash') || accounts[0])?.id);
  const [to, setTo] = useState<number>((accounts.find((a) => a.kind === 'card') || accounts[1])?.id);
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [day, setDay] = useState(today());
  const { busy, run } = useSubmit();
  const opts = accounts.map((a) => ({ id: a.id, label: accLabel(a) }));

  return (
    <main className="screen">
      <h1 className="screen-title">Перевод денег</h1>
      <Field label="Сумма" htmlFor="amt"><MoneyInput id="amt" big value={amount} onChange={setAmount} /></Field>
      <Field label="Откуда"><Chips value={from} onChange={setFrom} options={opts} /></Field>
      <Field label="Куда"><Chips value={to} onChange={setTo} options={opts.filter((o) => o.id !== from)} /></Field>
      <Field label="Комментарий" htmlFor="cm"><input id="cm" className="input" placeholder="Сдал наличку на карту" value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      <div className="two">
        <Field label="Дата" htmlFor="d"><input id="d" type="date" className="input" value={day} max={today()} onChange={(e) => setDay(e.target.value)} /></Field>
        <div />
      </div>
      <button className="btn" disabled={busy} onClick={() => run(async () => {
        const n = toNum(amount);
        if (n <= 0) throw new Error('Впишите сумму');
        if (from === to) throw new Error('Выберите разные счета');
        await post('/api/transfers', { amount: n, from_account: from, to_account: to, comment, day });
        toast(`Перевод сохранён: ${money(n)}`); bump(); back();
      })}>Сохранить перевод</button>
      <button className="btn text" onClick={back}>Отмена</button>
    </main>
  );
}
