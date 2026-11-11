// Запуск генераций в n8n через вебхук.
// n8n сам пишет результат в БД (service_role): base_image_url = путь, status = 'ready' | 'error'.
import type { Character, Scene, Season, Topic } from '@/types'
import { outputPrefix } from '@/lib/media'
import { supabase } from '@/lib/supabase'

const IMAGE_WEBHOOK = import.meta.env.VITE_N8N_IMAGE_WEBHOOK as string | undefined

export const pipelineConfigured = !!IMAGE_WEBHOOK

export async function requestSceneImage(scene: Scene, topic: Topic | undefined, season: Season | undefined, characters: Character[]) {
  if (!IMAGE_WEBHOOK) throw new Error('Не задан VITE_N8N_IMAGE_WEBHOOK в .env.local')
  const { data } = await supabase.auth.getUser()
  const res = await fetch(IMAGE_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'scene_image',
      scene_id: scene.scene_id,
      topic_id: scene.topic,
      folder: topic?.folder ?? null,
      output_prefix: outputPrefix(scene, topic, season), // anima/<сезон>/<серия>/<код>
      prompt: scene.manual_prompt || scene.visual_prompt, // ручной приоритетнее
      visual_style: topic?.visual_style ?? null,
      requested_by: data.user?.email ?? null,
      scene,
      characters, // записи characters этой сцены (картинки: base_img / pers_file / filename)
    }),
  })
  if (!res.ok) throw new Error(`n8n ответил ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

// Сценарий серии: админка шлёт только topic_id. Всё остальное (сезон, библия, биты, первоисточник, персонажи,
// промпт агента) n8n сам берёт из БД и пишет ответ в topics.script_scenas.
const SCRIPT_WEBHOOK = import.meta.env.VITE_N8N_SCRIPT_WEBHOOK as string | undefined

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

// Озвучка, видео шота и монтаж серии: админка шлёт только id. n8n сам берёт данные из БД
// и пишет результат в scenes.audio_file / audio_duration, scenes.video_file / video_sub, topics.url_final
// (музыка по локации накладывается при монтаже).
const AUDIO_WEBHOOK = import.meta.env.VITE_N8N_AUDIO_WEBHOOK as string | undefined
const VIDEO_WEBHOOK = import.meta.env.VITE_N8N_VIDEO_WEBHOOK as string | undefined
const MONTAGE_WEBHOOK = import.meta.env.VITE_N8N_MONTAGE_WEBHOOK as string | undefined

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
const MUSIC_WEBHOOK = import.meta.env.VITE_N8N_MUSIC_WEBHOOK as string | undefined
export const musicConfigured = !!MUSIC_WEBHOOK
export const requestLocationMusic = (topicId: string, locationNum: number | null, sceneIds: string[]) =>
  post(MUSIC_WEBHOOK, 'VITE_N8N_MUSIC_WEBHOOK', { action: 'location_music', topic_id: topicId, location_num: locationNum, scene_ids: sceneIds })
