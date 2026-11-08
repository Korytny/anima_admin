-- Папка ролика на диске: topics.folder (ComfyUI/output/anima/<folder>/…).
-- Значение назначает АДМИНКА (единственное место, где создаются ролики):
-- транслит названия, при совпадении -2, -3… Код: src/lib/media.ts (uniqueFolder), src/store/data.tsx.
-- В БД — только колонка и уникальный индекс (защита от дублей). Триггеров нет. Скрипт идемпотентный.

alter table public.topics add column if not exists folder text;

create unique index if not exists topics_folder_key on public.topics (folder);

comment on column public.topics.folder is 'Папка ролика на диске (ComfyUI/output/anima/<folder>). Назначает админка один раз, дальше не меняется. Источник: anima_admin/supabase/topic_folder.sql';

-- Если раньше выполнялась версия с триггером — убрать его
drop trigger if exists topics_set_folder on public.topics;
drop function if exists public.topics_set_folder();
drop function if exists public.slugify(text);
