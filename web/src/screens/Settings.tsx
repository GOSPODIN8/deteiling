import { useState } from 'react';
import { money, post, put, type Account, type Category, type Service, type UserRef } from '../lib';
import { Field, Icon, MoneyInput, Seg, Sheet, toNum, useApp, useSubmit } from '../ui';

export function Settings() {
  const { ref } = useApp();
  const [user, setUser] = useState<UserRef | 'new' | null>(null);
  const [service, setService] = useState<Service | 'new' | null>(null);
  const [cat, setCat] = useState<Category | 'new' | null>(null);
  const [acc, setAcc] = useState<Account | 'new' | null>(null);
  const [nameOpen, setNameOpen] = useState(false);

  const roleLabel = (u: UserRef) => (u.role === 'partner' ? 'партнёр' : 'мастер');
  const salaryLabel = (u: UserRef) => [u.salary_fixed ? `оклад ${money(u.salary_fixed)}` : '', u.salary_percent ? `${u.salary_percent}%` : ''].filter(Boolean).join(' + ') || 'без зарплаты';

  return (
    <main className="screen">
      <h1 className="screen-title">Настройки</h1>

      <button className="card between" style={{ border: 'none', textAlign: 'left' }} onClick={() => setNameOpen(true)}>
        <span><span className="small muted">Название центра</span><br /><b>{ref.centerName}</b></span>
        <span className="link">Изменить</span>
      </button>

      <div className="section-head"><h2>Команда</h2><button className="link" onClick={() => setUser('new')}>Добавить</button></div>
      <section className="card tight">
        {ref.users.map((u) => (
          <button key={u.id} className="list-row" onClick={() => setUser(u)} style={{ opacity: u.active ? 1 : 0.5 }}>
            <span className="grow">
              <span style={{ fontWeight: 600 }}>{u.name}</span>{u.id === ref.me.id && <span className="muted"> (вы)</span>}<br />
              <span className="small muted">{[roleLabel(u), u.role === 'partner' ? `доля ${u.share_percent}%` : '', salaryLabel(u), !u.active ? 'отключён' : !u.bot_started ? 'ещё не открыл бота' : ''].filter(Boolean).join(', ')}</span>
            </span>
            <span className="muted"><Icon name="right" size={18} /></span>
          </button>
        ))}
      </section>
      <div className="small muted" style={{ margin: '-6px 4px 0' }}>Чтобы добавить человека, попросите его написать боту /id и пришлите вам номер.</div>

      <div className="section-head"><h2>Услуги и прайс</h2><button className="link" onClick={() => setService('new')}>Добавить</button></div>
      <section className="card tight">
        {ref.services.map((s) => (
          <button key={s.id} className="list-row" onClick={() => setService(s)} style={{ opacity: s.active ? 1 : 0.5 }}>
            <span className="grow">{s.name}<br />
              <span className="small muted">{s.price_sedan || s.price_cross || s.price_jeep
                ? [s.price_sedan, s.price_cross, s.price_jeep].map((p) => (p ? money(p, false) : '—')).join(' / ') + ' с.'
                : 'цена договорная'}{!s.active && ', скрыта'}</span></span>
            <span className="muted"><Icon name="right" size={18} /></span>
          </button>
        ))}
      </section>

      <div className="section-head"><h2>Категории расходов</h2><button className="link" onClick={() => setCat('new')}>Добавить</button></div>
      <section className="card tight">
        {ref.categories.map((c) => (
          <button key={c.id} className="list-row" onClick={() => setCat(c)} style={{ opacity: c.active ? 1 : 0.5 }}>
            <span className="grow">{c.name}{!c.active && <span className="muted">, скрыта</span>}</span>
            <span className="muted"><Icon name="right" size={18} /></span>
          </button>
        ))}
      </section>

      <div className="section-head"><h2>Счета</h2><button className="link" onClick={() => setAcc('new')}>Добавить</button></div>
      <section className="card tight">
        {ref.accounts.map((a) => (
          <button key={a.id} className="list-row" onClick={() => setAcc(a)} style={{ opacity: a.active ? 1 : 0.5 }}>
            <span className="grow">{a.name}<br /><span className="small muted">{({ cash: 'наличные', card: 'карта', terminal: 'терминал', person: 'деньги на руках у партнёра' } as any)[a.kind]}{!a.active && ', закрыт'}</span></span>
            <span className="muted"><Icon name="right" size={18} /></span>
          </button>
        ))}
      </section>

      <CenterName open={nameOpen} onClose={() => setNameOpen(false)} />
      {user && <UserSheet user={user} onClose={() => setUser(null)} />}
      {service && <ServiceSheet service={service} onClose={() => setService(null)} />}
      {cat && <CategorySheet cat={cat} onClose={() => setCat(null)} />}
      {acc && <AccountSheet acc={acc} onClose={() => setAcc(null)} />}
    </main>
  );
}

function useDone(onClose: () => void) {
  const { reloadRef, toast, bump } = useApp();
  return async (msg: string) => { await reloadRef(); bump(); toast(msg); onClose(); };
}

function CenterName({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ref } = useApp();
  const [v, setV] = useState(ref.centerName);
  const done = useDone(onClose);
  const { busy, run } = useSubmit();
  return (
    <Sheet open={open} onClose={onClose} title="Название центра">
      <div className="stack">
        <input className="input" value={v} onChange={(e) => setV(e.target.value)} aria-label="Название" />
        <button className="btn" disabled={busy} onClick={() => run(async () => { await put('/api/settings/center_name', { value: v }); await done('Сохранено'); })}>Сохранить</button>
      </div>
    </Sheet>
  );
}

function UserSheet({ user, onClose }: { user: UserRef | 'new'; onClose: () => void }) {
  const isNew = user === 'new';
  const u = isNew ? null : user;
  const [tgId, setTgId] = useState('');
  const [name, setName] = useState(u?.name ?? '');
  const [role, setRole] = useState<'partner' | 'master'>(u?.role ?? 'partner');
  const [share, setShare] = useState(String(u?.share_percent ?? 0));
  const [fixed, setFixed] = useState(String(u?.salary_fixed ?? 0));
  const [pct, setPct] = useState(String(u?.salary_percent ?? 0));
  const [notify, setNotify] = useState(u?.notify ?? true);
  const done = useDone(onClose);
  const { busy, run } = useSubmit();

  return (
    <Sheet open onClose={onClose} title={isNew ? 'Новый человек' : u!.name}>
      <div className="stack">
        {isNew && (
          <Field label="Telegram ID" htmlFor="tgid">
            <input id="tgid" className="input" inputMode="numeric" placeholder="Человек пишет боту /id" value={tgId} onChange={(e) => setTgId(e.target.value.replace(/\D/g, ''))} />
          </Field>
        )}
        <Field label="Имя" htmlFor="nm"><input id="nm" className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Роль"><Seg value={role} onChange={setRole} options={[{ id: 'partner', label: 'Партнёр' }, { id: 'master', label: 'Наёмный мастер' }]} /></Field>
        {role === 'partner' && (
          <Field label="Доля в прибыли, % (после возврата вложений)" htmlFor="sh"><MoneyInput id="sh" value={share} onChange={setShare} /></Field>
        )}
        <div className="two">
          <Field label="Оклад в месяц" htmlFor="fx"><MoneyInput id="fx" value={fixed} onChange={setFixed} /></Field>
          <Field label="% с заказа" htmlFor="pc"><MoneyInput id="pc" value={pct} onChange={setPct} /></Field>
        </div>
        {!isNew && (
          <label className="between" style={{ minHeight: 44 }}>
            <span>Присылать итоги в бот</span>
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} style={{ width: 22, height: 22, accentColor: 'var(--accent)' }} />
          </label>
        )}
        <button className="btn" disabled={busy} onClick={() => run(async () => {
          if (!name.trim()) throw new Error('Впишите имя');
          if (isNew) {
            if (!tgId) throw new Error('Впишите Telegram ID');
            const nu = await post('/api/users', { telegram_id: Number(tgId), name, role });
            await put(`/api/users/${nu.id}`, { share_percent: toNum(share), salary_fixed: toNum(fixed), salary_percent: toNum(pct) });
            await done(`${name} добавлен. Пусть откроет бота и нажмёт «Старт».`);
          } else {
            await put(`/api/users/${u!.id}`, { name, role, share_percent: toNum(share), salary_fixed: toNum(fixed), salary_percent: toNum(pct), notify });
            await done('Сохранено');
          }
        })}>{isNew ? 'Добавить' : 'Сохранить'}</button>
        {!isNew && (
          <button className="btn danger" disabled={busy} onClick={() => run(async () => {
            await put(`/api/users/${u!.id}`, { active: !u!.active });
            await done(u!.active ? 'Доступ отключён' : 'Доступ включён');
          })}>{u!.active ? 'Отключить доступ' : 'Вернуть доступ'}</button>
        )}
      </div>
    </Sheet>
  );
}

function ServiceSheet({ service, onClose }: { service: Service | 'new'; onClose: () => void }) {
  const s = service === 'new' ? null : service;
  const [name, setName] = useState(s?.name ?? '');
  const [p1, setP1] = useState(s?.price_sedan != null ? String(s.price_sedan) : '');
  const [p2, setP2] = useState(s?.price_cross != null ? String(s.price_cross) : '');
  const [p3, setP3] = useState(s?.price_jeep != null ? String(s.price_jeep) : '');
  const done = useDone(onClose);
  const { busy, run } = useSubmit();
  const payload = (active?: boolean) => ({
    name, price_sedan: p1 ? toNum(p1) : null, price_cross: p2 ? toNum(p2) : null, price_jeep: p3 ? toNum(p3) : null, active,
  });
  return (
    <Sheet open onClose={onClose} title={s ? s.name : 'Новая услуга'}>
      <div className="stack">
        <Field label="Название" htmlFor="sn"><input id="sn" className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="small muted">Цена-подсказка. Можно оставить пустой — в заказе впишете вручную.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
          <Field label="Седан" htmlFor="p1"><MoneyInput id="p1" value={p1} onChange={setP1} placeholder="—" /></Field>
          <Field label="Кроссовер" htmlFor="p2"><MoneyInput id="p2" value={p2} onChange={setP2} placeholder="—" /></Field>
          <Field label="Джип" htmlFor="p3"><MoneyInput id="p3" value={p3} onChange={setP3} placeholder="—" /></Field>
        </div>
        <button className="btn" disabled={busy} onClick={() => run(async () => {
          if (!name.trim()) throw new Error('Впишите название');
          if (s) await put(`/api/services/${s.id}`, payload()); else await post('/api/services', payload());
          await done('Сохранено');
        })}>Сохранить</button>
        {s && <button className="btn ghost" disabled={busy} onClick={() => run(async () => { await put(`/api/services/${s.id}`, payload(!s.active)); await done(s.active ? 'Услуга скрыта' : 'Услуга снова в списке'); })}>
          {s.active ? 'Скрыть из списка' : 'Вернуть в список'}</button>}
      </div>
    </Sheet>
  );
}

function CategorySheet({ cat, onClose }: { cat: Category | 'new'; onClose: () => void }) {
  const c = cat === 'new' ? null : cat;
  const [name, setName] = useState(c?.name ?? '');
  const done = useDone(onClose);
  const { busy, run } = useSubmit();
  return (
    <Sheet open onClose={onClose} title={c ? c.name : 'Новая категория'}>
      <div className="stack">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Название" placeholder="Например: Инструмент" />
        <button className="btn" disabled={busy} onClick={() => run(async () => {
          if (!name.trim()) throw new Error('Впишите название');
          if (c) await put(`/api/categories/${c.id}`, { name }); else await post('/api/categories', { name });
          await done('Сохранено');
        })}>Сохранить</button>
        {c && <button className="btn ghost" disabled={busy} onClick={() => run(async () => { await put(`/api/categories/${c.id}`, { name, active: !c.active }); await done('Сохранено'); })}>
          {c.active ? 'Скрыть из списка' : 'Вернуть в список'}</button>}
      </div>
    </Sheet>
  );
}

function AccountSheet({ acc, onClose }: { acc: Account | 'new'; onClose: () => void }) {
  const a = acc === 'new' ? null : acc;
  const [name, setName] = useState(a?.name ?? '');
  const [kind, setKind] = useState<'cash' | 'card' | 'terminal'>('card');
  const done = useDone(onClose);
  const { busy, run } = useSubmit();
  return (
    <Sheet open onClose={onClose} title={a ? a.name : 'Новый счёт'}>
      <div className="stack">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Название" placeholder="Например: Карта Алиф" disabled={a?.kind === 'person'} />
        {!a && <Seg value={kind} onChange={setKind} options={[{ id: 'card', label: 'Карта' }, { id: 'cash', label: 'Наличные' }, { id: 'terminal', label: 'Терминал' }]} />}
        {a?.kind !== 'person' && (
          <button className="btn" disabled={busy} onClick={() => run(async () => {
            if (!name.trim()) throw new Error('Впишите название');
            if (a) await put(`/api/accounts/${a.id}`, { name }); else await post('/api/accounts', { name, kind });
            await done('Сохранено');
          })}>Сохранить</button>
        )}
        {a && a.kind !== 'person' && (
          <button className="btn ghost" disabled={busy} onClick={() => run(async () => { await put(`/api/accounts/${a.id}`, { active: !a.active }); await done(a.active ? 'Счёт закрыт' : 'Счёт открыт'); })}>
            {a.active ? 'Закрыть счёт' : 'Открыть снова'}</button>
        )}
        {a?.kind === 'person' && <div className="small muted">Этот счёт создаётся автоматически для каждого человека: сюда попадают деньги, которые у него на руках.</div>}
      </div>
    </Sheet>
  );
}
