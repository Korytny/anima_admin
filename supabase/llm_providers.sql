-- Провайдеры моделей (LLM) для агентов: адрес OpenAI-совместимого API, ключ, список моделей.
-- Правит админка («Настройки → Интеграции»), читает n8n: agents.provider → llm_providers.id → base_url + api_key,
-- запрос POST {base_url}/chat/completions с моделью agents.model. Тестовая система: ключ хранится как есть.
-- Скрипт идемпотентный. Триггеров нет.

create table if not exists public.llm_providers (
  id          text primary key,                         -- modelscope, openai…
  title       text,
  base_url    text,                                     -- https://api-inference.modelscope.ai/v1
  api_key     text,
  models      text[] not null default '{}',             -- id моделей, как их ждёт API
  updated_at  timestamptz not null default now()
);

alter table public.llm_providers enable row level security;
drop policy if exists "llm_providers: admins all" on public.llm_providers;
create policy "llm_providers: admins all" on public.llm_providers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

comment on table public.llm_providers is 'Провайдеры моделей для агентов: OpenAI-совместимый base_url, api_key, models. Правит «Настройки → Интеграции», читает n8n по agents.provider. Источник: anima_admin/supabase/llm_providers.sql';

alter table public.agents add column if not exists provider text;
comment on column public.agents.provider is 'Провайдер модели агента: id из llm_providers; модель — agents.model. Источник: anima_admin/supabase/llm_providers.sql';

insert into public.llm_providers (id, title, base_url)
values ('modelscope', 'ModelScope', 'https://api-inference.modelscope.ai/v1')
on conflict (id) do nothing;
