import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api } from '@/api'
import { requestSceneImage } from '@/api/pipeline'
import { NEW_SEASON_TITLE, NEW_TOPIC_TITLE } from '@/api/supabase'
import { uniqueFolder } from '@/lib/media'
import type { Agent, Character, Scene, Season, Topic } from '@/types'

// Пайплайн (n8n и т.п.) пишет в БД сам — периодически подтягиваем изменения.
// Пока что-то генерируется — чаще.
const REFRESH_MS = 20_000
const REFRESH_ACTIVE_MS = 4_000
export const GENERATING = 'generating'

interface DataState {
  loading: boolean
  refreshing: boolean
  error: string | null
  topics: Topic[]
  scenes: Scene[]
  characters: Character[]
  agents: Agent[]
  seasons: Season[]
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

function useDataStore() {
  const [state, setState] = useState<DataState>({ loading: true, refreshing: false, error: null, topics: [], scenes: [], characters: [], agents: [], seasons: [] })
  const stateRef = useRef(state)
  stateRef.current = state

  // Папка ролика (topics.folder) назначается один раз — как только у ролика есть настоящее название.
  // Дальше не меняется. Уникальность гарантирует индекс topics_folder_key; при гонке — следующий суффикс.
  const assigning = useRef(false)
  const assignFolders = useCallback(async (topics: Topic[]) => {
    const todo = topics.filter((t) => !t.folder && t.title?.trim() && t.title !== NEW_TOPIC_TITLE)
    if (!todo.length || assigning.current) return
    assigning.current = true
    const taken = new Set([...topics.map((t) => t.folder), ...stateRef.current.seasons.map((x) => x.folder)].filter((f): f is string => !!f))
    const done: Topic[] = []
    try {
      for (const t of todo) {
        for (let attempt = 0; attempt < 5; attempt++) {
          const folder = uniqueFolder(t.title, taken)
          taken.add(folder)
          try {
            done.push(await api.updateTopic(t.topic_id, { folder }))
            break
          } catch (e) {
            if (!/duplicate key|topics_folder_key/.test(errMsg(e))) throw e
          }
        }
      }
    } catch (e) {
      toast.error('Не удалось назначить папку ролику', { description: errMsg(e) })
    } finally {
      assigning.current = false
    }
    if (done.length) {
      const map = new Map(done.map((t) => [t.topic_id, t]))
      setState((s) => ({ ...s, topics: s.topics.map((x) => map.get(x.topic_id) ?? x) }))
      toast.success(done.length === 1 ? `Папка ролика: ${done[0].folder}` : `Назначены папки: ${done.length} роликов`)
    }
  }, [])

  // Папка сезона (seasons.folder) — так же: один раз, по названию. Имена папок общие с роликами (всё лежит в anima/).
  const assigningSeasons = useRef(false)
  const assignSeasonFolders = useCallback(async (seasons: Season[], topics: Topic[]) => {
    const todo = seasons.filter((x) => !x.folder && x.title?.trim() && x.title !== NEW_SEASON_TITLE)
    if (!todo.length || assigningSeasons.current) return
    assigningSeasons.current = true
    const taken = new Set([...seasons.map((x) => x.folder), ...topics.map((t) => t.folder)].filter((f): f is string => !!f))
    const done: Season[] = []
    try {
      for (const x of todo) {
        for (let attempt = 0; attempt < 5; attempt++) {
          const folder = uniqueFolder(x.title, taken)
          taken.add(folder)
          try {
            done.push(await api.updateSeason(x.id, { folder }))
            break
          } catch (e) {
            if (!/duplicate key|seasons_folder_key/.test(errMsg(e))) throw e
          }
        }
      }
    } catch (e) {
      // колонки folder ещё нет (не выполнен supabase/characters_season.sql) — молча ждём
      if (!/folder/.test(errMsg(e))) toast.error('Не удалось назначить папку сезону', { description: errMsg(e) })
    } finally {
      assigningSeasons.current = false
    }
    if (done.length) {
      const map = new Map(done.map((x) => [x.id, x]))
      setState((s) => ({ ...s, seasons: s.seasons.map((x) => map.get(x.id) ?? x) }))
      toast.success(`Папка сезона: ${done.map((x) => x.folder).join(', ')}`)
    }
  }, [])

  const load = useCallback(async (silent = false) => {
    setState((s) => ({ ...s, refreshing: true }))
    try {
      const [topics, scenes, characters, agents, seasons] = await Promise.all([api.listTopics(), api.listScenes(), api.listCharacters(), api.listAgents(), api.listSeasons()])
      setState({ loading: false, refreshing: false, error: null, topics, scenes, characters, agents, seasons })
      void assignFolders(topics)
      void assignSeasonFolders(seasons, topics)
    } catch (e) {
      if (!silent) toast.error('Не удалось загрузить данные', { description: errMsg(e) })
      setState((s) => ({ ...s, loading: false, refreshing: false, error: errMsg(e) }))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const active = state.scenes.some((s) => s.status === GENERATING)
  useEffect(() => {
    const t = setInterval(() => !document.hidden && load(true), active ? REFRESH_ACTIVE_MS : REFRESH_MS)
    return () => clearInterval(t)
  }, [load, active])

  const run = useCallback(async <T,>(p: Promise<T>, ok?: string): Promise<T | undefined> => {
    try {
      const r = await p
      if (ok) toast.success(ok)
      return r
    } catch (e) {
      toast.error('Ошибка', { description: errMsg(e) })
      return undefined
    }
  }, [])

  const actions = useMemo(
    () => ({
      reload: () => load(),

      // ----- ролики (topics)
      async createTopic(data?: Partial<Topic>) {
        const t = await run(api.createTopic(data), 'Ролик создан')
        if (t) setState((s) => ({ ...s, topics: [t, ...s.topics] }))
        return t
      },
      async updateTopic(id: string, patch: Partial<Topic>) {
        const t = await run(api.updateTopic(id, patch), 'Сохранено')
        if (t) setState((s) => ({ ...s, topics: s.topics.map((x) => (x.topic_id === id ? t : x)) }))
        if (t) void assignFolders([t, ...stateRef.current.topics.filter((x) => x.topic_id !== id)])
        return t
      },
      async updateTopics(ids: string[], patch: Partial<Topic>) {
        const res = await run(api.updateTopics(ids, patch), `Обновлено: ${ids.length}`)
        if (res) {
          const map = new Map(res.map((t) => [t.topic_id, t]))
          setState((s) => ({ ...s, topics: s.topics.map((x) => map.get(x.topic_id) ?? x) }))
        }
      },
      async deleteTopics(ids: string[]) {
        const ok = await run(api.deleteTopics(ids).then(() => true), `Удалено роликов: ${ids.length}`)
        if (ok)
          setState((s) => ({
            ...s,
            topics: s.topics.filter((t) => !ids.includes(t.topic_id)),
            scenes: s.scenes.filter((x) => !x.topic || !ids.includes(x.topic)),
          }))
      },

      // ----- сцены
      async createScene(topicId: string) {
        const sc = await run(api.createScene(topicId), 'Сцена добавлена')
        if (sc) setState((s) => ({ ...s, scenes: [...s.scenes, sc] }))
        return sc
      },
      async updateScene(id: string, patch: Partial<Scene>) {
        const sc = await run(api.updateScene(id, patch), 'Сохранено')
        if (sc) setState((s) => ({ ...s, scenes: s.scenes.map((x) => (x.scene_id === id ? sc : x)) }))
        return sc
      },
      async updateScenes(ids: string[], patch: Partial<Scene>) {
        const res = await run(api.updateScenes(ids, patch), `Обновлено сцен: ${ids.length}`)
        if (res) {
          const map = new Map(res.map((x) => [x.scene_id, x]))
          setState((s) => ({ ...s, scenes: s.scenes.map((x) => map.get(x.scene_id) ?? x) }))
        }
      },
      async deleteScenes(ids: string[]) {
        const ok = await run(api.deleteScenes(ids).then(() => true), `Удалено сцен: ${ids.length}`)
        if (ok) setState((s) => ({ ...s, scenes: s.scenes.filter((x) => !ids.includes(x.scene_id)) }))
      },

      /** Ставит сцены в 'generating' и дергает вебхук n8n по каждой. Ошибка запуска → 'error'. */
      async generateSceneImages(scenes: Scene[], topics: Topic[], characters: Character[]) {
        if (!scenes.length) return
        const ids = scenes.map((s) => s.scene_id)
        const marked = await run(api.updateScenes(ids, { status: GENERATING }))
        if (!marked) return
        const map = new Map(marked.map((x) => [x.scene_id, x]))
        setState((s) => ({ ...s, scenes: s.scenes.map((x) => map.get(x.scene_id) ?? x) }))

        const results = await Promise.allSettled(
          scenes.map((sc) => {
            const t = topics.find((x) => x.topic_id === sc.topic)
            const season = stateRef.current.seasons.find((x) => x.id === t?.season_id)
            return requestSceneImage(sc, t, season, sceneCharacters(sc, seasonCharacters(t?.season_id, characters)))
          }),
        )
        const failed = ids.filter((_, i) => results[i].status === 'rejected')
        if (failed.length) {
          const reason = (results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason
          toast.error(`Не удалось запустить генерацию: ${failed.length} из ${ids.length}`, { description: errMsg(reason) })
          const res = await api.updateScenes(failed, { status: 'error' }).catch(() => null)
          if (res) {
            const m = new Map(res.map((x) => [x.scene_id, x]))
            setState((s) => ({ ...s, scenes: s.scenes.map((x) => m.get(x.scene_id) ?? x) }))
          }
        }
        if (failed.length < ids.length) toast.success(`Генерация запущена: ${ids.length - failed.length}`)
      },

      // ----- персонажи (библиотека сезона)
      async createCharacter(seasonId: string) {
        const c = await run(api.createCharacter(seasonId), 'Персонаж добавлен')
        if (c) setState((s) => ({ ...s, characters: [c, ...s.characters] }))
        return c
      },
      async updateCharacter(id: string, patch: Partial<Character>) {
        const c = await run(api.updateCharacter(id, patch), 'Сохранено')
        if (c) setState((s) => ({ ...s, characters: s.characters.map((x) => (x.id === id ? c : x)) }))
        return c
      },
      async deleteCharacters(ids: string[]) {
        const ok = await run(api.deleteCharacters(ids).then(() => true), `Удалено персонажей: ${ids.length}`)
        if (ok) setState((s) => ({ ...s, characters: s.characters.filter((x) => !ids.includes(x.id)) }))
      },

      // ----- агенты
      async createAgent(data?: Partial<Agent>) {
        const a = await run(api.createAgent(data), 'Агент создан')
        if (a) setState((s) => ({ ...s, agents: [...s.agents, a] }))
        return a
      },
      async updateAgent(id: number, patch: Partial<Agent>, silent = false) {
        const a = await run(api.updateAgent(id, patch), silent ? undefined : 'Сохранено')
        if (a) setState((s) => ({ ...s, agents: s.agents.map((x) => (x.id === id ? a : x)) }))
        return a
      },
      // ----- сезоны
      async createSeason(data?: Partial<Season>) {
        const x = await run(api.createSeason(data), 'Сезон создан')
        if (x) setState((s) => ({ ...s, seasons: [...s.seasons, x] }))
        return x
      },
      async updateSeason(id: string, patch: Partial<Season>) {
        const x = await run(api.updateSeason(id, patch), 'Сохранено')
        if (x) setState((s) => ({ ...s, seasons: s.seasons.map((y) => (y.id === id ? x : y)) }))
        if (x) void assignSeasonFolders([x, ...stateRef.current.seasons.filter((y) => y.id !== id)], stateRef.current.topics)
        return x
      },
      async deleteSeasons(ids: string[]) {
        const ok = await run(api.deleteSeasons(ids).then(() => true), 'Сезон удалён')
        if (ok)
          setState((s) => ({ ...s, seasons: s.seasons.filter((x) => !ids.includes(x.id)) })) // сезон с сериями страница «Сезоны» удалить не даёт
      },

      async deleteAgents(ids: number[]) {
        const ok = await run(api.deleteAgents(ids).then(() => true), `Удалено агентов: ${ids.length}`)
        if (ok) setState((s) => ({ ...s, agents: s.agents.filter((a) => !ids.includes(a.id)) }))
      },
    }),
    [run, load, assignFolders, assignSeasonFolders],
  )

  return { ...state, ...actions }
}

type DataCtx = ReturnType<typeof useDataStore>
const Ctx = createContext<DataCtx | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const store = useDataStore()
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useData() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useData outside DataProvider')
  return c
}

// ----- производные

export const shortId = (uuid: string) => uuid.slice(0, 8)

export function topicTitle(t?: Pick<Topic, 'title' | 'topic_id'> | null) {
  if (!t) return '—'
  return t.title || `Ролик ${shortId(t.topic_id)}`
}

export function sortScenes(a: Scene, b: Scene) {
  return (a.scena ?? 1e9) - (b.scena ?? 1e9) || (a.shot_num ?? 1e9) - (b.shot_num ?? 1e9)
}

/** Сцены по ролику (отсортированы по scena, shot_num). */
export function useScenesByTopic() {
  const { scenes } = useData()
  return useMemo(() => {
    const m = new Map<string, Scene[]>()
    for (const s of scenes) if (s.topic) m.set(s.topic, [...(m.get(s.topic) ?? []), s])
    for (const list of m.values()) list.sort(sortScenes)
    return m
  }, [scenes])
}

/** Превью сцены — сгенерированный кадр, иначе картинка персонажа. */
export const scenePreview = (s: Scene) => s.base_image_url || s.char_img_url?.find(Boolean) || undefined

/** Превью ролика — первая картинка первой сцены. */
export function topicPreview(scenes: Scene[] | undefined) {
  for (const s of scenes ?? []) {
    const img = scenePreview(s)
    if (img) return img
  }
  return undefined
}

// ----- персонажи

const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()

/** Библиотека персонажей сезона. */
export const seasonCharacters = (seasonId: string | null | undefined, characters: Character[]) =>
  seasonId ? characters.filter((c) => c.season === seasonId) : []

/** Персонажи сцены из библиотеки (pool — персонажи сезона серии): имя есть в scene.character или = speaking_character. */
export function sceneCharacters(scene: Scene, pool: Character[]) {
  const names = new Set([...(scene.character ?? []), scene.speaking_character].map(norm).filter(Boolean))
  return pool.filter((c) => names.has(norm(c.name)))
}

/** Кто в кадре: имена из scene.character (+ говорящий), known — есть ли такой персонаж в библиотеке сезона (pool). */
export function sceneCast(scene: Scene, pool: Character[]) {
  const known = new Set(pool.map((c) => norm(c.name)))
  const names = [...new Set([...(scene.character ?? []), scene.speaking_character].filter((x): x is string => !!x?.trim()).map((x) => x.trim()))]
  return names.map((name) => ({ name, known: known.has(norm(name)) }))
}

/** Картинки персонажа (какое поле главное — пока не определено, берём все заполненные). */
export const characterImages = (c: Character) => [c.base_img, c.pers_file, c.filename].filter((x): x is string => !!x)

export const characterTitle = (c: Character) => c.name || `Персонаж ${shortId(c.id)}`

// ----- сезоны и стадии серии

/** Выбранный сезон (localStorage): id сезона | ALL_SEASONS. Общий для «Сезонов» и «Контент-плана». У каждого ролика есть сезон. */
export const SEASON_KEY = 'seasons:last'
export const ALL_SEASONS = 'all'

export const seasonTitle = (s?: Pick<Season, 'title' | 'id'> | null) => (s ? s.title || `Сезон ${shortId(s.id)}` : '—')

/** Серии сезона по номеру (backlog). */
export const seasonEpisodes = (seasonId: string, topics: Topic[]) =>
  topics.filter((t) => t.season_id === seasonId).sort((a, b) => (a.backlog ?? 1e9) - (b.backlog ?? 1e9))

export type Stage = 'idea' | 'beats' | 'script' | 'shots' | 'frames' | 'published'

export const STAGES: Record<Stage, { label: string; color: string }> = {
  idea: { label: 'Идея', color: '#71717A' },
  beats: { label: 'Биты', color: '#3B82F6' },
  script: { label: 'Сценарий', color: '#8B5CF6' },
  shots: { label: 'Шоты', color: '#F59E0B' },
  frames: { label: 'Кадры', color: '#10B981' },
  published: { label: 'Опубликован', color: '#22C55E' },
}

/** Стадия серии — вычисляется по данным, руками не ведётся. */
export function topicStage(t: Topic, scenes: Scene[] = []): Stage {
  if (t.status === 'published') return 'published'
  if (scenes.length && scenes.every((s) => s.base_image_url)) return 'frames'
  if (scenes.length) return 'shots'
  if (t.script_scenas?.trim()) return 'script'
  if (t.beats?.some((b) => b.trim())) return 'beats'
  return 'idea'
}
