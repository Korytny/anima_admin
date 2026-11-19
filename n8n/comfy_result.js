// ═══════════════════════════════════════════════════════════════════════════
// comfy_result.js — n8n Code-узел (Mode: Run Once for All Items)
//
// Разбирает ответ ComfyUI GET /history/<prompt_id> и отдаёт путь к кадру для scenes.base_image_url.
// Путь — относительно ComfyUI/output (как везде в админке): anima/karna/02-lozh-uchenika/02-3_00001_.png
//
// Вход:  $input.first().json — ответ /history/<prompt_id>
//        узел FILL_NODE     — fill_workflow.js (save_node, scene_id)
//        узел PROMPT_NODE   — ответ POST /prompt (prompt_id)
// Выход: { done: false } — ещё генерируется (n8n ждёт и спрашивает снова);
//        { done: true, ok: true, scene_id, base_image_url, status: 'ready' } или { done: true, ok: false, status: 'error', error }
// ═══════════════════════════════════════════════════════════════════════════

const FILL_NODE = 'Fill workflow'
const PROMPT_NODE = 'Comfy prompt'

try {
  const { save_node, scene_id } = $(FILL_NODE).first().json
  const promptId = $(PROMPT_NODE).first().json.prompt_id
  const entry = $input.first().json[promptId]
  if (!entry) return [{ json: { done: false, scene_id } }] // в истории ещё нет — в очереди или считается

  const status = entry.status ?? {}
  if (status.status_str === 'error') {
    const msg = (status.messages ?? []).find((m) => m[0] === 'execution_error')?.[1]?.exception_message ?? 'ComfyUI: ошибка выполнения'
    return [{ json: { done: true, ok: false, scene_id, status: 'error', error: msg } }]
  }
  if (!status.completed) return [{ json: { done: false, scene_id } }]

  const img = entry.outputs?.[save_node]?.images?.[0]
  if (!img) return [{ json: { done: true, ok: false, scene_id, status: 'error', error: 'Нет картинки в выходе узла #save' } }]
  const base_image_url = [img.subfolder, img.filename].filter(Boolean).join('/').replace(/\\/g, '/')
  return [{ json: { done: true, ok: true, scene_id, base_image_url, status: 'ready' } }]
} catch (error) {
  return [{ json: { done: true, ok: false, status: 'error', error: error.message } }]
}
