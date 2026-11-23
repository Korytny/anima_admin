// ═══════════════════════════════════════════════════════════════════════════
// video_vars.js — n8n Code-узел «Vars» конвейера видео шота (Mode: Run Once for All Items)
//
// Видео шота = кадр раскадровки (первый кадр) + движение + звук; MiniMax H3 i2v.
// Голос #talk-шота — на выбор, по шоту:
//   • у шота есть audio_file (озвучка Google, голос из карточки персонажа) → процесс video-i2v-voice.json:
//     дорожка подаётся в H3 (PixaromaH3AudioSync), видео подстраивает губы; длина — по озвучке;
//   • озвучки нет → процесс video-i2v.json: реплику голосом и губы H3 делает сам, шумы тоже.
// Рассказчик (Narrator) в видео не звучит — его голос накладывается при монтаже.
//
// Выход (для fill_workflow.js и узлов ниже):
//   prompt          — промпт видео (→ #prompt)
//   '#image.image'  — кадр в папке input ComfyUI видео-сервера (тот же относительный путь, что base_image_url)
//   '#size.length'  — длина в кадрах 24 fps (H3: 5 + 17k; 124 ≈ 5.2 с … 362 ≈ 15 с)
//   output_prefix   — anima/<сезон>/<серия>/<NN>-<шот> (#save на видео-сервере)
//   frame_dir, frame_file — кадр: взять из своего ComfyUI (/view, output) и загрузить на видео-сервер (input, тот же путь)
//   has_track, audio_dir, audio_name, '#audio.audio' — дорожка голоса (только у #talk с audio_file), так же, как кадр
//   comfy_url       — ComfyUI видео-сервера; local_comfy_url — свой ComfyUI (.99): из него берём файлы, в него кладём mp4
//   scene_id, seconds, workflow_file
// Узлы: SCENE_NODE, TOPIC_NODE, SEASON_NODE, CHARACTERS_NODE (Supabase).
// ═══════════════════════════════════════════════════════════════════════════

const SCENE_NODE = 'Scene'
const TOPIC_NODE = 'Topic'
const SEASON_NODE = 'Season'
const CHARACTERS_NODE = 'Characters'

// ── Настройки ──────────────────────────────────────────────────────────────
const COMFY_URL = 'http://127.0.0.1:8189'       // Таиланд, RTX 3080 20 GB (туннель thai-tunnel в pm2 на .99)
const LOCAL_COMFY_URL = 'http://127.0.0.1:8188' // свой ComfyUI: /upload/image?type=output пишет mp4 в output .99
const NARRATOR = 'NARRATOR'                     // тег рассказчика (после norm): его текст не озвучивается в видео
const FPS = 24
const MIN_FRAMES = 124                          // ≈ 5.2 с — нижняя граница обученного диапазона H3
const MAX_FRAMES = 362                          // ≈ 15 с
const WORDS_PER_SEC = 2.4                       // темп реплики
const STYLE_LINE = 'Keep the exact art style, colors, characters and composition of the first frame.'
// ───────────────────────────────────────────────────────────────────────────

const norm = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const words = (s) => clean(s).split(' ').filter(Boolean).length
const toFrames = (sec) => {
  const raw = Math.max(5, Math.round(sec * FPS))
  const valid = raw + ((17 - ((raw - 5) % 17)) % 17) // вверх до 5 + 17k
  return Math.min(MAX_FRAMES, Math.max(MIN_FRAMES, valid))
}
const isCyrillic = (s) => /[А-Яа-яЁё]/.test(s)

try {
  const scene = $(SCENE_NODE).first().json
  if (!scene?.scene_id) throw new Error(`Нет шота в узле «${SCENE_NODE}»`)
  const topic = $(TOPIC_NODE).first().json
  const season = $(SEASON_NODE).first().json ?? {}

  const frame = clean(scene.base_image_url).replace(/\\/g, '/').replace(/^\/+/, '')
  if (!frame) throw new Error('У шота нет кадра (base_image_url) — сначала сгенерируйте фото')
  if (/^https?:/i.test(frame)) throw new Error('base_image_url — полный URL; нужен путь относительно ComfyUI/output')
  const motion = clean(scene.action_prompt || scene.action)
  if (!motion) throw new Error('У шота нет описания движения (action_prompt) — сначала Постановщик')

  // Персонажи сезона: кто говорит (для описания голоса)
  const byName = new Map()
  try {
    for (const { json: c } of $(CHARACTERS_NODE).all()) if (c?.name) byName.set(norm(c.name), c)
  } catch {
    /* без узла персонажей — голос описываем только по реплике */
  }

  const speakerTag = clean(scene.speaking_character)
  const line = clean(scene.dialogue_text)
  const isNarrator = norm(speakerTag) === NARRATOR
  const talks = !!line && !!speakerTag && !isNarrator && scene.shot_type === 'talk'
  const track = talks ? clean(scene.audio_file).replace(/\\/g, '/').replace(/^\/+/, '') : ''
  const has_track = !!track

  // ── Звук ──
  let sound
  if (has_track) {
    // Звук задан дорожкой — описываем только губы
    sound = `${speakerTag} speaks, lips moving precisely in sync with the voice track.`
  } else if (talks) {
    const c = byName.get(norm(speakerTag))
    const who = clean(String(c?.text_prompt ?? '').split(',').slice(0, 2).join(','))
    const tone = clean(scene.dialogue_direction || scene.speaker_voice_tone)
    const lang = isCyrillic(line) ? 'Russian' : 'English'
    sound =
      `${speakerTag}${who ? ` (${who})` : ''} speaks${tone ? ` in a ${tone} voice` : ''}, in ${lang}, lips moving in sync: "${line}" ` +
      `Sound: only the speaker's voice and quiet ambience${scene.noice ? ` (${clean(scene.noice)})` : ''}, no music.`
  } else {
    sound = `Nobody speaks, mouths stay closed. Sound: natural ambience${scene.noice ? ` — ${clean(scene.noice)}` : ''}, no speech, no music.`
  }

  // ── Длина: по дорожке голоса; иначе реплика или текст рассказчика должны поместиться ──
  let seconds = Number(scene.audio_duration) || Number(scene.time) || 4
  if (line && !has_track) seconds = Math.max(seconds, words(line) / WORDS_PER_SEC + (talks ? 1.2 : 0.6))
  const length = toFrames(seconds)

  const prompt = [STYLE_LINE, motion, sound].join(' ')

  const dir = `anima/${season.folder || topic.season_id}/${topic.folder || topic.topic_id}`
  const output_prefix = `${dir}/${String(scene.scena ?? 0).padStart(2, '0')}-${scene.shot_num ?? 1}`
  const frame_file = frame.split('/').pop()
  const frame_dir = frame.split('/').slice(0, -1).join('/')

  return [
    {
      json: {
        scene_id: scene.scene_id,
        prompt,
        output_prefix,
        output_dir: dir, // куда положить mp4 на .99 (output/<dir>)
        started_at: Date.now(), // video_result.js сдаётся через TIMEOUT_MIN
        seconds: Math.round((length / FPS) * 10) / 10,
        frame_dir,
        frame_file,
        '#image.image': frame, // на видео-сервере кадр загружается в input/<frame_dir>/<frame_file>
        '#size.length': length,
        has_track,
        audio_dir: track.split('/').slice(0, -1).join('/'),
        audio_name: track.split('/').pop(),
        ...(has_track ? { '#audio.audio': track } : {}), // так же: input/<audio_dir>/<audio_name> на видео-сервере
        comfy_url: COMFY_URL,
        local_comfy_url: LOCAL_COMFY_URL,
        workflow_file: has_track ? 'video-i2v-voice.json' : 'video-i2v.json',
      },
    },
  ]
} catch (error) {
  return [{ json: { error: error.message } }]
}
