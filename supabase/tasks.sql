-- Задачи команды внутри конвейера: кому, статус, привязка к серии/шоту/персонажу, переписка (comments — массив в той же строке).
-- Страница «Задачи» админки. Скрипт идемпотентный.

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  assignee      uuid,                                   -- auth.users.id (кому)
  status        text not null default 'open',           -- open | in_progress | review | done
  topic_id      uuid,                                   -- серия (необязательно)
  scene_id      uuid,                                   -- шот (необязательно) — фото карточки = кадр шота
  character_id  uuid,                                   -- персонаж (необязательно)
  comments      jsonb not null default '[]'::jsonb,     -- [{ author, name, text, at }]
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists tasks_assignee_idx on public.tasks (assignee, status);

alter table public.tasks enable row level security;
drop policy if exists "tasks: admins all" on public.tasks;
create policy "tasks: admins all" on public.tasks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

comment on table public.tasks is 'Задачи команды: кому (assignee = auth.users.id), статус open/in_progress/review/done, привязка к серии/шоту/персонажу, переписка в comments (jsonb-массив; админка дописывает с проверкой updated_at). Страница «Задачи». Источник: anima_admin/supabase/tasks.sql';
comment on column public.tasks.comments is 'Переписка: [{ author: uuid, name: text, text: text, at: timestamptz }]. Источник: anima_admin/supabase/tasks.sql';

-- Участники команды: имя и почта рядом с admin_users — чтобы назначать задачи и подписывать сообщения
alter table public.admin_users add column if not exists email text;
alter table public.admin_users add column if not exists name text;
update public.admin_users a set email = u.email from auth.users u where u.id = a.user_id and a.email is distinct from u.email;
update public.admin_users set name = split_part(email, '@', 1) where name is null and email is not null;
comment on column public.admin_users.email is 'Почта пользователя (копия из auth.users) — для списка команды в админке. Источник: anima_admin/supabase/tasks.sql';
comment on column public.admin_users.name is 'Имя в команде (задачи, переписка). Источник: anima_admin/supabase/tasks.sql';

-- Админы видят всю команду (раньше — только себя)
drop policy if exists "admin_users: admins read" on public.admin_users;
create policy "admin_users: admins read" on public.admin_users
  for select to authenticated using (public.is_admin());
