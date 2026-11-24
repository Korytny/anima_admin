-- Мир и эпоха сезона: одна строка по-английски («ancient India, Mahabharata era, village of clay houses» /
-- «modern Russian city, 2020s»). n8n (frame_vars.js) отдаёт её переменной {{setting}} в шаблон промпта кадра
-- (настройки процесса frame-refs.json). Агенты её не читают: Постановщик остаётся общим, эпоха попадает в каждый кадр.
-- Скрипт идемпотентный. Триггеров и ограничений нет.

alter table public.seasons add column if not exists setting text;

comment on column public.seasons.setting is 'Мир и эпоха сезона для промпта кадра ({{setting}} в шаблоне процесса), по-английски, положительно, без отрицаний. Источник: anima_admin/supabase/season_setting.sql';
