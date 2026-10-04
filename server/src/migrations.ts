import { db } from './db.js';

/** Миграции применяются по порядку один раз. Новые — только добавлять в конец. */
const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: '001_init',
    sql: `
create table users (
  id serial primary key,
  telegram_id bigint unique not null,
  name text not null,
  username text,
  role text not null default 'partner',          -- partner | master
  share_percent numeric(5,2) not null default 0,  -- доля в прибыли
  salary_fixed numeric(12,2) not null default 0,  -- оклад в месяц
  salary_percent numeric(5,2) not null default 0, -- % с заказа
  chat_id bigint,
  notify boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table accounts (
  id serial primary key,
  name text not null,
  kind text not null,                 -- cash | card | terminal | person
  user_id int references users(id),
  active boolean not null default true,
  sort int not null default 0
);

create table services (
  id serial primary key,
  name text not null,
  price_sedan numeric(12,2),
  price_cross numeric(12,2),
  price_jeep numeric(12,2),
  active boolean not null default true,
  sort int not null default 0
);

create table expense_categories (
  id serial primary key,
  name text not null,
  active boolean not null default true,
  sort int not null default 0
);

create table orders (
  id serial primary key,
  day date not null,
  body_type text,
  car text,
  plate text,
  client_name text,
  client_phone text,
  total numeric(12,2) not null default 0,
  comment text,
  status text not null default 'done',   -- in_work | done
  created_by int references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
create index orders_day on orders(day) where deleted_at is null;

create table order_items (
  id serial primary key,
  order_id int not null references orders(id) on delete cascade,
  service_id int references services(id),
  name text not null,
  price numeric(12,2) not null default 0
);

create table order_masters (
  order_id int not null references orders(id) on delete cascade,
  user_id int not null references users(id),
  primary key (order_id, user_id)
);

create table payments (
  id serial primary key,
  order_id int not null references orders(id) on delete cascade,
  account_id int not null references accounts(id),
  amount numeric(12,2) not null,
  day date not null
);

create table receipts (
  id serial primary key,
  mime text not null,
  data bytea not null
);

create table expenses (
  id serial primary key,
  day date not null,
  category_id int references expense_categories(id),
  amount numeric(12,2) not null,
  account_id int not null references accounts(id),
  comment text,
  receipt_id int references receipts(id),
  created_by int references users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index expenses_day on expenses(day) where deleted_at is null;

create table transfers (
  id serial primary key,
  day date not null,
  from_account int not null references accounts(id),
  to_account int not null references accounts(id),
  amount numeric(12,2) not null,
  comment text,
  created_by int references users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table investments (
  id serial primary key,
  day date not null,
  user_id int not null references users(id),
  amount numeric(12,2) not null,
  account_id int references accounts(id),  -- куда положили деньги (null = сразу потрачены на покупки)
  comment text,
  created_by int references users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table payouts (
  id serial primary key,
  day date not null,
  user_id int not null references users(id),
  kind text not null,                   -- salary | advance | return | dividend
  amount numeric(12,2) not null,
  account_id int not null references accounts(id),
  comment text,
  created_by int references users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table audit_log (
  id serial primary key,
  at timestamptz not null default now(),
  user_id int references users(id),
  action text not null,     -- create | update | delete
  entity text not null,
  entity_id int,
  summary text not null
);

create table settings (
  key text primary key,
  value jsonb not null
);

create table notifications_sent (
  key text primary key,
  at timestamptz not null default now()
);

insert into accounts (name, kind, sort) values ('Касса', 'cash', 1), ('Карта', 'card', 2), ('Терминал', 'terminal', 3);

insert into expense_categories (name, sort) values
  ('Химия и расходники', 1), ('Аренда', 2), ('Коммунальные', 3), ('Реклама', 4),
  ('Оборудование', 5), ('Ремонт', 6), ('Еда и быт', 7), ('Прочее', 8);

insert into services (name, sort) values
  ('Мойка', 1), ('Комплексная мойка', 2), ('Химчистка салона', 3), ('Полировка кузова', 4),
  ('Керамика', 5), ('Защитная плёнка (PPF)', 6), ('Тонировка', 7), ('Полировка фар', 8),
  ('Чистка двигателя', 9);

insert into settings (key, value) values ('center_name', '"HAYANMI DETEILING"');
`,
  },
];

export async function migrate() {
  await db.query(`create table if not exists schema_migrations (id text primary key, at timestamptz not null default now())`);
  const done = new Set((await db.query<{ id: string }>('select id from schema_migrations')).map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    await db.tx(async (c) => {
      await c.query(m.sql);
      await c.query('insert into schema_migrations (id) values ($1)', [m.id]);
    });
    console.log('migration applied:', m.id);
  }
}
