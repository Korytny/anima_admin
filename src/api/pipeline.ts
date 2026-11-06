// Запуск генераций в n8n через вебхук.
// n8n сам пишет результат в БД (service_role): base_image_url = путь, status = 'ready' | 'error'.
import type { Character, Scene, Topic } from '@/types'
import { outputPrefix } from '@/lib/media'
import { supabase } from '@/lib/supabase'

const IMAGE_WEBHOOK = import.meta.env.VITE_N8N_IMAGE_WEBHOOK as string | undefined

export const pipelineConfigured = !!IMAGE_WEBHOOK

export async function requestSceneImage(scene: Scene, topic: Topic | undefined, characters: Character[]) {
  if (!IMAGE_WEBHOOK) throw new Error('Не задан VITE_N8N_IMAGE_WEBHOOK в .env.local')
  const { data } = await supabase.auth.getUser()
  const res = await fetch(IMAGE_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'scene_image',
      scene_id: scene.scene_id,
      topic_id: scene.topic,
      output_prefix: outputPrefix(scene),
      prompt: scene.manual_prompt || scene.visual_prompt, // ручной приоритетнее
      visual_style: topic?.visual_style ?? null,
      requested_by: data.user?.email ?? null,
      scene,
      characters, // записи characters этой сцены (картинки: base_img / pers_file / filename)
    }),
  })
  if (!res.ok) throw new Error(`n8n ответил ${res.status}: ${(await res.text()).slice(0, 200)}`)
}
