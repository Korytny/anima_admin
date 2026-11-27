-- Шаг конвейера, к которому относится агент: script (Сценарий), shots (Шоты), frames (Кадры — промпты Постановщика).
-- Админка показывает агентов шага рядом с кнопкой запуска в карточке ролика и шлёт выбранный agent_id в вебхук n8n.
-- Скрипт идемпотентный. Триггеров и ограничений нет: список значений держит админка (src/lib/agentSteps.ts).

alter table public.agents add column if not exists step text;

comment on column public.agents.step is 'Шаг конвейера агента: script | shots | frames. Карточка ролика предлагает агентов шага, в вебхук уходит agent_id. Источник: anima_admin/supabase/agent_step.sql';
