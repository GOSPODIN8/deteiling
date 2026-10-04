import { useEffect, useMemo, useState } from 'react';
import { BODY, del, get, hintPrice, money, post, put, shortDate, today, type Account } from '../lib';
import { Chips, ErrorBox, Field, Icon, Loader, MoneyInput, Seg, Sheet, toNum, useApp, useLoad, useSubmit } from '../ui';

const PAY_LABEL: Record<string, string> = { cash: 'Наличные', card: 'Перевод на карту', terminal: 'Терминал' };
export const accLabel = (a: Account) => PAY_LABEL[a.kind] && !/\d/.test(a.name) && ['Касса', 'Карта', 'Терминал'].includes(a.name) ? PAY_LABEL[a.kind] : a.name;

/* ---------- Список заказов ---------- */

export function Orders() {
  const { open } = useApp();
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');
  const [q, setQ] = useState('');
  const [qDeb, setQDeb] = useState('');
  useEffect(() => { const t = setTimeout(() => setQDeb(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const { data, error, loading, reload } = useLoad(
    () => get(`/api/orders?period=${period}${qDeb ? `&q=${encodeURIComponent(qDeb)}` : ''}`), [period, qDeb]);
  const total = (data || []).reduce((a: number, o: any) => a + Number(o.total), 0);

  return (
    <main className="screen">
      <h1 className="screen-title">Заказы</h1>
      <input className="input" type="search" placeholder="Номер машины, марка, имя или телефон" aria-label="Поиск заказа"
        value={q} onChange={(e) => setQ(e.target.value)} />
      {!qDeb && <Seg value={period} onChange={setPeriod} options={[{ id: 'today', label: 'Сегодня' }, { id: 'week', label: 'Неделя' }, { id: 'month', label: 'Месяц' }]} />}
      {error && <ErrorBox text={error} onRetry={reload} />}
      {!data && loading && <Loader />}
      {data && (
        <>
          <div className="between small muted" style={{ margin: '0 4px -6px' }}>
            <span>{data.length} шт.</span><span className="num">на {money(total)}</span>
          </div>
          <section className="card tight">
            {!data.length && <div className="empty">{qDeb ? 'Ничего не нашлось' : 'За этот период заказов нет'}</div>}
            {data.map((o: any) => {
              const debt = Number(o.total) - Number(o.paid);
              return (
                <button key={o.id} className="list-row" onClick={() => open({ name: 'order', props: { id: o.id } })}>
                  <span className="grow">
                    <span className="ellipsis" style={{ display: 'block', fontWeight: 600 }}>{o.services || 'Заказ'}</span>
                    <span className="small muted ellipsis" style={{ display: 'block' }}>
                      {[shortDate(o.day), [o.car, o.plate].filter(Boolean).join(' '), o.masters].filter(Boolean).join(', ')}
                    </span>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <b className="num">{money(o.total)}</b>
                    {o.status === 'in_work' ? <span className="badge warn">В работе</span>
                      : debt > 0.009 ? <span className="badge warn">Долг {money(debt)}</span> : null}
                  </span>
                </button>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}

/* ---------- Долги клиентов ---------- */

export function Debts() {
  const { open } = useApp();
  const { data, error, loading, reload } = useLoad(() => get('/api/debts'));
  return (
    <main className="screen">
      <h1 className="screen-title">Долги клиентов</h1>
      {error && <ErrorBox text={error} onRetry={reload} />}
      {loading && !data && <Loader />}
      {data && (
        <>
          <div className="card"><span className="small muted">Всего должны</span><div className="num" style={{ fontSize: 26, fontWeight: 700 }}>{money(data.total)}</div></div>
          <section className="card tight">
            {!data.list.length && <div className="empty">Долгов нет</div>}
            {data.list.map((o: any) => (
              <button key={o.id} className="list-row" onClick={() => open({ name: 'order', props: { id: o.id } })}>
                <span className="grow">
                  <span style={{ fontWeight: 600 }}>{[o.car, o.plate].filter(Boolean).join(' ') || `Заказ #${o.id}`}</span><br />
                  <span className="small muted">{[shortDate(o.day), o.client_name].filter(Boolean).join(', ')}</span>
                </span>
                <b className="num expense">{money(o.debt)}</b>
              </button>
            ))}
          </section>
        </>
      )}
    </main>
  );
}

/* ---------- Форма заказа ---------- */

interface Item { key: number; service_id: number | null; name: string; price: string }
type PayMode = 'full' | 'none' | 'split';
let keySeq = 1;

export function OrderForm({ id }: { id?: number }) {
  const { ref, back, toast, bump } = useApp();
  const existing = useLoad(() => (id ? get(`/api/orders/${id}`) : Promise.resolve(null)), [id]);
  const accounts = ref.accounts.filter((a) => a.active);
  const cash = accounts.find((a) => a.kind === 'cash') || accounts[0];

  const [day, setDay] = useState(today());
  const [body, setBody] = useState<string>('sedan');
  const [car, setCar] = useState('');
  const [plate, setPlate] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [masters, setMasters] = useState<number[]>([ref.me.id]);
  const [status, setStatus] = useState<'done' | 'in_work'>('done');
  const [payMode, setPayMode] = useState<PayMode>('full');
  const [payAcc, setPayAcc] = useState<number>(cash?.id);
  const [split, setSplit] = useState<{ account_id: number; amount: string }[]>([]);
  const [comment, setComment] = useState('');
  const [showClient, setShowClient] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const { busy, run } = useSubmit();

  // Заполнение при редактировании
  useEffect(() => {
    const o = existing.data;
    if (!o) return;
    setDay(o.day); setBody(o.body_type || 'other'); setCar(o.car || ''); setPlate(o.plate || '');
    setClientName(o.client_name || ''); setClientPhone(o.client_phone || ''); setComment(o.comment || '');
    setShowClient(!!(o.client_name || o.client_phone));
    setStatus(o.status);
    setItems(o.items.map((i: any) => ({ key: keySeq++, service_id: i.service_id, name: i.name, price: String(i.price) })));
    setMasters(o.masters.map((m: any) => m.id));
    const total = Number(o.total);
    if (!o.payments.length) setPayMode('none');
    else if (o.payments.length === 1 && Math.abs(Number(o.payments[0].amount) - total) < 0.01) { setPayMode('full'); setPayAcc(o.payments[0].account_id); }
    else { setPayMode('split'); setSplit(o.payments.map((p: any) => ({ account_id: p.account_id, amount: String(p.amount) }))); }
  }, [existing.data]);

  const total = useMemo(() => items.reduce((a, i) => a + toNum(i.price), 0), [items]);
  const services = ref.services.filter((s) => s.active);

  const toggleService = (sid: number) => {
    const s = services.find((x) => x.id === sid)!;
    setItems((cur) => cur.some((i) => i.service_id === sid)
      ? cur.filter((i) => i.service_id !== sid)
      : [...cur, { key: keySeq++, service_id: sid, name: s.name, price: hintPrice(s, body) != null ? String(hintPrice(s, body)) : '' }]);
  };

  const payments = payMode === 'none' ? []
    : payMode === 'full' ? [{ account_id: payAcc, amount: total }]
    : split.map((p) => ({ account_id: p.account_id, amount: toNum(p.amount) })).filter((p) => p.amount > 0);
  const paid = payments.reduce((a, p) => a + p.amount, 0);

  const save = () => run(async () => {
    if (!items.length) throw new Error('Выберите хотя бы одну услугу');
    if (items.some((i) => !i.name.trim())) throw new Error('Впишите название услуги');
    if (total <= 0) throw new Error('Впишите цену');
    if (paid > total + 0.009) throw new Error('Оплата больше суммы заказа');
    const payload = {
      day, body_type: body, car, plate, client_name: clientName, client_phone: clientPhone, comment, status,
      items: items.map((i) => ({ service_id: i.service_id, name: i.name.trim(), price: toNum(i.price) })),
      masters, total, payments,
    };
    if (id) await put(`/api/orders/${id}`, payload); else await post('/api/orders', payload);
    toast(id ? 'Заказ сохранён' : `Заказ добавлен: ${money(total)}`);
    bump(); back();
  });

  const remove = () => run(async () => {
    if (!confirm('Удалить заказ? Он пропадёт из отчётов.')) return;
    await del(`/api/orders/${id}`);
    toast('Заказ удалён'); bump(); back();
  });

  if (id && existing.loading && !existing.data) return <main className="screen"><Loader /></main>;
  if (id && existing.error) return <main className="screen"><ErrorBox text={existing.error} onRetry={existing.reload} /></main>;
  const debt = existing.data ? Number(existing.data.debt) : 0;

  return (
    <main className="screen">
      <h1 className="screen-title">{id ? `Заказ #${id}` : 'Новый заказ'}</h1>

      <Field label="Что делали">
        <Chips multi value={items.filter((i) => i.service_id).map((i) => i.service_id!)} onChange={(ids: number[]) => {
          const cur = items.filter((i) => i.service_id).map((i) => i.service_id!);
          const changed = ids.find((x) => !cur.includes(x)) ?? cur.find((x) => !ids.includes(x));
          if (changed) toggleService(changed);
        }} options={services.map((s) => ({ id: s.id, label: s.name }))} />
      </Field>

      <Field label="Кузов">
        <Seg value={body} onChange={setBody} options={BODY.map((b) => ({ id: b.id, label: b.label }))} />
      </Field>

      {items.length > 0 && (
        <div className="card stack" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="between"><span className="label">Цена по каждой услуге</span><span className="small muted">договорная</span></div>
          {items.map((it) => (
            <div key={it.key} className="item-row">
              {it.service_id ? <span className="ellipsis">{it.name}</span>
                : <input className="input" placeholder="Название" value={it.name} aria-label="Название услуги"
                    onChange={(e) => setItems((c) => c.map((x) => x.key === it.key ? { ...x, name: e.target.value } : x))} />}
              <MoneyInput value={it.price} placeholder="Цена" onChange={(v) => setItems((c) => c.map((x) => x.key === it.key ? { ...x, price: v } : x))} />
              <button className="icon-btn" aria-label={`Убрать ${it.name}`} onClick={() => setItems((c) => c.filter((x) => x.key !== it.key))}><Icon name="x" size={18} /></button>
            </div>
          ))}
          <div className="between" style={{ paddingTop: 6, borderTop: '1px solid var(--line)' }}>
            <span className="muted">Итого</span><b className="num" style={{ fontSize: 22 }}>{money(total)}</b>
          </div>
        </div>
      )}
      <button className="chip add" style={{ alignSelf: 'flex-start' }} onClick={() => setItems((c) => [...c, { key: keySeq++, service_id: null, name: '', price: '' }])}>
        <Icon name="plus" size={16} /> Другая услуга
      </button>

      <div className="two">
        <Field label="Машина" htmlFor="car"><input id="car" className="input" placeholder="Camry, Lexus RX" value={car} onChange={(e) => setCar(e.target.value)} /></Field>
        <Field label="Госномер" htmlFor="plate"><input id="plate" className="input" placeholder="0123 AB 01" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} /></Field>
      </div>

      {showClient ? (
        <div className="two">
          <Field label="Клиент" htmlFor="cn"><input id="cn" className="input" placeholder="Имя" value={clientName} onChange={(e) => setClientName(e.target.value)} /></Field>
          <Field label="Телефон" htmlFor="cp"><input id="cp" className="input" inputMode="tel" placeholder="+992" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} /></Field>
        </div>
      ) : <button className="chip add" style={{ alignSelf: 'flex-start' }} onClick={() => setShowClient(true)}><Icon name="plus" size={16} /> Имя и телефон клиента</button>}

      <Field label="Кто делал">
        <Chips multi value={masters} onChange={setMasters} options={ref.users.filter((u) => u.active).map((u) => ({ id: u.id, label: u.name }))} />
      </Field>

      <Field label="Статус">
        <Seg value={status} onChange={setStatus} options={[{ id: 'done', label: 'Готово' }, { id: 'in_work', label: 'В работе' }]} />
      </Field>

      <Field label="Оплата">
        <Seg value={payMode} onChange={(m) => {
          setPayMode(m);
          if (m === 'split' && !split.length) setSplit([{ account_id: payAcc, amount: String(total || '') }, { account_id: accounts.find((a) => a.id !== payAcc)?.id ?? payAcc, amount: '' }]);
        }} options={[{ id: 'full', label: 'Оплачено' }, { id: 'split', label: 'Частями' }, { id: 'none', label: 'Не оплачено' }]} />
      </Field>
      {payMode === 'full' && <Chips value={payAcc} onChange={setPayAcc} options={accounts.map((a) => ({ id: a.id, label: accLabel(a) }))} />}
      {payMode === 'split' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {split.map((p, i) => (
            <div key={i} className="item-row">
              <select className="input" value={p.account_id} aria-label="Куда"
                onChange={(e) => setSplit((s) => s.map((x, j) => j === i ? { ...x, account_id: Number(e.target.value) } : x))}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{accLabel(a)}</option>)}
              </select>
              <MoneyInput value={p.amount} onChange={(v) => setSplit((s) => s.map((x, j) => j === i ? { ...x, amount: v } : x))} />
              <button className="icon-btn" aria-label="Убрать" onClick={() => setSplit((s) => s.filter((_, j) => j !== i))}><Icon name="x" size={18} /></button>
            </div>
          ))}
          <div className="between">
            <button className="link" onClick={() => setSplit((s) => [...s, { account_id: cash?.id, amount: '' }])}>Добавить часть</button>
            <span className={'small num' + (paid > total + 0.009 ? ' danger' : ' muted')}>
              {paid < total - 0.009 ? `Останется долг ${money(total - paid)}` : paid > total + 0.009 ? 'Больше суммы заказа' : 'Оплачено полностью'}
            </span>
          </div>
        </div>
      )}
      {payMode === 'none' && <div className="small muted" style={{ marginTop: -6 }}>Заказ попадёт в «Долги клиентов», доплату можно внести потом.</div>}

      <div className="two">
        <Field label="Дата" htmlFor="day"><input id="day" type="date" className="input" value={day} max={today()} onChange={(e) => setDay(e.target.value)} /></Field>
        <div />
      </div>
      <Field label="Комментарий" htmlFor="cm"><textarea id="cm" className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: скидка постоянному клиенту" /></Field>

      <button className="btn" disabled={busy} onClick={save}>{id ? 'Сохранить изменения' : `Сохранить заказ${total ? ` на ${money(total)}` : ''}`}</button>
      {id && debt > 0.009 && <button className="btn ghost" onClick={() => setPayOpen(true)}>Внести доплату ({money(debt)})</button>}
      {id && <button className="btn danger" disabled={busy} onClick={remove}><Icon name="trash" size={18} /> Удалить заказ</button>}
      <button className="btn text" onClick={back}>Отмена</button>

      {id && <TopUp open={payOpen} onClose={() => setPayOpen(false)} orderId={id} debt={debt} onDone={() => { existing.reload(); }} />}
    </main>
  );
}

function TopUp({ open, onClose, orderId, debt, onDone }: { open: boolean; onClose: () => void; orderId: number; debt: number; onDone: () => void }) {
  const { ref, toast, bump } = useApp();
  const accounts = ref.accounts.filter((a) => a.active);
  const [acc, setAcc] = useState(accounts[0]?.id);
  const [amount, setAmount] = useState(String(debt));
  const { busy, run } = useSubmit();
  useEffect(() => setAmount(String(debt)), [debt]);
  return (
    <Sheet open={open} onClose={onClose} title="Доплата по заказу">
      <div className="stack">
        <MoneyInput big value={amount} onChange={setAmount} />
        <Chips value={acc} onChange={setAcc} options={accounts.map((a) => ({ id: a.id, label: accLabel(a) }))} />
        <button className="btn" disabled={busy} onClick={() => run(async () => {
          await post(`/api/orders/${orderId}/payments`, { account_id: acc, amount: toNum(amount) });
          toast('Доплата внесена'); bump(); onDone(); onClose();
        })}>Внести {money(toNum(amount))}</button>
      </div>
    </Sheet>
  );
}
