-- Визуальный стиль сезона: id стиля из src/lib/styles.ts (smooth3d, watercolor, scifi, steampunk).
-- Сами стили (LoRA, сила, триггеры, добавка к промпту) живут в коде админки; при генерации кадра админка
-- кладёт выбранный стиль в тело вебхука (api/pipeline.ts → style). Выбирается на странице «Стиль».
-- Скрипт идемпотентный. Триггеров и ограничений нет: список допустимых значений держит админка.

alter table public.seasons add column if not exists style text;

comment on column public.seasons.style is 'Визуальный стиль сезона: id из src/lib/styles.ts (smooth3d | watercolor | scifi | steampunk). Выбирается на странице «Стиль».';
