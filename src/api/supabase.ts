import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Character, Scene, Topic } from '@/types'

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

export const supabaseData = {
  listTopics: () => selectAll<Topic>('topics', 'updated_at'),

  async createTopic(data: Partial<Topic> = {}) {
    return check(await supabase.from('topics').insert({ title: 'Новый ролик', status: 'draft', ...data }).select().single()) as Topic
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

  async createCharacter(topicId: string, data: Partial<Character> = {}) {
    return check(await supabase.from('characters').insert({ topic: topicId, name: 'Новый персонаж', ...data }).select().single()) as Character
  },

  async updateCharacter(id: string, patch: Partial<Character>) {
    return check(await supabase.from('characters').update(patch).eq('id', id).select().single()) as Character
  },

  async deleteCharacters(ids: string[]) {
    check(await supabase.from('characters').delete().in('id', ids))
  },
}
