// Процессы ComfyUI (API-формат) лежат в проекте: workflows/<имя>.json. n8n берёт их с сервера админки
// (GET /compute/workflows/<имя>.json) и подставляет данные по меткам — заголовкам узлов (Title в ComfyUI), а не по id.
// Пересохранил процесс с теми же метками — n8n менять не нужно.

export interface LabelSpec {
  label: string
  /** Поля узла, хотя бы одно из которых должно быть — туда n8n пишет значение. */
  fields: string[]
  what: string
}

export const LABELS: Record<string, LabelSpec> = {
  '#prompt': { label: '#prompt', fields: ['text', 'prompt', 'value', 'string'], what: 'промпт кадра + добавка стиля' },
  '#negative': { label: '#negative', fields: ['text', 'prompt', 'value', 'string'], what: 'негативный промпт' },
  '#ref1': { label: '#ref1', fields: ['image'], what: 'картинка 1-го персонажа сцены' },
  '#ref2': { label: '#ref2', fields: ['image'], what: 'картинка 2-го персонажа' },
  '#ref3': { label: '#ref3', fields: ['image'], what: 'картинка 3-го персонажа' },
  '#lora': { label: '#lora', fields: ['lora_name'], what: 'LoRA и сила из стиля сезона' },
  '#seed': { label: '#seed', fields: ['seed', 'noise_seed'], what: 'seed' },
  '#size': { label: '#size', fields: ['width', 'height'], what: 'размер кадра' },
  '#save': { label: '#save', fields: ['filename_prefix'], what: 'путь результата anima/<сезон>/<серия>/<код>' },
}

/** Какие процессы нужны конвейеру: файл workflows/<file> и обязательные/желательные метки. */
export interface Slot {
  file: string
  title: string
  description: string
  required: string[]
  optional: string[]
}

export const SLOTS: Slot[] = [
  {
    file: 'frame-refs.json',
    title: 'Кадр с персонажами',
    description: 'Референсы персонажей сцены (1–3) → кадр. Шаблон на 3; лишние #ref n8n удаляет вместе со входом images.imageN',
    required: ['#prompt', '#ref1', '#save'],
    optional: ['#ref2', '#ref3', '#lora', '#seed', '#size', '#negative'],
  },
  { file: 'frame-0ref.json', title: 'Кадр без персонажей', description: 'Текст → картинка: пейзаж, предмет, общий план', required: ['#prompt', '#save'], optional: ['#lora', '#seed', '#size', '#negative'] },
  { file: 'character.json', title: 'Портрет персонажа', description: 'Референс персонажа для библиотеки сезона', required: ['#prompt', '#save'], optional: ['#lora', '#seed', '#size', '#negative'] },
]

export interface FoundLabel {
  label: string
  nodeId: string
  classType: string
  field: string | null // поле, куда пойдёт значение; null — у узла нет подходящего поля
  value: unknown
}

export interface WorkflowReport {
  ok: boolean
  /** Не API-формат / не JSON — дальше не разбираем. */
  fatal?: string
  nodes: number
  found: FoundLabel[]
  missing: string[] // обязательные метки, которых нет
  missingOptional: string[]
  duplicates: string[] // метка стоит на нескольких узлах
  badField: string[] // метка на узле без нужного поля
  wiring: string[] // референсы подключены не так, как ждёт n8n
  unknownLabels: string[] // заголовки с #, которых нет в договоре
  models: string[] // файлы моделей, которые процесс ждёт на сервере
}

type ApiNode = { class_type?: string; inputs?: Record<string, unknown>; _meta?: { title?: string } }

const MODEL_FILE = /\.(safetensors|ckpt|pt|pth|gguf|bin|onnx)$/i

/** Разбор процесса ComfyUI в API-формате по договору меток. slot — для проверки обязательных меток. */
export function analyzeWorkflow(json: unknown, slot?: Slot): WorkflowReport {
  const empty: WorkflowReport = { ok: false, nodes: 0, found: [], missing: [], missingOptional: [], duplicates: [], badField: [], wiring: [], unknownLabels: [], models: [] }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { ...empty, fatal: 'Не JSON-объект' }
  if ('nodes' in json && Array.isArray((json as { nodes: unknown }).nodes)) return { ...empty, fatal: 'Это процесс в обычном формате. В ComfyUI сохраните через Workflow → Export (API)' }
  const entries = Object.entries(json as Record<string, ApiNode>).filter(([, n]) => n && typeof n === 'object' && 'class_type' in n)
  if (!entries.length) return { ...empty, fatal: 'Нет узлов с class_type — не похоже на API-формат ComfyUI' }

  const found: FoundLabel[] = []
  const unknown = new Set<string>()
  const models = new Set<string>()
  for (const [id, n] of entries) {
    for (const v of Object.values(n.inputs ?? {})) if (typeof v === 'string' && MODEL_FILE.test(v)) models.add(v)
    const title = n._meta?.title?.trim() ?? ''
    if (!title.startsWith('#')) continue
    const label = title.split(/\s/)[0].toLowerCase()
    const spec = LABELS[label]
    if (!spec) {
      unknown.add(title)
      continue
    }
    const field = spec.fields.find((f) => f in (n.inputs ?? {})) ?? null
    found.push({ label, nodeId: id, classType: n.class_type ?? '?', field, value: field ? n.inputs?.[field] : undefined })
  }
  const labels = found.map((f) => f.label)
  const required = slot?.required ?? []
  const missing = required.filter((l) => !labels.includes(l))
  const missingOptional = (slot?.optional ?? []).filter((l) => !labels.includes(l))
  const duplicates = [...new Set(labels.filter((l, i) => labels.indexOf(l) !== i))]
  const badField = found.filter((f) => !f.field).map((f) => f.label)
  // #refN должны идти в один узел подряд: images.image0 ← #ref1, image1 ← #ref2… — n8n удаляет лишние с конца
  const wiring: string[] = []
  const refs = found.filter((f) => /^#ref\d$/.test(f.label)).sort((a, b) => a.label.localeCompare(b.label))
  if (refs.length) {
    const uses = (id: string) =>
      entries.flatMap(([nid, n]) => Object.entries(n.inputs ?? {}).filter(([, v]) => Array.isArray(v) && v[0] === id).map(([key]) => ({ nid, key })))
    const targets = new Set<string>()
    refs.forEach((r, i) => {
      const u = uses(r.nodeId).filter((x) => x.key.startsWith('images.'))
      if (!u.length) return wiring.push(`${r.label} не подключён ко входу images.imageN`)
      targets.add(u[0].nid)
      if (u[0].key !== `images.image${i}`) wiring.push(`${r.label} подключён к ${u[0].key}, ожидается images.image${i}`)
    })
    if (targets.size > 1) wiring.push('референсы подключены к разным узлам — ожидается один узел с images.imageN')
  }
  return {
    ok: !missing.length && !duplicates.length && !badField.length && !wiring.length,
    nodes: entries.length,
    found: found.sort((a, b) => a.label.localeCompare(b.label)),
    missing,
    missingOptional,
    duplicates,
    badField,
    wiring,
    unknownLabels: [...unknown],
    models: [...models].sort(),
  }
}

export interface WorkflowFile {
  name: string
  size: number
  mtime: number
  json: unknown | null
  error?: string // не удалось прочитать/разобрать JSON
}
