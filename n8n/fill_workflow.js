// ═══════════════════════════════════════════════════════════════════════════
// fill_workflow.js — n8n Code-узел (Mode: Run Once for All Items). ОДИН на все процессы ComfyUI.
//
// Собирает процесс для POST <ComfyUI>/prompt из трёх частей:
//   1. Шаблон — workflows/<файл> (узел WORKFLOW_NODE: HTTP GET http://<админка>/compute/workflows/<файл>).
//   2. Настройки процесса — строка public.process_settings (узел SETTINGS_NODE; страница «Процессы» админки):
//        values: { "#size.width": 768, "#lora.strength_model": 0.42, "#seed.steps": 16, … } — постоянные значения
//        prompt: "mhbh style, {{prompt}}, {{style}}" — шаблон промпта (пусто — просто {{prompt}})
//   3. Переменные запуска — узел VARS_NODE (в каждом конвейере назовите его «Vars»; для кадра — n8n/frame_vars.js):
//        prompt, refs[], output_prefix, style, seed?, …  а также любые «#метка.поле»: значение — подставятся как есть.
//
// По меткам (заголовок узла в ComfyUI, первое слово) заполняется само:
//   #prompt  ← шаблон промпта с {{переменными}}
//   #ref1..N ← refs[0..N-1]; лишние #ref удаляются вместе со входом, который на них ссылается
//            (так же для любого списка: переменная «xs» → узлы #x1..#xN)
//   #save    ← output_prefix
//   #seed    ← seed или случайный
// Скрипт ничего не знает о кадрах, видео или стилях — это задача узла переменных.
// Выход: { comfy_body: { prompt: <процесс> }, save_node, output_prefix, prompt_text, …переменные без списков }
// ═══════════════════════════════════════════════════════════════════════════

// Цепочка последовательная: Vars → Workflow → Process settings → Fill workflow; данные берутся по именам узлов.
// Имена одинаковые во всех конвейерах — скрипт копируется без правок.
const VARS_NODE = 'Vars'                  // переменные запуска (frame_vars.js и т.п.)
const WORKFLOW_NODE = 'Workflow'          // шаблон процесса
const SETTINGS_NODE = 'Process settings'  // Supabase: process_settings по имени файла (Settings → Always Output Data: вкл.)

const TEXT_FIELDS = ['text', 'prompt', 'value', 'string']
const labelOf = (node) => String(node?._meta?.title ?? '').trim().split(/\s/)[0].toLowerCase()
const render = (tpl, vars) =>
  String(tpl)
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => (vars[k] == null ? '' : Array.isArray(vars[k]) ? vars[k].join(', ') : String(vars[k])))
    .replace(/\s*,\s*(,\s*)+/g, ', ') // пустые переменные не оставляют «, ,»
    .replace(/^\s*,\s*|\s*,\s*$/g, '')
    .trim()

try {
  let vars
  try {
    vars = { ...$(VARS_NODE).first().json }
  } catch {
    throw new Error(`Нет узла «${VARS_NODE}» с переменными запуска — назовите так узел frame_vars.js`)
  }
  if (vars.error) throw new Error(`${VARS_NODE}: ${vars.error}`)

  // 1. Шаблон: HTTP отдаёт его как json; «Extract from File» — в поле data (объектом или строкой)
  const raw = $(WORKFLOW_NODE).first().json
  const src = raw.data !== undefined && !Object.values(raw).some((n) => n && n.class_type) ? raw.data : raw
  const wf = JSON.parse(JSON.stringify(typeof src === 'string' ? JSON.parse(src) : src))
  if (!Object.values(wf).some((n) => n && n.class_type)) throw new Error(`В узле «${WORKFLOW_NODE}» не процесс ComfyUI в API-формате`)

  const byLabel = (label) => Object.entries(wf).filter(([, n]) => labelOf(n) === label)
  const one = (label) => {
    const found = byLabel(label)
    if (found.length > 1) throw new Error(`Метка ${label} стоит на нескольких узлах`)
    return found[0] ?? null
  }
  const setField = (key, value) => {
    const [label, field] = key.split('.')
    const node = one(label.toLowerCase())
    if (!node) return // метки нет в этом процессе — настройка не про него
    if (!field) throw new Error(`«${key}»: нужно «#метка.поле»`)
    node[1].inputs[field] = value
  }

  // 2. Настройки процесса (необязательны)
  let settings = {}
  try {
    const row = $(SETTINGS_NODE).first().json
    settings = typeof row?.settings === 'string' ? JSON.parse(row.settings) : (row?.settings ?? {})
  } catch {
    /* узла нет или строка пустая — работаем по шаблону */
  }
  for (const [k, v] of Object.entries(settings.values ?? {})) setField(k, v)

  // 3. Переменные «#метка.поле» — как есть
  for (const [k, v] of Object.entries(vars)) if (k.startsWith('#')) setField(k, v)

  // Списки: переменная «refs» → узлы #ref1..#refN; лишние удаляем вместе со входами
  const prefixes = new Set(Object.values(wf).map(labelOf).map((l) => /^#([a-z_]+)\d+$/.exec(l)?.[1]).filter(Boolean))
  for (const p of prefixes) {
    const list = vars[`${p}s`] ?? vars[p]
    if (list != null && !Array.isArray(list)) throw new Error(`Переменная ${p}s должна быть списком`)
    const items = list ?? []
    const nodes = Object.entries(wf).filter(([, n]) => new RegExp(`^#${p}\\d+$`).test(labelOf(n)))
    if (items.length > nodes.length) throw new Error(`${p}s: значений ${items.length}, а узлов #${p}N в процессе ${nodes.length}`)
    for (const [id, node] of nodes) {
      const i = +labelOf(node).slice(p.length + 1)
      if (i <= items.length) {
        const field = 'image' in node.inputs ? 'image' : Object.keys(node.inputs).find((f) => !Array.isArray(node.inputs[f]))
        node.inputs[field] = items[i - 1]
      } else {
        delete wf[id]
        for (const n of Object.values(wf)) for (const [k, v] of Object.entries(n.inputs ?? {})) if (Array.isArray(v) && v[0] === id) delete n.inputs[k]
      }
    }
  }

  // #prompt
  let promptText = null
  const pn = one('#prompt')
  if (pn) {
    if (!String(vars.prompt ?? '').trim()) throw new Error('Пустой prompt в переменных')
    promptText = render(settings.prompt?.trim() || '{{prompt}}', vars)
    pn[1].inputs[TEXT_FIELDS.find((f) => f in pn[1].inputs) ?? 'text'] = promptText
  }

  // #save
  const save = one('#save')
  if (save) {
    if (!vars.output_prefix) throw new Error('Нет output_prefix в переменных')
    save[1].inputs.filename_prefix = vars.output_prefix
  }

  // #seed
  const seed = one('#seed')
  if (seed) seed[1].inputs['noise_seed' in seed[1].inputs ? 'noise_seed' : 'seed'] = vars.seed ?? Math.floor(Math.random() * 2 ** 48)

  const plain = Object.fromEntries(Object.entries(vars).filter(([k, v]) => !Array.isArray(v) && !k.startsWith('#')))
  return [{ json: { ...plain, comfy_body: { prompt: wf }, save_node: save?.[0] ?? null, prompt_text: promptText } }]
} catch (error) {
  return [{ json: { error: error.message } }]
}
