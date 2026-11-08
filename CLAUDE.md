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
- `public.characters` — персонажи. PK `id uuid`, `topic uuid` (ролик). Со сценой связаны **по имени**: `scenes.character[]` / `speaking_character` ↔ `characters.name` в рамках того же topic (`sceneCharacters()` в store). Файлы персонажа: `base_img`, `pers_file`, `filename` (какой главный — не определено, показываем все). `updated_at` нет.
- Статусы — свободный text. Известные значения раскрашиваются (`lib/status.ts`), неизвестные показываются как есть серым (`statusMeta`). В topics встречаются: draft, pending, published (+ мусор).
- Доступ: Supabase Auth + RLS, разрешено только пользователям из `public.admin_users` (`supabase/policies.sql`). n8n/сервисы работают через service_role и RLS не затрагиваются.
- Остальные таблицы БД (voices, orders, stories, locations, songs, act_templates, narrative_base…) админка пока не трогает.

## Сценарий

`topics.extended_description` — промежуточный результат агента-сценариста: история, разбитая по локациям и сценам. По нему потом строятся шоты в `scenes`. Парсер: `lib/script.ts`. Формат:
```
=== ЛОКАЦИЯ: <название> ===
@Scene: <N> — <бит>
@Characters: A, B
Описание: <текст; реплики вида «X говорит: «…»»>
——            (разделитель сцен)
```
Сцена сценария сопоставляется с шотами по `scenes.scena = N`. Строки, которые парсер не узнал, показываются как предупреждения. Исходник можно править в боковой панели, таблица перестраивается на лету.

## Раскадровка и генерации

Главная задача админки — раскадровка: кадр (картинка) для каждой сцены.

**Текущий процесс (ручной).** Персонажей генерируют в ComfyUI, кладут в папку ролика и вписывают путь в `characters.base_img`. Затем по каждой сцене:
1. Взять промпт кнопкой «Для ComfyUI»: промпт плюс пути к картинкам персонажей.
2. Дорабатывать промпт, пока картинка не получится.
3. Сработавший промпт записать в `scenes.manual_prompt`, файл положить по схеме и вписать путь в `base_image_url`.

Пары `visual_prompt` → `manual_prompt` потом используем, чтобы улучшить автоматические промпты.
- `visual_prompt` — **авто-промпт, вручную не перезаписываем**; правка человека идёт только в `manual_prompt`. В карточке сцены показывается разница (`PromptDiff`).
- Пути в БД — **относительно ComfyUI/output** (схема в `lib/media.ts`):
  `anima/<folder>/characters/<slug имени>.png`, `anima/<folder>/scenes/<scena 2 знака>-<shot_num>.png`.
- `topics.folder` — папка ролика: транслит названия, при совпадении `-2`, `-3`… Назначает **админка** (единственное место, где создаются ролики) один раз, как только у ролика есть настоящее название (не «Новый ролик»): `assignFolders` в `store/data.tsx`, `uniqueFolder` в `lib/media.ts`. Дальше не меняется — переименование ролика пути не ломает. В БД — только колонка и уникальный индекс `topics_folder_key` (`supabase/topic_folder.sql`), триггеров нет.
  Полный путь тоже понимается: корень `VITE_MEDIA_ROOT` (по умолчанию = `MEDIA_DIR`) или всё до `/output/` отрезается. `PathHint` под полем подсказывает путь и предлагает сократить полный.
- Класть **оригинальные PNG из ComfyUI** (в них зашиты workflow/промпт/seed) — позже вытащим `manual_prompt` автоматически.
- Статусы сцены как прогресс: draft → ready (кадр есть) → approved.

**Генерация из админки (n8n).**
- Админка ставит `scenes.status = 'generating'` и шлёт POST на вебхук n8n (`VITE_N8N_IMAGE_WEBHOOK`, в dev идёт через прокси `/n8n`, чтобы не было CORS). Тело запроса: `{action:'scene_image', scene_id, topic_id, output_prefix, prompt (= manual_prompt || visual_prompt), visual_style, requested_by, scene, characters}` (`characters` — записи персонажей сцены). Если вебхук ответил ошибкой, статус становится `'error'`.
- n8n запускает ComfyUI с `filename_prefix = output_prefix` (`anima/<folder>/scenes/03-1`), затем пишет в БД относительный путь `base_image_url = 'anima/…/scenes/03-1_00001_.png'` и `status = 'ready'` (или `'error'`).
- Пока есть сцены в статусе `generating`, админка обновляет данные каждые 4 с.
- Файлы лежат на диске сервера (ComfyUI/output), в Supabase Storage не кладём. Фронт строит URL через `mediaUrl()` (`lib/media.ts`) как `VITE_MEDIA_BASE_URL` + путь; полные http-URL отдаются как есть. В dev папка `MEDIA_DIR` раздаётся плагином в `vite.config.ts` по `/media`, в проде это делает nginx.

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
  pages/              — Dashboard, ContentPlan + TopicCard, Script (сценарий из extended_description), Scenes + SceneCard, Storyboard (сетка кадров), Characters + CharacterCard, Agents, Settings
  components/TopicSelect.tsx — выбор ролика (общий для Сцен/Персонажей, последний — в localStorage)
  api/pipeline.ts     — вебхуки n8n (генерации)
  lib/media.ts        — mediaUrl(): относительный путь → URL
supabase/policies.sql — admin_users, is_admin(), RLS-политики, FK scenes.topic
```

### Принципы

- UI ходит в данные только через `api`. Новая таблица → методы в `Api` + реализация в `api/supabase.ts`.
- Пустые значения nullable-полей сохраняются как `null` (не `''`); NOT NULL поля помечаются `required` в FieldDef.
- Маршруты: `/dashboard`, `/topics/:topicId?`, `/scenes/:topicId?` (`?scene=<id>`), `/script/:topicId?`, `/storyboard/:topicId?` (`?scene=<id>`), `/characters/:topicId?` (`?character=<id>`), `/agents` (`?agent=`), `/settings/:section?`. Выбранная сущность — в URL.
- Настройки таблиц и фильтры — в localStorage по `storageKey`.
- Карточки описываются через `GroupDef/FieldDef`; новое поле БД = строка в конфиге группы.
- Права проверяет БД (RLS); фронт ничего не скрывает «для безопасности».
- **Всё, что создаём в БД (таблицы, колонки, функции, триггеры, политики), лежит в `supabase/*.sql`.** Каждый объект подписан через `comment on … is '… Источник: anima_admin/supabase/<файл>.sql'`. Скрипты идемпотентные. Логику держим в коде админки; триггеры — только если в таблицу пишут несколько участников и иначе не обойтись (сейчас триггеров нет).

## Дизайн-токены

`bg-bg`, `bg-surface`, `bg-raised`, `bg-hover`, `border-border`, `text-fg / fg-2 / fg-3`, `accent` (фиолетовый), `gold`, `success`, `danger`, `info`. Шрифты: `font-sans` (Inter), `font-mono` (JetBrains Mono — ID, JSON, промпты).

## Горячие клавиши

`Cmd+K` — поиск, `N` — новая запись, `Esc` — закрыть карточку, `Cmd+S` — сохранить, `Enter` на строке — открыть. Плеер: пробел, ←/→, `,`/`.`.
