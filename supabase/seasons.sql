-- Сезоны: старт производства. Сезон → серии (topics) → сценарий → шоты (scenes) → кадры.
-- Сезон хранит «библию» (тон, правила диалогов, визуальный стиль), её получают агенты при каждой генерации.
-- Серия = topics с season_id; номер серии = topics.backlog. Биты серии — topics.beats.
-- Код: src/pages/Seasons.tsx, src/store/data.tsx. Триггеров нет. Скрипт идемпотентный.

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  status text default 'draft',
  logline text,
  theme text,
  bible text,
  source text
);

comment on table public.seasons is 'Сезоны (арки из нескольких серий). Серии — topics.season_id. Редактируются в админке (раздел «Сезоны»). Источник: anima_admin/supabase/seasons.sql';
comment on column public.seasons.logline is 'О чём сезон, 1–2 фразы. Источник: anima_admin/supabase/seasons.sql';
comment on column public.seasons.theme is 'Сквозной вопрос сезона (напр. «Кто я — сын царицы или сын возничего?»). Источник: anima_admin/supabase/seasons.sql';
comment on column public.seasons.bible is 'Библия сезона (markdown): тон, правила диалогов, антипримеры, визуальный стиль. Передаётся агентам. Источник: anima_admin/supabase/seasons.sql';
comment on column public.seasons.source is 'Первоисточник: какие книги/главы, какая версия канона берётся. Источник: anima_admin/supabase/seasons.sql';

alter table public.seasons enable row level security;
drop policy if exists "seasons: admins all" on public.seasons;
create policy "seasons: admins all" on public.seasons
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Серии
alter table public.topics add column if not exists season_id uuid references public.seasons(id) on delete set null;
alter table public.topics add column if not exists logline text;
alter table public.topics add column if not exists beats text[];
alter table public.topics add column if not exists source_excerpt text;

create index if not exists topics_season_id_idx on public.topics (season_id);

comment on column public.topics.season_id is 'Сезон, к которому относится серия. Номер серии — backlog. Источник: anima_admin/supabase/seasons.sql';
comment on column public.topics.logline is 'Логлайн серии: кто чего хочет, что мешает, чем платит. Источник: anima_admin/supabase/seasons.sql';
comment on column public.topics.beats is 'Биты серии (3–10), без диалогов. Связи с другими сериями пишутся в тексте: «проклятие (→10)». Источник: anima_admin/supabase/seasons.sql';
comment on column public.topics.source_excerpt is 'Выжимка первоисточника для серии: события, детали, каноничные реплики. Источник: anima_admin/supabase/seasons.sql';

-- Сценарий серии от сценариста (формат === ЛОКАЦИЯ / @Scene / Описание) — в существующей колонке script_scenas.
comment on column public.topics.script_scenas is 'Сценарий серии от агента-сценариста (=== ЛОКАЦИЯ / @Scene / @Beats / @Characters / Описание). Читает и правит раздел «Сценарий». Источник: anima_admin/supabase/seasons.sql';

-- Шоты серии (вывод Редактора). extended_description пока не используется — не удаляем.
alter table public.topics add column if not exists script_shots text;
comment on column public.topics.script_shots is 'Шоты серии — вывод агента-Редактора (=== LOCATION / # Scene / N: #do|#talk …), парсится в scenes. Источник: anima_admin/supabase/seasons.sql';
