// ═══════════════════════════════════════════════════════════════════════════
// fill_workflow.js — n8n Code-узел (Mode: Run Once for All Items)
//
// Заполняет процесс ComfyUI (API-формат) данными шота по МЕТКАМ — заголовкам узлов (Title в ComfyUI):
//   #prompt  ← prompt из scene_refs.js (теги уже заменены на «the person from image N») + добавка стиля
//   #ref1..3 ← ref_images из scene_refs.js; лишние #ref удаляются вместе со входом images.imageN
//   #save    ← путь anima/<seasons.folder>/<topics.folder>/<scena 2 знака>-<shot_num> (считается здесь, из БД)
//   #seed    ← случайный seed (у каждой генерации свой)
//   #size    ← SIZE (если метка есть в процессе)
// Договор меток — страница «Процессы» админки (src/lib/workflows.ts).
//
// Вход:
//   узел REFS_NODE            — вывод scene_refs.js для ЭТОГО шота (prompt, ref_images, ref_count, scene_id)
//   узел WORKFLOW_NODE        — процесс: HTTP Request GET http://<админка>/compute/workflows/<файл>
//                               или Read Files from Disk + Extract from File (JSON) из папки workflows/ проекта;
//                               файл: {{ $json.ref_count ? 'frame-refs.json' : 'frame-0ref.json' }}
//   узлы SCENE_NODE / TOPIC_NODE / SEASON_NODE — строки scenes, topics, seasons из Supabase
// Админка шлёт только scene_id и topic_id: путь, стиль и промпт собирает бэкенд (n8n).
// Выход: { comfy_body: { prompt: <процесс> }, scene_id, output_prefix, save_node }
//   comfy_body — тело для POST http://<ComfyUI>/prompt; save_node — id узла #save (нужен comfy_result.js)
// ═══════════════════════════════════════════════════════════════════════════

// ── Настройки ──────────────────────────────────────────────────────────────
const REFS_NODE = 'Scene_refs'     // имя Code-узла со scene_refs.js
const WORKFLOW_NODE = 'Workflow'   // имя узла, который скачал процесс
const SCENE_NODE = 'Scene'         // Supabase: строка scenes
const TOPIC_NODE = 'Topic'         // Supabase: строка topics (серия)
const SEASON_NODE = 'Season'       // Supabase: строка seasons
const SIZE = { width: 768, height: 1344 } // вертикаль 9:16; null — не трогать #size
// Стили сезона (seasons.style → добавка к промпту). Рабочие значения живут здесь, в бэкенде;
// в админке (lib/styles.ts) — только названия и превью для выбора.
const STYLES = {
  smooth3d: { trigger: '', promptSuffix: '3D animated feature film style, smooth stylized shading, soft global illumination, expressive faces' },
  watercolor: { trigger: '', promptSuffix: 'hand-painted 2D anime film style, soft watercolor backgrounds, warm natural light, gentle colors' },
  scifi: { trigger: '', promptSuffix: 'cinematic sci-fi fantasy CGI style, highly detailed costumes and armor, dramatic volumetric lighting' },
  steampunk: { trigger: '', promptSuffix: 'painterly 3D style with hand-painted textures, steampunk details, brass and copper, moody rim lighting' },
}
// ───────────────────────────────────────────────────────────────────────────

const PROMPT_FIELDS = ['text', 'prompt', 'value', 'string']
const labelOf = (node) => String(node?._meta?.title ?? '').trim().split(/\s/)[0].toLowerCase()

try {
  // Данные шота — из узла scene_refs.js (на вход этому узлу обычно приходит процесс, а не шот)
  const fromInput = $input.first().json
  const refs = fromInput && 'ref_count' in fromInput ? fromInput : $(REFS_NODE).first().json
  if (!refs || !('ref_count' in refs)) throw new Error(`Нет вывода scene_refs.js — проверьте имя узла (REFS_NODE = '${REFS_NODE}')`)
  if (refs.error) throw new Error(`scene_refs.js: ${refs.error}`)
  if (!String(refs.prompt ?? '').trim()) throw new Error('У шота пустой промпт (manual_prompt и visual_prompt) — сначала Постановщик')
  const scene = $(SCENE_NODE).first().json
  const topic = $(TOPIC_NODE).first().json
  const season = $(SEASON_NODE).first().json ?? {}
  if (!season.id) throw new Error(`В узле «${SEASON_NODE}» нет сезона — фильтр seasons.id = {{ $('${TOPIC_NODE}').first().json.season_id }}`)
  // Путь кадра — та же схема, что в админке (lib/media.ts): anima/<сезон>/<серия>/<NN>-<шот>
  const outputPrefix = `anima/${season.folder || topic.season_id || 'no-season'}/${topic.folder || topic.topic_id}/${String(scene.scena ?? 0).padStart(2, '0')}-${scene.shot_num ?? 1}`
  // Процесс: HTTP-узел отдаёт его как item.json; «Extract from File» (JSON) — в поле data (объектом или строкой)
  const raw = $(WORKFLOW_NODE).first().json
  const src = raw.data !== undefined && !raw['1'] && !Object.values(raw).some((n) => n && n.class_type) ? raw.data : raw
  const wf = JSON.parse(JSON.stringify(typeof src === 'string' ? JSON.parse(src) : src))
  if (!Object.values(wf).some((n) => n && n.class_type)) throw new Error(`В узле «${WORKFLOW_NODE}» не процесс ComfyUI в API-формате`)

  const byLabel = (label) => Object.entries(wf).filter(([, n]) => labelOf(n) === label)
  const one = (label) => {
    const found = byLabel(label)
    if (found.length > 1) throw new Error(`Метка ${label} стоит на нескольких узлах`)
    return found[0] ?? null
  }

  // #prompt: триггер стиля + промпт + добавка стиля
  const style = STYLES[season.style]
  if (season.style && !style) throw new Error(`Стиль сезона «${season.style}» не найден в STYLES этого скрипта`)
  const promptNode = one('#prompt')
  if (!promptNode) throw new Error('В процессе нет узла #prompt')
  const text = [style?.trigger, refs.prompt, style?.promptSuffix].filter((s) => s && String(s).trim()).join(', ')
  const pf = PROMPT_FIELDS.find((f) => f in promptNode[1].inputs)
  promptNode[1].inputs[pf] = text

  // #ref1..#ref3: подставить картинки; лишние удалить вместе с входом, который на них ссылается
  const images = refs.ref_images ?? []
  for (let i = 1; i <= 9; i++) {
    const ref = one(`#ref${i}`)
    if (!ref) continue
    const [id, node] = ref
    if (i <= images.length) {
      node.inputs.image = images[i - 1]
    } else {
      delete wf[id]
      for (const n of Object.values(wf)) for (const [k, v] of Object.entries(n.inputs ?? {})) if (Array.isArray(v) && v[0] === id) delete n.inputs[k]
    }
  }
  if (images.length > byLabel('#ref1').length + byLabel('#ref2').length + byLabel('#ref3').length)
    throw new Error(`Референсов ${images.length}, а узлов #ref в процессе меньше`)

  // #save
  const save = one('#save')
  if (!save) throw new Error('В процессе нет узла #save')
  save[1].inputs.filename_prefix = outputPrefix

  // #seed — случайный
  const seed = one('#seed')
  if (seed) {
    const f = 'noise_seed' in seed[1].inputs ? 'noise_seed' : 'seed'
    seed[1].inputs[f] = Math.floor(Math.random() * 2 ** 48)
  }

  // #size
  const size = one('#size')
  if (size && SIZE) Object.assign(size[1].inputs, SIZE)

  return [{ json: { comfy_body: { prompt: wf }, scene_id: refs.scene_id, output_prefix: outputPrefix, save_node: save[0], prompt_text: text, season_id: season.id, season_folder: season.folder ?? null, style_id: season.style ?? null } }]
} catch (error) {
  return [{ json: { error: error.message } }]
}
