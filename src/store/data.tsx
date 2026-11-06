import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api } from '@/api'
import type { Agent, Scene, Topic } from '@/types'

// Пайплайн (n8n и т.п.) пишет в БД сам — периодически подтягиваем изменения.
const REFRESH_MS = 20_000

interface DataState {
  loading: boolean
  refreshing: boolean
  error: string | null
  topics: Topic[]
  scenes: Scene[]
  agents: Agent[]
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

function useDataStore() {
  const [state, setState] = useState<DataState>({ loading: true, refreshing: false, error: null, topics: [], scenes: [], agents: [] })

  const load = useCallback(async (silent = false) => {
    setState((s) => ({ ...s, refreshing: true }))
    try {
      const [topics, scenes, agents] = await Promise.all([api.listTopics(), api.listScenes(), api.listAgents()])
      setState({ loading: false, refreshing: false, error: null, topics, scenes, agents })
    } catch (e) {
      if (!silent) toast.error('Не удалось загрузить данные', { description: errMsg(e) })
      setState((s) => ({ ...s, loading: false, refreshing: false, error: errMsg(e) }))
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => !document.hidden && load(true), REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

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

/** Превью ролика — первая картинка первой сцены. */
export function topicPreview(scenes: Scene[] | undefined) {
  for (const s of scenes ?? []) {
    const img = s.char_img_url?.find(Boolean) || s.base_image_url
    if (img) return img
  }
  return undefined
}
