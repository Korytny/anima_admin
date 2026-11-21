import type { UserRole } from '@/types'

export interface StatusMeta {
  label: string
  color: string
  pulse?: boolean
}

// Статусы в БД — свободный text. Известные значения раскрашиваем,
// неизвестные показываем как есть серым (см. statusMeta).
export const TOPIC_STATUS: Record<string, StatusMeta> = {
  draft: { label: 'Черновик', color: '#71717A' },
  pending: { label: 'В работе', color: '#8B5CF6', pulse: true },
  done: { label: 'Готов', color: '#10B981' },
  published: { label: 'Опубликован', color: '#3B82F6' },
  Unpublished: { label: 'Снят с публикации', color: '#F59E0B' },
}

export const SCENE_STATUS: Record<string, StatusMeta> = {
  draft: { label: 'Черновик', color: '#71717A' },
  generating: { label: 'Генерация', color: '#8B5CF6', pulse: true },
  ready: { label: 'Готова', color: '#3B82F6' },
  approved: { label: 'Одобрена', color: '#10B981' },
  error: { label: 'Ошибка', color: '#EF4444' },
}

const UNKNOWN = '#52525B'

export function statusMeta(map: Record<string, StatusMeta>, value: string | null | undefined): StatusMeta | undefined {
  if (value == null || value === '') return undefined
  return map[value] ?? { label: value, color: UNKNOWN }
}

/** Опции для фильтра/селекта: известные статусы + реально встречающиеся в данных. */
export function statusOptions(map: Record<string, StatusMeta>, values: (string | null)[] = []) {
  const keys = [...new Set([...Object.keys(map), ...values.filter((v): v is string => !!v)])]
  return keys.map((value) => ({ value, label: statusMeta(map, value)!.label }))
}

export const ROLES: Record<UserRole, { label: string; description: string }> = {
  admin: { label: 'Админ', description: 'Полный доступ, включая настройки и ключи' },
  editor: { label: 'Редактор', description: 'Ролики, сцены, агенты' },
  viewer: { label: 'Наблюдатель', description: 'Только просмотр' },
}

export const toOptions = (rec: Record<string, { label: string }>) => Object.entries(rec).map(([value, m]) => ({ value, label: m.label }))

// ── Этап шота в конвейере — вычисляется из данных, руками не ведётся ──
// scenes.status — технический (n8n: generating → ready | error); поверх этапа показываем только «генерация» и «ошибка».
export type SceneStage = 'draft' | 'prompt' | 'photo' | 'voice' | 'animation' | 'montage'

export const SCENE_STAGES: Record<SceneStage, StatusMeta & { hint: string }> = {
  draft: { label: 'Черновик', color: '#71717A', hint: 'нет промпта кадра' },
  prompt: { label: 'Промпт', color: '#3B82F6', hint: 'промпт есть, кадра нет' },
  photo: { label: 'Фото', color: '#8B5CF6', hint: 'кадр есть; озвучки нет (не сделана или шот без текста), видео нет' },
  voice: { label: 'Озвучка', color: '#F59E0B', hint: 'текст шота озвучен, видео нет' },
  animation: { label: 'Анимация', color: '#06B6D4', hint: 'видео шота готово' },
  montage: { label: 'Смонтировано', color: '#10B981', hint: 'у серии есть готовый ролик' },
}
export const SCENE_STAGE_ORDER = Object.keys(SCENE_STAGES) as SceneStage[]

type StageScene = { visual_prompt: string | null; manual_prompt: string | null; base_image_url: string | null; dialogue_text: string | null; audio_file: string | null; video_file: string | null }

/** Этап — по первому несделанному шагу. montage — если у серии есть url_final. */
export function sceneStage(s: StageScene, topic?: { url_final: string | null } | null): SceneStage {
  if (topic?.url_final) return 'montage'
  if (s.video_file) return 'animation'
  if (!s.visual_prompt?.trim() && !s.manual_prompt?.trim()) return 'draft'
  if (!s.base_image_url) return 'prompt'
  // «Озвучка» — только у шотов с текстом и аудио; немой шот после кадра остаётся «Фото» до видео
  return s.dialogue_text?.trim() && s.audio_file ? 'voice' : 'photo'
}
