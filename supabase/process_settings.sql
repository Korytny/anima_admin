-- Настройки процессов ComfyUI: постоянные значения поверх шаблона workflows/<файл> (размер, LoRA, шаги…)
-- и шаблон промпта. Редактируются на странице «Процессы», читает n8n (n8n/fill_workflow.js). Скрипт идемпотентный.

create table if not exists public.process_settings (
  file        text primary key,                        -- имя файла процесса в workflows/, напр. frame-refs.json
  settings    jsonb not null default '{}'::jsonb,      -- { "values": { "#size.width": 768, … }, "prompt": "mhbh style, {{prompt}}, {{style}}" }
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);

alter table public.process_settings enable row level security;
drop policy if exists "process_settings: admins all" on public.process_settings;
create policy "process_settings: admins all" on public.process_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

comment on table public.process_settings is 'Настройки процессов ComfyUI поверх шаблона workflows/<file>: values — «#метка.поле» → значение (размер, LoRA, шаги), prompt — шаблон промпта с {{prompt}}, {{style}}. Правит страница «Процессы», применяет n8n/fill_workflow.js. Источник: anima_admin/supabase/process_settings.sql';
comment on column public.process_settings.settings is '{ values: { "#size.width": 768, "#lora.strength_model": 0.42, … }, prompt: "mhbh style, {{prompt}}, {{style}}" }. Источник: anima_admin/supabase/process_settings.sql';

-- Кадр с персонажами: триггер LoRA mhbh в начало промпта (проверено вручную)
insert into public.process_settings (file, settings)
values ('frame-refs.json', '{"values": {}, "prompt": "mhbh style, {{prompt}}, {{style}}"}'::jsonb)
on conflict (file) do nothing;
