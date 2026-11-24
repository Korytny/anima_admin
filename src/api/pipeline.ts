// Запуск генераций в n8n через вебхук.
// n8n сам пишет результат в БД (service_role): base_image_url = путь, status = 'ready' | 'error'.
import type { Scene } from '@/types'
import { supabase } from '@/lib/supabase'

// В .env.local у каждого шага — только id вебхука n8n; режим VITE_N8N_MODE: test → /webhook-test/<id>, prod → /webhook/<id>.
// Запросы идут через dev-прокси /n8n → N8N_URL. Полный URL или путь (/n8n/…) в переменной тоже понимается.
export const n8nMode: 'test' | 'prod' = import.meta.env.VITE_N8N_MODE === 'test' ? 'test' : 'prod'
const hook = (v: string | undefined) => {
  const id = v?.trim()
  if (!id) return undefined
  return /^(https?:\/\/|\/)/.test(id) ? id : `/n8n/${n8nMode === 'test' ? 'webhook-test' : 'webhook'}/${id}`
}

const IMAGE_WEBHOOK = hook(import.meta.env.VITE_N8N_IMAGE_WEBHOOK)

export const pipelineConfigured = !!IMAGE_WEBHOOK

// Кадр шота: админка шлёт только id. Шот, серию, сезон, персонажей, промпт, путь и стиль n8n берёт и считает сам
// (n8n/scene_refs.js, n8n/fill_workflow.js) — логика генерации живёт в бэкенде.
export async function requestSceneImage(scene: Scene) {
  if (!IMAGE_WEBHOOK) throw new Error('Не задан VITE_N8N_IMAGE_WEBHOOK в .env.local')
  const { data } = await supabase.auth.getUser()
  const res = await fetch(IMAGE_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'scene_image', scene_id: scene.scene_id, topic_id: scene.topic, requested_by: data.user?.email ?? null }),
  })
  if (!res.ok) throw new Error(`n8n ответил ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

// Сценарий серии: админка шлёт только topic_id. Всё остальное (сезон, библия, биты, первоисточник, персонажи,
// промпт агента) n8n сам берёт из БД и пишет ответ в topics.script_scenas.
const SCRIPT_WEBHOOK = hook(import.meta.env.VITE_N8N_SCRIPT_WEBHOOK)

export const scriptPipelineConfigured = !!SCRIPT_WEBHOOK

export async function requestEpisodeScript(topicId: string) {
  if (!SCRIPT_WEBHOOK) throw new Error('Не задан VITE_N8N_SCRIPT_WEBHOOK в .env.local')
  const res = await fetch(SCRIPT_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'episode_script', topic_id: topicId }),
  })
  if (!res.ok) throw new Error(`n8n ответил ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

// Шоты серии: админка шлёт только topic_id. n8n берёт сценарий (script_scenas), библию, персонажей и промпт
// Редактора из БД и пишет ответ в topics.script_shots.
const SHOTS_WEBHOOK = hook(import.meta.env.VITE_N8N_SHOTS_WEBHOOK)
export const shotsPipelineConfigured = !!SHOTS_WEBHOOK
export async function requestEpisodeShots(topicId: string) {
  if (!SHOTS_WEBHOOK) throw new Error('Не задан VITE_N8N_SHOTS_WEBHOOK в .env.local')
  const res = await fetch(SHOTS_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'episode_shots', topic_id: topicId }),
  })
  if (!res.ok) throw new Error(`n8n ответил ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

// Озвучка, видео шота и монтаж серии: админка шлёт только id. n8n сам берёт данные из БД
// и пишет результат в scenes.audio_file / audio_duration, scenes.video_file / video_sub, topics.url_final
// (музыка по локации накладывается при монтаже).
const AUDIO_WEBHOOK = hook(import.meta.env.VITE_N8N_AUDIO_WEBHOOK)
const VIDEO_WEBHOOK = hook(import.meta.env.VITE_N8N_VIDEO_WEBHOOK)
const MONTAGE_WEBHOOK = hook(import.meta.env.VITE_N8N_MONTAGE_WEBHOOK)

export const audioConfigured = !!AUDIO_WEBHOOK
export const videoConfigured = !!VIDEO_WEBHOOK
export const montageConfigured = !!MONTAGE_WEBHOOK

async function post(url: string | undefined, envName: string, body: Record<string, unknown>) {
  if (!url) throw new Error(`Не задан ${envName} в .env.local`)
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`n8n ответил ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

export const requestSceneAudio = (sceneId: string) => post(AUDIO_WEBHOOK, 'VITE_N8N_AUDIO_WEBHOOK', { action: 'scene_audio', scene_id: sceneId })
export const requestSceneVideo = (sceneId: string) => post(VIDEO_WEBHOOK, 'VITE_N8N_VIDEO_WEBHOOK', { action: 'scene_video', scene_id: sceneId })
export const requestMontage = (topicId: string) => post(MONTAGE_WEBHOOK, 'VITE_N8N_MONTAGE_WEBHOOK', { action: 'episode_montage', topic_id: topicId })

// Музыка локации (Suno через n8n): шлём серию, номер локации и её шоты; n8n пишет scenes.music_file во все эти шоты.
const MUSIC_WEBHOOK = hook(import.meta.env.VITE_N8N_MUSIC_WEBHOOK)
export const musicConfigured = !!MUSIC_WEBHOOK
export const requestLocationMusic = (topicId: string, locationNum: number | null, sceneIds: string[]) =>
  post(MUSIC_WEBHOOK, 'VITE_N8N_MUSIC_WEBHOOK', { action: 'location_music', topic_id: topicId, location_num: locationNum, scene_ids: sceneIds })

/** Все вебхуки конвейера — для страницы настроек и подсказок. Значения id не показываем. */
export const WEBHOOKS = [
  { step: 'Кадр шота', env: 'VITE_N8N_IMAGE_WEBHOOK', on: !!IMAGE_WEBHOOK, body: "{action:'scene_image', scene_id, topic_id}", writes: 'scenes.base_image_url, char_img_url, status' },
  { step: 'Сценарий серии', env: 'VITE_N8N_SCRIPT_WEBHOOK', on: !!SCRIPT_WEBHOOK, body: "{action:'episode_script', topic_id}", writes: 'topics.script_scenas' },
  { step: 'Шоты серии', env: 'VITE_N8N_SHOTS_WEBHOOK', on: !!SHOTS_WEBHOOK, body: "{action:'episode_shots', topic_id}", writes: 'topics.script_shots' },
  { step: 'Озвучка шота', env: 'VITE_N8N_AUDIO_WEBHOOK', on: !!AUDIO_WEBHOOK, body: "{action:'scene_audio', scene_id}", writes: 'scenes.audio_file, audio_duration' },
  { step: 'Видео шота', env: 'VITE_N8N_VIDEO_WEBHOOK', on: !!VIDEO_WEBHOOK, body: "{action:'scene_video', scene_id}", writes: 'scenes.video_file, video_sub' },
  { step: 'Музыка локации', env: 'VITE_N8N_MUSIC_WEBHOOK', on: !!MUSIC_WEBHOOK, body: "{action:'location_music', topic_id, location_num, scene_ids}", writes: 'scenes.music_file' },
  { step: 'Монтаж серии', env: 'VITE_N8N_MONTAGE_WEBHOOK', on: !!MONTAGE_WEBHOOK, body: "{action:'episode_montage', topic_id}", writes: 'topics.url_final' },
]
