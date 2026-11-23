// ═══════════════════════════════════════════════════════════════════════════
// audio_vars.js — n8n Code-узел «Vars» конвейера озвучки шота (n8n на .99). Mode: Run Once for All Items.
//
// Озвучка шота = текст шота (dialogue_text: рассказчик или реплика) голосом говорящего через tts-proxy
// (n8n на 88.99 ходит в Google Gemini TTS и отдаёт wav). Файл ляжет рядом с кадрами серии.
//
// Голос: scenes.speaking_character_voice (ручная замена на шоте) → characters.voice_name говорящего.
// Подача (style): dialogue_direction шота / speaker_voice_tone + описание голоса персонажа (voice_profile).
// Выход: scene_id, text, voice, style, tts_url, local_comfy_url, output_dir, file_name
// Узлы: SCENE_NODE, TOPIC_NODE, SEASON_NODE, CHARACTERS_NODE (Supabase).
// ═══════════════════════════════════════════════════════════════════════════

const SCENE_NODE = 'Scene'
const TOPIC_NODE = 'Topic'
const SEASON_NODE = 'Season'
const CHARACTERS_NODE = 'Characters'

// ── Настройки ──────────────────────────────────────────────────────────────
const TTS_URL = 'http://88.99.241.163:5678/webhook/3cce057a-d32b-45bf-80fc-616f7aaa3bba' // вебхук tts-proxy (n8n/tts_proxy.workflow.json)
const LOCAL_COMFY_URL = 'http://127.0.0.1:8188' // свой ComfyUI: /upload/image?type=output кладёт wav в output .99
const NARRATOR = 'NARRATOR'
const NARRATOR_STYLE = 'Say in a calm, warm, unhurried storyteller voice'
// ───────────────────────────────────────────────────────────────────────────

const norm = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const profileText = (p) => {
  if (!p) return ''
  if (typeof p === 'string') return clean(p)
  if (typeof p === 'object') return clean(p.description ?? p.style ?? p.text ?? Object.values(p).filter((v) => typeof v === 'string').join(', '))
  return ''
}

try {
  const scene = $(SCENE_NODE).first().json
  if (!scene?.scene_id) throw new Error(`Нет шота в узле «${SCENE_NODE}»`)
  const topic = $(TOPIC_NODE).first().json
  const season = $(SEASON_NODE).first().json ?? {}

  const text = clean(scene.dialogue_text)
  if (!text) throw new Error('У шота нет текста (dialogue_text) — озвучивать нечего')
  const speaker = clean(scene.speaking_character)
  if (!speaker) throw new Error('У шота не указан говорящий (speaking_character)')

  const byName = new Map()
  try {
    for (const { json: c } of $(CHARACTERS_NODE).all()) if (c?.name) byName.set(norm(c.name), c)
  } catch {
    /* узла нет — голос только из шота */
  }
  const character = byName.get(norm(speaker))
  const voice = clean(scene.speaking_character_voice) || clean(character?.voice_name)
  if (!voice)
    throw new Error(`Нет голоса у «${speaker}»: впишите voice_name персонажу (Персонажи → карточка) или speaking_character_voice шоту`)

  const tone = clean(scene.dialogue_direction || scene.speaker_voice_tone)
  const profile = profileText(character?.voice_profile)
  const isNarrator = norm(speaker) === NARRATOR
  const base = isNarrator ? NARRATOR_STYLE + (tone ? `, ${tone}` : '') : tone ? `Say in a ${tone} voice` : 'Say'
  const style = [base, profile].filter(Boolean).join('; ')

  const output_dir = `anima/${season.folder || topic.season_id}/${topic.folder || topic.topic_id}`
  const file_name = `${String(scene.scena ?? 0).padStart(2, '0')}-${scene.shot_num ?? 1}.wav`

  return [{ json: { scene_id: scene.scene_id, text, voice, style, tts_url: TTS_URL, local_comfy_url: LOCAL_COMFY_URL, output_dir, file_name } }]
} catch (error) {
  return [{ json: { error: error.message } }]
}
