import { useEffect, useState } from 'react';
import { compressImage, del, fetchImage, get, money, post, shortDate, today } from '../lib';
import { Chips, ErrorBox, Field, Icon, Loader, MoneyInput, Seg, Sheet, toNum, useApp, useLoad, useSubmit } from '../ui';
import { accLabel } from './Orders';

export function Expenses() {
  const { toast, bump } = useApp();
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('month');
  const { data, error, loading, reload } = useLoad(() => get(`/api/expenses?period=${period}`), [period]);
  const [sel, setSel] = useState<any>(null);
  const [img, setImg] = useState<string | null>(null);
  const { busy, run } = useSubmit();

  useEffect(() => {
    setImg(null);
    if (sel?.receipt_id) fetchImage(`/api/receipts/${sel.receipt_id}`).then(setImg).catch(() => setImg(null));
  }, [sel]);

  const list = data || [];
  const total = list.reduce((a: number, e: any) => a + Number(e.amount), 0);
  const byCat = Object.entries(list.reduce((m: Record<string, number>, e: any) => {
    const k = e.category || 'Без категории'; m[k] = (m[k] || 0) + Number(e.amount); return m;
  }, {})).sort((a, b) => (b[1] as number) - (a[1] as number)) as [string, number][];
  const max = byCat[0]?.[1] || 1;

  return (
    <main className="screen">
      <h1 className="screen-title">Расходы</h1>
      <Seg value={period} onChange={setPeriod} options={[{ id: 'today', label: 'Сегодня' }, { id: 'week', label: 'Неделя' }, { id: 'month', label: 'Месяц' }]} />
      {error && <ErrorBox text={error} onRetry={reload} />}
      {!data && loading && <Loader />}
      {data && (
        <>
          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div><span className="small muted">Потрачено</span><div className="num expense" style={{ fontSize: 26, fontWeight: 700 }}>{money(total)}</div></div>
            {byCat.map(([name, sum]) => (
              <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="between small"><span>{name}</span><span className="muted num">{money(sum)}</span></div>
                <div className="meter"><i style={{ width: `${Math.max(3, Math.round((sum / max) * 100))}%` }} /></div>
              </div>
            ))}
            <div className="small muted">Зарплаты и авансы считаются отдельно, в разделе «Зарплаты».</div>
          </section>
          <section className="card tight">
            {!list.length && <div className="empty">Расходов за период нет</div>}
            {list.map((e: any) => (
              <button key={e.id} className="list-row" onClick={() => setSel(e)}>
                <span className="grow">
                  <span style={{ fontWeight: 600 }}>{e.category || 'Без категории'}</span>
                  {e.receipt_id && <span className="muted" style={{ marginLeft: 6, verticalAlign: 'middle' }}><Icon name="receipt" size={15} /></span>}
                  <br />
                  <span className="small muted ellipsis" style={{ display: 'block' }}>{[shortDate(e.day), e.account, e.comment].filter(Boolean).join(', ')}</span>
                </span>
                <b className="num expense">−{money(e.amount)}</b>
              </button>
            ))}
          </section>
        </>
      )}

      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel ? `${sel.category || 'Расход'}: ${money(sel.amount)}` : ''}>
        {sel && (
          <div className="stack">
            <div className="muted">{[shortDate(sel.day), `из «${sel.account}»`, sel.author && `добавил ${sel.author}`].filter(Boolean).join(', ')}</div>
            {sel.comment && <div>{sel.comment}</div>}
            {sel.receipt_id && (img ? <img className="receipt-img" src={img} alt="Фото чека" /> : <Loader />)}
            <button className="btn danger" disabled={busy} onClick={() => run(async () => {
              if (!confirm('Удалить расход?')) return;
              await del(`/api/expenses/${sel.id}`); setSel(null); toast('Расход удалён'); bump();
            })}><Icon name="trash" size={18} /> Удалить</button>
          </div>
        )}
      </Sheet>
    </main>
  );
}

export function ExpenseForm() {
  const { ref, back, toast, bump } = useApp();
  const accounts = ref.accounts.filter((a) => a.active);
  const cats = ref.categories.filter((c) => c.active);
  const mine = accounts.find((a) => a.kind === 'person' && a.user_id === ref.me.id);
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState<number | null>(cats[0]?.id ?? null);
  const [acc, setAcc] = useState<number>((accounts.find((a) => a.kind === 'cash') || accounts[0])?.id);
  const [day, setDay] = useState(today());
  const [comment, setComment] = useState('');
  const [receipt, setReceipt] = useState<{ mime: string; data: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const { busy, run } = useSubmit();

  const onFile = async (f?: File | null) => {
    if (!f) return;
    try {
      const r = await compressImage(f);
      setReceipt(r); setPreview(`data:${r.mime};base64,${r.data}`);
    } catch (e: any) { toast(e.message, true); }
  };

  return (
    <main className="screen">
      <h1 className="screen-title">Новый расход</h1>
      <Field label="Сумма" htmlFor="amt"><MoneyInput id="amt" big value={amount} onChange={setAmount} /></Field>
      <Field label="На что"><Chips value={cat} onChange={setCat} options={cats.map((c) => ({ id: c.id, label: c.name }))} /></Field>
      <Field label="Откуда взяли деньги">
        <Chips value={acc} onChange={setAcc} options={accounts.map((a) => ({ id: a.id, label: a.id === mine?.id ? 'Свои (на руках)' : accLabel(a) }))} />
      </Field>
      <Field label="Комментарий" htmlFor="cm"><input id="cm" className="input" placeholder="Полироль, 2 банки" value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      <div className="two">
        <Field label="Дата" htmlFor="d"><input id="d" type="date" className="input" value={day} max={today()} onChange={(e) => setDay(e.target.value)} /></Field>
        <div />
      </div>
      {preview ? (
        <div style={{ position: 'relative' }}>
          <img className="receipt-img" src={preview} alt="Фото чека" />
          <button className="icon-btn" aria-label="Убрать фото" style={{ position: 'absolute', top: 8, right: 8 }} onClick={() => { setReceipt(null); setPreview(null); }}><Icon name="x" size={18} /></button>
        </div>
      ) : (
        <label className="btn ghost" style={{ cursor: 'pointer' }}>
          <Icon name="camera" size={20} /> Сфотографировать чек
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      )}
      <button className="btn" disabled={busy} onClick={() => run(async () => {
        const n = toNum(amount);
        if (n <= 0) throw new Error('Впишите сумму');
        await post('/api/expenses', { amount: n, category_id: cat, account_id: acc, day, comment, receipt });
        toast(`Расход сохранён: ${money(n)}`); bump(); back();
      })}>Сохранить расход{toNum(amount) ? ` на ${money(toNum(amount))}` : ''}</button>
      <button className="btn text" onClick={back}>Отмена</button>
    </main>
  );
}
