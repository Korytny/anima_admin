-- История промптов агентов: каждое сохранение agents.prompt — новая строка. Откат = запись старого текста как новой версии.
-- Пишет код (scripts/db.mts push, админка «Агенты → Версии»), триггеров нет. Скрипт идемпотентный.

create table if not exists public.agent_prompt_versions (
  id          bigint generated always as identity primary key,
  agent_id    bigint not null,
  prompt      text   not null,
  model       text,
  source      text   not null,
  note        text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);

create index if not exists agent_prompt_versions_agent_idx on public.agent_prompt_versions (agent_id, created_at desc);

alter table public.agent_prompt_versions enable row level security;
drop policy if exists "agent_prompt_versions: admins all" on public.agent_prompt_versions;
create policy "agent_prompt_versions: admins all" on public.agent_prompt_versions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

comment on table public.agent_prompt_versions is 'Версии промптов агентов: agents.prompt = последняя версия. Пишут scripts/db.mts push и админка (Агенты → Версии); откат — новая строка source=rollback:<id>. Источник: anima_admin/supabase/agent_prompt_versions.sql';
comment on column public.agent_prompt_versions.agent_id is 'agents.id (без внешнего ключа). Источник: anima_admin/supabase/agent_prompt_versions.sql';
comment on column public.agent_prompt_versions.source is 'Откуда версия: initial | file:<имя файла> | admin | rollback:<id версии> | assistant. Источник: anima_admin/supabase/agent_prompt_versions.sql';
comment on column public.agent_prompt_versions.note is 'Что и зачем изменили. Источник: anima_admin/supabase/agent_prompt_versions.sql';
comment on column public.agent_prompt_versions.created_by is 'auth.uid() автора; null — записано service_role (scripts/db.mts). Источник: anima_admin/supabase/agent_prompt_versions.sql';

-- Исходная точка: текущий промпт каждого агента, у которого ещё нет версий
insert into public.agent_prompt_versions (agent_id, prompt, model, source, note)
select a.id, a.prompt, a.model, 'initial', 'исходная версия при создании истории'
from public.agents a
where a.prompt is not null
  and not exists (select 1 from public.agent_prompt_versions v where v.agent_id = a.id);
