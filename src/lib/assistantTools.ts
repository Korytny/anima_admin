// Инструменты ассистента админки (OpenAI function calling). Чтение — из данных, уже загруженных в store;
// запись — не выполняется сразу: возвращается «ожидающее действие», которое человек подтверждает в окне ассистента.
import type { Agent, Character, Scene, Season, Topic } from '@/types'
import { checkScript, parseScript } from './script'
import { checkShots, parseShots } from './shots'
import { sortScenes } from '@/store/data'

export interface ToolDef {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type Table = 'topics' | 'scenes' | 'characters' | 'seasons'

export interface FieldChange {
  field: string
  from: unknown
  to: unknown
}

export type Pending =
  | { kind: 'update'; table: Table; reason: string; rows: { id: string; label: string; changes: FieldChange[] }[] }
  | { kind: 'prompt'; agentId: number; agentName: string; diagnosis: string; note: string; from: string; to: string }

export interface ToolData {
  topics: Topic[]
  scenes: Scene[]
  characters: Character[]
  agents: Agent[]
  seasons: Season[]
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false })
const str = (description: string) => ({ type: 'string', description })

export const TOOL_DEFS: ToolDef[] = [
  { type: 'function', function: { name: 'list_seasons', description: 'Сезоны: id, название, логлайн, папка, стиль.', parameters: obj({}) } },
  {
    type: 'function',
    function: {
      name: 'list_episodes',
      description: 'Серии (topics) сезона или все: topic_id, номер (backlog), название, статус, есть ли биты/сценарий/шоты, сколько шотов в БД.',
      parameters: obj({ season_id: str('id сезона; пусто — все серии') }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_episode',
      description: 'Серия целиком: логлайн, биты, выжимка, персонажи (chars), сценарий (script_scenas), шоты Редактора (script_shots), итоговое видео.',
      parameters: obj({ topic_id: str('topic_id серии') }, ['topic_id']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_shots',
      description: 'Шоты серии из таблицы scenes по порядку: scene_id, scena, shot_num, персонажи, кто говорит и текст, промпты (обрезаны до 300 символов), есть ли кадр/аудио/видео.',
      parameters: obj({ topic_id: str('topic_id серии') }, ['topic_id']),
    },
  },
  { type: 'function', function: { name: 'get_shot', description: 'Один шот (строка scenes) со всеми полями.', parameters: obj({ scene_id: str('scene_id') }, ['scene_id']) } },
  {
    type: 'function',
    function: {
      name: 'list_characters',
      description: 'Персонажи сезона: id, тег (name), name_ru, голос, файлы картинок, промпты внешности.',
      parameters: obj({ season_id: str('id сезона') }, ['season_id']),
    },
  },
  { type: 'function', function: { name: 'list_agents', description: 'Агенты конвейера: id, имя, описание, модель, активен ли, длина промпта.', parameters: obj({}) } },
  { type: 'function', function: { name: 'get_agent', description: 'Агент с полным системным промптом.', parameters: obj({ agent_id: { type: 'integer' } }, ['agent_id']) } },
  {
    type: 'function',
    function: {
      name: 'check_episode',
      description: 'Проверка серии кодом, как на странице «Сценарий»: замечания к сценарию (рассказчик, реплики, биты, теги) и к шотам Редактора (формат, {}, немые сцены, обрывки фраз).',
      parameters: obj({ topic_id: str('topic_id серии') }, ['topic_id']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_records',
      description:
        'Точечно изменить поля записей. НЕ применяется сразу: человек увидит «было → станет» и подтвердит. Не больше 20 записей за раз. Нельзя менять ключи (id, topic_id, scene_id), created_at, updated_at. Массивы (character, char_img_url, beats, chars) передавай массивом.',
      parameters: obj(
        {
          table: { type: 'string', enum: ['topics', 'scenes', 'characters', 'seasons'] },
          reason: str('Зачем меняем — одной фразой, человек увидит'),
          updates: {
            type: 'array',
            items: obj({ id: str('ключ записи: topic_id / scene_id / id'), set: { type: 'object', description: 'поле → новое значение' } }, ['id', 'set']),
          },
        },
        ['table', 'reason', 'updates'],
      ),
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_agent_prompt',
      description:
        'Предложить новую версию системного промпта агента. НЕ применяется сразу: человек увидит разницу и примет или отклонит; принятая версия запишется в историю. Передавай промпт ЦЕЛИКОМ.',
      parameters: obj(
        {
          agent_id: { type: 'integer' },
          diagnosis: str('Почему агент ошибается: промпт / агент выше по цепочке / предел модели'),
          note: str('Что изменено — одной строкой, для истории версий'),
          prompt: str('Полный новый текст промпта'),
        },
        ['agent_id', 'diagnosis', 'note', 'prompt'],
      ),
    },
  },
]

const WRITE_TOOLS = new Set(['update_records', 'propose_agent_prompt'])
export const isWriteTool = (name: string) => WRITE_TOOLS.has(name)

const KEY: Record<Table, string> = { topics: 'topic_id', scenes: 'scene_id', characters: 'id', seasons: 'id' }
const LOCKED = new Set(['id', 'topic_id', 'scene_id', 'created_at', 'updated_at', 'topic', 'all', 'all_eng'])
const MAX_ROWS = 20
const cut = (s: string | null | undefined, n = 300) => (s && s.length > n ? `${s.slice(0, n)}…` : (s ?? null))

const rowsOf = (d: ToolData, table: Table): Record<string, unknown>[] =>
  (table === 'topics' ? d.topics : table === 'scenes' ? d.scenes : table === 'characters' ? d.characters : d.seasons) as unknown as Record<string, unknown>[]

const labelOf = (table: Table, r: Record<string, unknown>) =>
  table === 'scenes' ? `шот ${r.scena ?? '?'}-${r.shot_num ?? '?'}` : table === 'characters' ? String(r.name ?? r.id) : String(r.title ?? r[KEY[table]])

/** Чтение — результат в JSON для модели. Запись — Pending (или ошибка, если запрос некорректен). */
export function runTool(name: string, args: Record<string, any>, d: ToolData): { result: unknown } | { pending: Pending } {
  switch (name) {
    case 'list_seasons':
      return { result: d.seasons.map((s) => ({ id: s.id, title: s.title, logline: s.logline, folder: s.folder, style: s.style, status: s.status })) }
    case 'list_episodes': {
      const list = d.topics.filter((t) => !args.season_id || t.season_id === args.season_id).sort((a, b) => (a.backlog ?? 0) - (b.backlog ?? 0))
      return {
        result: list.map((t) => ({
          topic_id: t.topic_id,
          episode: t.backlog,
          title: t.title,
          season_id: t.season_id,
          status: t.status,
          has_beats: !!t.beats?.length,
          has_script: !!t.script_scenas?.trim(),
          has_shots_text: !!t.script_shots?.trim(),
          shots_in_db: d.scenes.filter((s) => s.topic === t.topic_id).length,
        })),
      }
    }
    case 'get_episode': {
      const t = d.topics.find((x) => x.topic_id === args.topic_id)
      if (!t) return { result: { error: 'Серия не найдена' } }
      const { topic_id, title, backlog, season_id, status, logline, beats, source_excerpt, chars, script_scenas, script_shots, url_final, folder } = t
      return { result: { topic_id, title, episode: backlog, season_id, status, logline, beats, source_excerpt, chars, script_scenas, script_shots, url_final, folder } }
    }
    case 'list_shots': {
      const list = d.scenes.filter((s) => s.topic === args.topic_id).sort(sortScenes)
      return {
        result: list.map((s) => ({
          scene_id: s.scene_id,
          scena: s.scena,
          shot_num: s.shot_num,
          shot_type: s.shot_type,
          character: s.character,
          speaking_character: s.speaking_character,
          dialogue_text: s.dialogue_text,
          visual_prompt: cut(s.visual_prompt),
          manual_prompt: cut(s.manual_prompt),
          action: cut(s.action),
          location_num: s.location_num,
          status: s.status,
          has_frame: !!s.base_image_url,
          has_audio: !!s.audio_file,
          has_video: !!s.video_file,
        })),
      }
    }
    case 'get_shot':
      return { result: d.scenes.find((s) => s.scene_id === args.scene_id) ?? { error: 'Шот не найден' } }
    case 'list_characters':
      return {
        result: d.characters
          .filter((c) => c.season === args.season_id)
          .map((c) => ({ id: c.id, name: c.name, name_ru: c.name_ru, voice_name: c.voice_name, base_img: c.base_img, pers_file: c.pers_file, filename: c.filename, text_prompt: cut(c.text_prompt, 500), story: cut(c.story, 500) })),
      }
    case 'list_agents':
      return { result: d.agents.map((a) => ({ id: a.id, name: a.name, description: a.description, model: a.model, is_active: a.is_active, prompt_chars: a.prompt?.length ?? 0 })) }
    case 'get_agent': {
      const a = d.agents.find((x) => x.id === Number(args.agent_id))
      return { result: a ? { id: a.id, name: a.name, description: a.description, model: a.model, is_active: a.is_active, prompt: a.prompt } : { error: 'Агент не найден' } }
    }
    case 'check_episode': {
      const t = d.topics.find((x) => x.topic_id === args.topic_id)
      if (!t) return { result: { error: 'Серия не найдена' } }
      const tags = d.characters.filter((c) => c.season === t.season_id).map((c) => c.name ?? '').filter(Boolean)
      const script = parseScript(t.script_scenas)
      const sc = checkScript(script, { beats: t.beats, known: tags.length ? new Set(tags.map((x) => x.toLowerCase())) : undefined })
      const shots = t.script_shots?.trim() ? checkShots(parseShots(t.script_shots), { script, tags }) : null
      return {
        result: {
          script: { scenes: script.scenes.length, narrator_words: sc.narratorWords, character_lines: sc.characterLines, issues: sc.issues },
          shots: shots ? { issues: shots.issues, silent_shots: shots.silent, seconds: shots.seconds } : 'script_shots пуст',
        },
      }
    }
    case 'update_records': {
      const table = args.table as Table
      if (!KEY[table]) return { result: { error: `Таблица ${table} недоступна` } }
      const updates = (args.updates ?? []) as { id: string; set: Record<string, unknown> }[]
      if (!updates.length) return { result: { error: 'Пустой список изменений' } }
      if (updates.length > MAX_ROWS) return { result: { error: `Не больше ${MAX_ROWS} записей за раз — разбей на части` } }
      const all = rowsOf(d, table)
      const rows: Extract<Pending, { kind: 'update' }>['rows'] = []
      for (const u of updates) {
        const r = all.find((x) => x[KEY[table]] === u.id)
        if (!r) return { result: { error: `Нет записи ${u.id} в ${table}` } }
        const locked = Object.keys(u.set ?? {}).filter((f) => LOCKED.has(f))
        if (locked.length) return { result: { error: `Эти поля менять нельзя: ${locked.join(', ')}` } }
        const unknown = Object.keys(u.set ?? {}).filter((f) => !(f in r))
        if (unknown.length) return { result: { error: `В ${table} нет полей: ${unknown.join(', ')}` } }
        const changes = Object.entries(u.set).map(([field, to]) => ({ field, from: r[field], to }))
        rows.push({ id: u.id, label: labelOf(table, r), changes })
      }
      return { pending: { kind: 'update', table, reason: String(args.reason ?? ''), rows } }
    }
    case 'propose_agent_prompt': {
      const a = d.agents.find((x) => x.id === Number(args.agent_id))
      if (!a) return { result: { error: 'Агент не найден' } }
      if (!String(args.prompt ?? '').trim()) return { result: { error: 'Пустой промпт' } }
      return { pending: { kind: 'prompt', agentId: a.id, agentName: a.name ?? `#${a.id}`, diagnosis: String(args.diagnosis ?? ''), note: String(args.note ?? ''), from: a.prompt ?? '', to: String(args.prompt) } }
    }
    default:
      return { result: { error: `Нет инструмента ${name}` } }
  }
}
