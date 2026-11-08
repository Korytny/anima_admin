// Типы повторяют реальные таблицы Supabase (public.topics, public.scenes).
// При изменении схемы — обновить здесь и группы полей в карточках.

export type Json = string | number | boolean | null | { [k: string]: Json } | Json[]

/** public.topics — ролик контент-плана */
export interface Topic {
  topic_id: string // uuid, PK
  title: string // NOT NULL
  extended_description: string | null
  status: string | null // фактически: draft | pending | published (+ мусорные значения)
  url: string | null
  visual_style: string | null
  all: Json | null
  backlog: number | null
  updated_at: string | null
  duration: number | null // numeric, секунды
  url_final: string | null
  size: number | null // bigint, байты
  file_tiktok: string | null
  file_tiktok_size: number | null
  all_eng: Json | null
  music: string | null
  chars: string[] | null
  script_scenas: string | null
  folder: string | null // папка на диске (anima/<folder>/…), назначает админка один раз (store: assignFolders)
}

/** public.scenes — сцена (шот) ролика */
export interface Scene {
  scene_id: string // uuid, PK
  topic: string | null // uuid → topics.topic_id
  scena: number | null // номер сцены
  shot_num: number | null // номер шота внутри сцены
  order: string | null
  status: string | null
  created_at: string | null
  updated_at: string | null
  speaking_character: string | null
  character: string[] | null
  speaking_character_voice: string | null
  speaker_voice_profile: Json | null
  face: string | null
  crop: string | null
  action: string | null
  action_prompt: string | null
  event_prompt: string | null
  event_img: string | null
  dialogue_text: string | null
  dialogue_direction: string | null
  visual_prompt: string | null // авто-промпт (не перезаписываем вручную)
  manual_prompt: string | null // промпт, давший правильную картинку (правка человека)
  shot_type: string | null
  base_image_url: string | null
  inpaint_filename: string | null
  char_img_url: string[] | null
  environment: string | null
  location_desc: string | null
  location_details: string | null
  location_num: number | null
  time: number | null
  daytime: string | null
  audio_file: string | null
  audio_duration: number | null
  noice: string | null
  music: string | null
  music_file: string | null
  video_file: string | null
  video_sub: string | null
}

/** public.characters — персонаж ролика. Связь со сценой — по имени (scenes.character[] / speaking_character). */
export interface Character {
  id: string // uuid, PK
  created_at: string | null
  topic: string | null // uuid → topics.topic_id
  name: string | null
  role_key: string | null
  number: number | null
  status: string | null
  story: string | null
  template: string | null
  character_set_id: string | null
  text_prompt: string | null
  full_body_prompt: string | null
  base_img: string | null
  pers_file: string | null
  filename: string | null
  voice_name: string | null
  voice_profile: Json | null
  speed: number | null
  style: number | null
  similarityBoost: number | null
  stability: number | null
}

// ---- Ниже — сущности без таблиц в БД (пока демо, in-memory)

export type LlmProvider = 'openai' | 'anthropic' | 'google' | 'openrouter'

export interface Agent {
  id: string
  name: string
  role: string
  description: string
  provider: LlmProvider
  model: string
  temperature: number
  max_tokens: number
  system_prompt: string
  related_fields: string[]
  enabled: boolean
  updated_at: string
}

export type UserRole = 'admin' | 'editor' | 'viewer'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  last_seen_at: string | null
}

export type IntegrationId = 'runpod' | LlmProvider | 's3'

export interface Integration {
  id: IntegrationId
  title: string
  kind: 'compute' | 'llm' | 'storage'
  key_hint: string | null
  config: Record<string, string>
  status: 'connected' | 'error' | 'not_configured'
  checked_at: string | null
}

export interface SystemSettings {
  timezone: string
  date_format: string
  media_base_url: string
}
