// ═══════════════════════════════════════════════════════════════════════════
// video_result.js — n8n Code-узел «Result» конвейера видео (Mode: Run Once for All Items)
//
// Разбирает ответ ComfyUI GET /history/<prompt_id> видео-сервера: нашёл ли #save (VHS_VideoCombine) готовый mp4.
// Вход:  $input.first().json — ответ /history/<prompt_id>
//        узлы FILL_NODE (save_node, scene_id) и PROMPT_NODE (prompt_id)
// Выход: { done: false } — ещё считается (n8n ждёт и спрашивает снова);
//        { done: true, ok: true, scene_id, filename, subfolder } — файл на видео-сервере (скачать через /view);
//        { done: true, ok: false, scene_id, error }
// ═══════════════════════════════════════════════════════════════════════════

const FILL_NODE = 'Fill workflow'
const PROMPT_NODE = 'Comfy prompt'
const VARS_NODE = 'Vars'
const TIMEOUT_MIN = 60 // видео-сервер мог получить очередь из многих шотов

let scene_id = null
try {
  const fill = $(FILL_NODE).first().json
  scene_id = fill.scene_id
  if (fill.error) return [{ json: { done: true, ok: false, scene_id, error: fill.error } }]
  const promptId = $(PROMPT_NODE).first().json.prompt_id
  if (!promptId) return [{ json: { done: true, ok: false, scene_id, error: 'ComfyUI не принял процесс (нет prompt_id)' } }]

  const entry = $input.first().json[promptId]
  const startedAt = $(VARS_NODE).first().json.started_at ?? Date.now()
  if (!entry?.status?.completed && Date.now() - startedAt > TIMEOUT_MIN * 60_000)
    return [{ json: { done: true, ok: false, scene_id, error: `Видео не готово за ${TIMEOUT_MIN} мин (prompt_id ${promptId})` } }]
  if (!entry) return [{ json: { done: false, scene_id } }] // в очереди или считается

  const status = entry.status ?? {}
  if (status.status_str === 'error') {
    const err = (status.messages ?? []).find((m) => m[0] === 'execution_error')?.[1] ?? {}
    return [{ json: { done: true, ok: false, scene_id, error: `ComfyUI: ${err.node_type ?? ''} ${err.exception_message ?? 'ошибка выполнения'}`.trim() } }]
  }
  if (!status.completed) return [{ json: { done: false, scene_id } }]

  const out = entry.outputs?.[fill.save_node] ?? {}
  const files = [...(out.gifs ?? []), ...(out.videos ?? []), ...(out.images ?? [])].filter((f) => /\.(mp4|webm|mov)$/i.test(f.filename ?? ''))
  // VHS с аудио сохраняет и немой файл, и «-audio» — берём со звуком
  const file = files.find((f) => /-audio\.\w+$/i.test(f.filename)) ?? files[0]
  if (!file) return [{ json: { done: true, ok: false, scene_id, error: 'Нет видео в выходе узла #save' } }]
  return [{ json: { done: true, ok: true, scene_id, filename: file.filename, subfolder: String(file.subfolder ?? '').replace(/\\/g, '/') } }]
} catch (error) {
  return [{ json: { done: true, ok: false, scene_id, error: error.message } }]
}
