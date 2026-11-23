// ═══════════════════════════════════════════════════════════════════════════
// video_vars.js — n8n Code-узел «Vars» конвейера видео шота (Mode: Run Once for All Items)
//
// Видео шота = кадр раскадровки (первый кадр) + ACT Постановщика; MiniMax H3 i2v, видео со звуком.
// Промпт видео пишет ТОЛЬКО Постановщик: scenes.action_prompt (движение, камера, в #talk — реплика, последним «Sound: …»).
// Скрипт его не дописывает. Постоянная обёртка («Keep the exact art style… {{prompt}}») — в настройках процесса (админка).
//
// Голос #talk-шота — на выбор, по шоту:
//   • у шота есть audio_file (озвучка Google, голос из карточки персонажа) → процесс video-i2v-voice.json:
//     дорожка подаётся в H3 (PixaromaH3AudioSync), видео подстраивает губы; длина — по озвучке;
//   • озвучки нет → процесс video-i2v.json: реплику голосом и губы H3 делает сам.
// Рассказчик (Narrator) в видео не звучит — его голос накладывается при монтаже.
//
// Выход (для fill_workflow.js и узлов ниже):
//   prompt          — action_prompt шота (→ #prompt через шаблон настроек процесса)
//   '#image.image'  — кадр в input видео-сервера (тот же относительный путь, что base_image_url)
//   '#size.length'  — длина в кадрах 24 fps (H3: 5 + 17k; 124 ≈ 5.2 с … 362 ≈ 15 с)
//   output_prefix   — anima/<сезон>/<серия>/<NN>-<шот> (#save на видео-сервере); output_dir — папка серии на .99
//   frame_dir, frame_file — кадр: взять из своего ComfyUI (/view, output) и загрузить на видео-сервер (input, тот же путь)
//   has_track, audio_dir, audio_name, '#audio.audio' — дорожка голоса (только у #talk с audio_file), так же, как кадр
//   comfy_url — ComfyUI видео-сервера; local_comfy_url — свой ComfyUI (.99): из него берём файлы, в него кладём mp4
//   scene_id, seconds, started_at, workflow_file
// Узлы: SCENE_NODE, TOPIC_NODE, SEASON_NODE (Supabase).
// ═══════════════════════════════════════════════════════════════════════════

const SCENE_NODE = 'Scene'
const TOPIC_NODE = 'Topic'
const SEASON_NODE = 'Season'

// ── Настройки ──────────────────────────────────────────────────────────────
const COMFY_URL = 'http://127.0.0.1:8189' // Таиланд, RTX 3080 20 GB (туннель thai-tunnel в pm2 на .99)
const LOCAL_COMFY_URL = 'http://127.0.0.1:8188' // свой ComfyUI: /view отдаёт кадр и wav, /upload/image?type=output кладёт mp4
const NARRATOR = 'NARRATOR' // тег рассказчика (после norm): его текст в видео не звучит
const FPS = 24
const MIN_FRAMES = 124 // ≈ 5.2 с — нижняя граница обученного диапазона H3
const MAX_FRAMES = 362 // ≈ 15 с
const WORDS_PER_SEC = 2.4 // темп реплики, если озвучки ещё нет
// ───────────────────────────────────────────────────────────────────────────

const norm = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const relPath = (s) => clean(s).replace(/\\/g, '/').replace(/^\/+/, '')
const words = (s) => clean(s).split(' ').filter(Boolean).length
const toFrames = (sec) => {
  const raw = Math.max(5, Math.round(sec * FPS))
  const valid = raw + ((17 - ((raw - 5) % 17)) % 17) // вверх до 5 + 17k
  return Math.min(MAX_FRAMES, Math.max(MIN_FRAMES, valid))
}

try {
  const scene = $(SCENE_NODE).first().json
  if (!scene?.scene_id) throw new Error(`Нет шота в узле «${SCENE_NODE}»`)
  const topic = $(TOPIC_NODE).first().json
  const season = $(SEASON_NODE).first().json ?? {}

  const frame = relPath(scene.base_image_url)
  if (!frame) throw new Error('У шота нет кадра (base_image_url) — сначала сгенерируйте фото')
  if (/^https?:/i.test(frame)) throw new Error('base_image_url — полный URL; нужен путь относительно ComfyUI/output')
  const prompt = clean(scene.action_prompt)
  if (!prompt) throw new Error('У шота нет промпта видео (action_prompt) — сначала Постановщик')

  // Реплика персонажа в #talk: с озвучкой — видео под дорожку
  const line = clean(scene.dialogue_text)
  const talks = scene.shot_type === 'talk' && !!line && norm(scene.speaking_character) !== NARRATOR
  const track = talks ? relPath(scene.audio_file) : ''
  const has_track = !!track
  // Текст рассказчика (не реплика #talk) без озвучки: длина видео = длина озвучки, её ещё нет
  if (line && !talks && !scene.audio_duration) throw new Error('Сначала озвучьте текст шота: по длине озвучки считается длина видео')

  // Длина: есть озвучка — по ней; реплика #talk без озвучки — чтобы поместилась; немой шот — «Сек»
  let seconds = Number(scene.audio_duration) || Number(scene.time) || 4
  if (talks && !scene.audio_duration) seconds = Math.max(seconds, words(line) / WORDS_PER_SEC + 1.2)
  const length = toFrames(seconds)

  const dir = `anima/${season.folder || topic.season_id}/${topic.folder || topic.topic_id}`
  return [
    {
      json: {
        scene_id: scene.scene_id,
        prompt,
        output_prefix: `${dir}/${String(scene.scena ?? 0).padStart(2, '0')}-${scene.shot_num ?? 1}`,
        output_dir: dir,
        started_at: Date.now(), // video_result.js сдаётся через TIMEOUT_MIN
        seconds: Math.round((length / FPS) * 10) / 10,
        frame_dir: frame.split('/').slice(0, -1).join('/'),
        frame_file: frame.split('/').pop(),
        '#image.image': frame,
        '#size.length': length,
        has_track,
        audio_dir: track.split('/').slice(0, -1).join('/'),
        audio_name: track.split('/').pop(),
        ...(has_track ? { '#audio.audio': track } : {}),
        comfy_url: COMFY_URL,
        local_comfy_url: LOCAL_COMFY_URL,
        workflow_file: has_track ? 'video-i2v-voice.json' : 'video-i2v.json',
      },
    },
  ]
} catch (error) {
  return [{ json: { error: error.message } }]
}
