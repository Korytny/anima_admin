-- Доступ админки к topics/scenes через Supabase Auth + RLS.
-- Выполнить в Supabase Dashboard → SQL Editor. Скрипт идемпотентный.
-- n8n и прочие сервисы, работающие с service_role, RLS не затрагивает.

-- 1. Список пользователей, которым разрешена админка
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;

drop policy if exists "admin_users: read self" on public.admin_users;
create policy "admin_users: read self" on public.admin_users
  for select to authenticated using (user_id = auth.uid());

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid())
$$;

-- 2. RLS на рабочих таблицах: полный доступ только админам
alter table public.topics enable row level security;
alter table public.scenes enable row level security;

drop policy if exists "topics: admins all" on public.topics;
create policy "topics: admins all" on public.topics
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "scenes: admins all" on public.scenes;
create policy "scenes: admins all" on public.scenes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 3. Связь сцены с роликом (колонка scenes.topic) + индекс
create index if not exists scenes_topic_idx on public.scenes (topic);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'scenes_topic_fkey') then
    alter table public.scenes
      add constraint scenes_topic_fkey foreign key (topic) references public.topics (topic_id) on delete cascade;
  end if;
end $$;

-- 4. Персонажи (characters.topic → ролик)
alter table public.characters enable row level security;

drop policy if exists "characters: admins all" on public.characters;
create policy "characters: admins all" on public.characters
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create index if not exists characters_topic_idx on public.characters (topic);

-- 5. Агенты (промпты и модели)
alter table public.agents enable row level security;

drop policy if exists "agents: admins all" on public.agents;
create policy "agents: admins all" on public.agents
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

comment on table public.agents is 'Агенты пайплайна: промпт (markdown) + модель. Редактируются в админке. RLS: anima_admin/supabase/policies.sql';

-- 6. Добавить себя в админы (сначала создать пользователя в Authentication → Users):
-- insert into public.admin_users (user_id)
-- select id from auth.users where email = 'you@example.com'
-- on conflict do nothing;

-- Подписи
comment on table public.admin_users is 'Кто имеет доступ к админке (RLS через is_admin()). Источник: anima_admin/supabase/policies.sql';
comment on function public.is_admin() is 'true, если auth.uid() есть в admin_users. Используется в RLS-политиках topics/scenes/characters/agents. Источник: anima_admin/supabase/policies.sql';
