# Anima Admin — Pipeline Manager

Админка для производства видеороликов поверх Supabase: контент-план (`topics`), сцены (`scenes`), агенты и настройки (пока демо).
Исходное ТЗ — `README.md`. Ниже — решения, которые от него **отличаются или его уточняют**. При конфликте приоритет у этого файла.

## Команды

```bash
npm install
npm run dev        # dev-сервер Vite
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + сборка
```

Окружение — `.env.local` (в git не попадает): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable/anon).
**service_role-ключ никогда не кладём в проект и во фронтенд.**

## Стек

React 18 + TypeScript, Vite 6, Tailwind CSS v4 (`@tailwindcss/vite`, тема через `@theme` в `src/index.css`), @supabase/supabase-js, TanStack Table + Virtual, Radix (dialog, dropdown, popover, switch, slider), framer-motion, lucide-react, react-router v6, recharts, sonner, cmdk, date-fns (ru).
shadcn/ui как пакет не используется — свои компоненты в `src/components/ui.tsx`.

## База данных (Supabase)

- `public.topics` — ролики. PK `topic_id uuid`. Поля: title (NOT NULL), status (text), extended_description, script_scenas, music, chars text[], duration, backlog, visual_style, url, url_final, size, file_tiktok(+_size), all/all_eng jsonb, updated_at. **Нет created_at.**
- `public.scenes` — сцены/шоты. PK `scene_id uuid`, `topic uuid → topics.topic_id`. Порядок: `scena` (номер сцены), затем `shot_num`. `char_img_url`, `character` — text[]; `speaker_voice_profile` — jsonb.
- Статусы — свободный text. Известные значения раскрашиваются (`lib/status.ts`), неизвестные показываются как есть серым (`statusMeta`). В topics встречаются: draft, pending, published (+ мусор).
- Доступ: Supabase Auth + RLS, разрешено только пользователям из `public.admin_users` (`supabase/policies.sql`). n8n/сервисы работают через service_role и RLS не затрагиваются.
- Остальные таблицы БД (voices, orders, stories, locations, characters, songs, act_templates, narrative_base…) админка пока не трогает.

## Решения по ТЗ (согласовано с заказчиком)

- **Только быстрая карточка справа**, без нижней «расширенной». Клик по строке открывает карточку, чекбокс — для массовых действий.
- **Контекстная панель ролика** — только на странице «Сцены».
- **Оплаты нет.** Задач генерации (Task) **нет** — в БД такой таблицы нет; вернёмся, когда появится.
- **Агенты и Настройки — демо** (in-memory, `src/api/demo.ts`, бейдж «демо» в меню): таблиц под них нет. Агенты = конфигурация промптов/моделей. API-ключи write-only (наружу только `key_hint`).
- **Перетаскивание сцен отключено**: порядок задаётся полями `scena`/`shot_num`, правится в карточке.
- **Резиновая вёрстка**, карточка на `xl+` раздвигает контент, на узких — оверлей.
- Интерфейс только на русском; комментарии/история/уведомления — отложены.

## Архитектура

```
src/
  types.ts            — Topic, Scene (= колонки БД) + демо-сущности
  lib/supabase.ts     — клиент Supabase (anon key)
  api/types.ts        — интерфейс Api (контракт слоя данных)
  api/supabase.ts     — topics/scenes через Supabase (постраничная выборка по 1000)
  api/demo.ts         — демо in-memory для агентов/пользователей/интеграций/системных настроек
  api/index.ts        — сборка api = demo + supabase
  store/data.tsx      — DataProvider/useData: загрузка, CRUD с тостами, автообновление каждые 20 с;
                        хелперы topicTitle, useScenesByTopic, topicPreview, sortScenes
  lib/status.ts       — статусы (лейблы/цвета) + statusMeta/statusOptions с fallback для неизвестных
  lib/useDraft.ts     — черновик сущности: dirty-поля, Cmd+S, подтягивание внешних изменений в нетронутые поля
  components/AuthGate.tsx   — вход (пароль или magic link), useSession, signOut
  components/DataTable.tsx  — общая таблица: сортировка, выбор, видимость столбцов, плотность, виртуализация
  components/SidePanel.tsx  — карточка справа (+ PanelScroll, PanelFooter)
  components/FieldGroups.tsx — декларативный редактор полей (text/textarea/number/select/list(text[])/json(jsonb)/readonly)
  components/layout/  — Sidebar, Topbar, CommandMenu, AppLayout
  pages/              — Dashboard, ContentPlan + TopicCard, Scenes + SceneCard, Agents, Settings
supabase/policies.sql — admin_users, is_admin(), RLS-политики, FK scenes.topic
```

### Принципы

- UI ходит в данные только через `api`. Новая таблица → методы в `Api` + реализация в `api/supabase.ts`.
- Пустые значения nullable-полей сохраняются как `null` (не `''`); NOT NULL поля помечаются `required` в FieldDef.
- Маршруты: `/dashboard`, `/topics/:topicId?`, `/scenes/:topicId?` (`?scene=<id>`), `/agents` (`?agent=`), `/settings/:section?`. Выбранная сущность — в URL.
- Настройки таблиц и фильтры — в localStorage по `storageKey`.
- Карточки описываются через `GroupDef/FieldDef`; новое поле БД = строка в конфиге группы.
- Права проверяет БД (RLS); фронт ничего не скрывает «для безопасности».

## Дизайн-токены

`bg-bg`, `bg-surface`, `bg-raised`, `bg-hover`, `border-border`, `text-fg / fg-2 / fg-3`, `accent` (фиолетовый), `gold`, `success`, `danger`, `info`. Шрифты: `font-sans` (Inter), `font-mono` (JetBrains Mono — ID, JSON, промпты).

## Горячие клавиши

`Cmd+K` — поиск, `N` — новая запись, `Esc` — закрыть карточку, `Cmd+S` — сохранить, `Enter` на строке — открыть. Плеер: пробел, ←/→, `,`/`.`.
