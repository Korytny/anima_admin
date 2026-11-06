import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api } from '@/api'
import { requestSceneImage } from '@/api/pipeline'
import type { Agent, Character, Scene, Topic } from '@/types'

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
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

function useDataStore() {
  const [state, setState] = useState<DataState>({ loading: true, refreshing: false, error: null, topics: [], scenes: [], characters: [], agents: [] })

  const load = useCallback(async (silent = false) => {
    setState((s) => ({ ...s, refreshing: true }))
    try {
      const [topics, scenes, characters, agents] = await Promise.all([api.listTopics(), api.listScenes(), api.listCharacters(), api.listAgents()])
      setState({ loading: false, refreshing: false, error: null, topics, scenes, characters, agents })
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

        const results = await Promise.allSettled(scenes.map((sc) => requestSceneImage(sc, topics.find((t) => t.topic_id === sc.topic), sceneCharacters(sc, characters))))
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

      // ----- персонажи
      async createCharacter(topicId: string) {
        const c = await run(api.createCharacter(topicId), 'Персонаж добавлен')
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

      // ----- агенты (демо)
      async createAgent(data?: Partial<Agent>) {
        const a = await run(api.createAgent(data), 'Агент создан')
        if (a) setState((s) => ({ ...s, agents: [...s.agents, a] }))
        return a
      },
      async updateAgent(id: string, patch: Partial<Agent>, silent = false) {
        const a = await run(api.updateAgent(id, patch), silent ? undefined : 'Сохранено')
        if (a) setState((s) => ({ ...s, agents: s.agents.map((x) => (x.id === id ? a : x)) }))
        return a
      },
      async deleteAgents(ids: string[]) {
        const ok = await run(api.deleteAgents(ids).then(() => true), `Удалено агентов: ${ids.length}`)
        if (ok) setState((s) => ({ ...s, agents: s.agents.filter((a) => !ids.includes(a.id)) }))
      },
    }),
    [run, load],
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

/** Персонажи сцены: того же ролика, имя есть в scene.character или = speaking_character. */
export function sceneCharacters(scene: Scene, characters: Character[]) {
  const names = new Set([...(scene.character ?? []), scene.speaking_character].map(norm).filter(Boolean))
  return characters.filter((c) => c.topic === scene.topic && names.has(norm(c.name)))
}

/** Картинки персонажа (какое поле главное — пока не определено, берём все заполненные). */
export const characterImages = (c: Character) => [c.base_img, c.pers_file, c.filename].filter((x): x is string => !!x)

export const characterTitle = (c: Character) => c.name || `Персонаж ${shortId(c.id)}`
