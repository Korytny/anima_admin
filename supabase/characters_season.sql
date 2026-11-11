-- Персонажи принадлежат СЕЗОНУ (библиотека сезона), а не серии. Серия выбирает своих в topics.chars.
-- Картинки персонажей сезона лежат в одной папке: ComfyUI/output/anima/<seasons.folder>/characters/.
-- Код: src/pages/Characters.tsx, src/store/data.tsx (seasonCharacters, assignSeasonFolders), src/lib/media.ts.
-- Скрипт идемпотентный. Триггеров нет.

-- characters.topic → characters.season (если ещё не переименовано вручную)
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'characters' and column_name = 'topic')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'characters' and column_name = 'season') then
    alter table public.characters rename column topic to season;
  end if;
end $$;

-- FK на seasons не ставим: в старых записях здесь остались id роликов (topics), они не пройдут проверку.
create index if not exists characters_season_idx on public.characters (season);

comment on column public.characters.season is 'Сезон персонажа (uuid → seasons.id). Серия выбирает персонажей в topics.chars, сцена — в scenes.character, связь по name. В старых записях — id ролика (до перехода на сезоны). Источник: anima_admin/supabase/characters_season.sql';

-- Папка сезона на диске
alter table public.seasons add column if not exists folder text;
create unique index if not exists seasons_folder_key on public.seasons (folder);

comment on column public.seasons.folder is 'Папка сезона на диске (ComfyUI/output/anima/<folder>): там лежат персонажи сезона (characters/). Назначает админка один раз — транслит названия. Источник: anima_admin/supabase/characters_season.sql';

comment on column public.topics.chars is 'Персонажи серии: имена (characters.name) из библиотеки сезона. Выбираются в карточке серии. Источник: anima_admin/supabase/characters_season.sql';
