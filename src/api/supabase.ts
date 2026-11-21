import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Agent, AgentPromptVersion, ProcessSettings, Task, TaskComment, TeamMember, Season, Character, Scene, Topic } from '@/types'

const PAGE = 1000

function check<T>(res: { data: T | null; error: PostgrestError | null }): T {
  if (res.error) throw new Error(res.error.message + (res.error.hint ? ` (${res.error.hint})` : ''))
  return res.data as T
}

/** Выбирает все строки постранично (PostgREST отдаёт максимум 1000 за запрос). */
async function selectAll<T>(table: string, orderBy: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const rows = check(await supabase.from(table).select('*').order(orderBy, { ascending: false, nullsFirst: false }).range(from, from + PAGE - 1)) as T[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

const now = () => new Date().toISOString()

export const NEW_TOPIC_TITLE = 'Новый ролик'
export const NEW_SEASON_TITLE = 'Новый сезон'

export const supabaseData = {
  listTopics: () => selectAll<Topic>('topics', 'updated_at'),

  async createTopic(data: Partial<Topic> = {}) {
    return check(await supabase.from('topics').insert({ title: NEW_TOPIC_TITLE, status: 'draft', ...data }).select().single()) as Topic
  },

  async updateTopic(id: string, patch: Partial<Topic>) {
    return check(await supabase.from('topics').update({ ...patch, updated_at: now() }).eq('topic_id', id).select().single()) as Topic
  },

  async updateTopics(ids: string[], patch: Partial<Topic>) {
    return check(await supabase.from('topics').update({ ...patch, updated_at: now() }).in('topic_id', ids).select()) as Topic[]
  },

  async deleteTopics(ids: string[]) {
    // FK может быть без ON DELETE CASCADE — сначала сцены
    check(await supabase.from('scenes').delete().in('topic', ids))
    check(await supabase.from('topics').delete().in('topic_id', ids))
  },

  // seasons: пока supabase/seasons.sql не выполнен, таблицы нет — не роняем всю загрузку
  async listSeasons() {
    try {
      return await selectAll<Season>('seasons', 'created_at')
    } catch (e) {
      console.warn('[seasons] таблица недоступна — выполните supabase/seasons.sql', e)
      return []
    }
  },

  async createSeason(data: Partial<Season> = {}) {
    return check(await supabase.from('seasons').insert({ title: NEW_SEASON_TITLE, ...data }).select().single()) as Season
  },

  async updateSeason(id: string, patch: Partial<Season>) {
    return check(await supabase.from('seasons').update(patch).eq('id', id).select().single()) as Season
  },

  async deleteSeasons(ids: string[]) {
    check(await supabase.from('seasons').delete().in('id', ids))
  },

  listScenes: () => selectAll<Scene>('scenes', 'updated_at'),

  async createScene(topicId: string, data: Partial<Scene> = {}) {
    const last = check(
      await supabase.from('scenes').select('scena').eq('topic', topicId).order('scena', { ascending: false, nullsFirst: false }).limit(1),
    ) as { scena: number | null }[]
    const scena = (last[0]?.scena ?? 0) + 1
    return check(await supabase.from('scenes').insert({ topic: topicId, status: 'draft', scena, shot_num: 1, ...data }).select().single()) as Scene
  },

  async updateScene(id: string, patch: Partial<Scene>) {
    return check(await supabase.from('scenes').update({ ...patch, updated_at: now() }).eq('scene_id', id).select().single()) as Scene
  },

  async updateScenes(ids: string[], patch: Partial<Scene>) {
    return check(await supabase.from('scenes').update({ ...patch, updated_at: now() }).in('scene_id', ids).select()) as Scene[]
  },

  async deleteScenes(ids: string[]) {
    check(await supabase.from('scenes').delete().in('scene_id', ids))
  },

  // characters: updated_at нет — порядок по created_at
  listCharacters: () => selectAll<Character>('characters', 'created_at'),

  async createCharacter(seasonId: string, data: Partial<Character> = {}) {
    return check(await supabase.from('characters').insert({ season: seasonId, name: 'Новый персонаж', ...data }).select().single()) as Character
  },

  async updateCharacter(id: string, patch: Partial<Character>) {
    return check(await supabase.from('characters').update(patch).eq('id', id).select().single()) as Character
  },

  async deleteCharacters(ids: string[]) {
    check(await supabase.from('characters').delete().in('id', ids))
  },

  // agents: id bigint, updated_at нет
  listAgents: () => selectAll<Agent>('agents', 'id'),

  async createAgent(data: Partial<Agent> = {}) {
    return check(await supabase.from('agents').insert({ name: 'Новый агент', is_active: false, ...data }).select().single()) as Agent
  },

  async updateAgent(id: number, patch: Partial<Agent>) {
    return check(await supabase.from('agents').update(patch).eq('id', id).select().single()) as Agent
  },

  // Задачи команды: supabase/tasks.sql. Переписка — массив comments в той же строке
  listTasks: () => selectAll<Task>('tasks', 'updated_at'),
  async listTeam() {
    return check(await supabase.from('admin_users').select('user_id, email, name')) as TeamMember[]
  },
  async createTask(data: Partial<Task>) {
    return check(await supabase.from('tasks').insert({ title: 'Новая задача', ...data }).select().single()) as Task
  },
  async updateTask(id: string, patch: Partial<Task>) {
    return check(await supabase.from('tasks').update({ ...patch, updated_at: now() }).eq('id', id).select().single()) as Task
  },
  async deleteTask(id: string) {
    check(await supabase.from('tasks').delete().eq('id', id))
  },
  /** Дописать сообщение к СВЕЖЕЙ переписке: перечитываем задачу и сохраняем, только если её не меняли с момента чтения (иначе — снова). */
  async addTaskComment(id: string, comment: TaskComment) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const cur = check(await supabase.from('tasks').select('comments, updated_at').eq('id', id).single()) as Pick<Task, 'comments' | 'updated_at'>
      const res = await supabase
        .from('tasks')
        .update({ comments: [...(cur.comments ?? []), comment], updated_at: now() })
        .eq('id', id)
        .eq('updated_at', cur.updated_at)
        .select()
      const rows = check(res) as Task[]
      if (rows.length) return rows[0]
    }
    throw new Error('Задачу одновременно меняют — сообщение не сохранилось, попробуйте ещё раз')
  },

  // Настройки процессов ComfyUI: supabase/process_settings.sql
  async listProcessSettings() {
    const rows = check(await supabase.from('process_settings').select('file, settings')) as { file: string; settings: ProcessSettings }[]
    return Object.fromEntries(rows.map((r) => [r.file, r.settings ?? {}]))
  },

  async saveProcessSettings(file: string, settings: ProcessSettings) {
    check(await supabase.from('process_settings').upsert({ file, settings, updated_at: new Date().toISOString() }).select().single())
  },

  // История промптов: supabase/agent_prompt_versions.sql
  async listPromptVersions(agentId: number) {
    return check(await supabase.from('agent_prompt_versions').select('*').eq('agent_id', agentId).order('id', { ascending: false })) as AgentPromptVersion[]
  },

  async addPromptVersion(v: Pick<AgentPromptVersion, 'agent_id' | 'prompt' | 'model' | 'source' | 'note'>) {
    return check(await supabase.from('agent_prompt_versions').insert(v).select().single()) as AgentPromptVersion
  },

  async deleteAgents(ids: number[]) {
    check(await supabase.from('agents').delete().in('id', ids))
  },
}
