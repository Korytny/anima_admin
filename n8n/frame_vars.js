// ═══════════════════════════════════════════════════════════════════════════
// frame_vars.js — n8n Code-узел «Переменные кадра» (Mode: Run Once for All Items)
//
// Собирает переменные запуска для универсального fill_workflow.js — всё, что знает конвейер кадра:
//   prompt        — промпт шота из scene_refs.js (теги → «the person from image N»)
//   refs          — картинки персонажей по порядку (→ #ref1..#refN)
//   output_prefix — путь кадра anima/<seasons.folder>/<topics.folder>/<NN>-<шот> (та же схема, что lib/media.ts админки)
//   style         — добавка стиля сезона (seasons.style)
//   scene_id, ref_count, workflow_file — для следующих узлов
// Узлы: REFS_NODE (scene_refs.js), SCENE_NODE, TOPIC_NODE, SEASON_NODE (Supabase).
// ═══════════════════════════════════════════════════════════════════════════

const REFS_NODE = 'Scene_refs'
const SCENE_NODE = 'Scene'
const TOPIC_NODE = 'Topic'
const SEASON_NODE = 'Season'

// Стили сезона (seasons.style → добавка к промпту). Рабочие значения — здесь, в бэкенде;
// в админке (lib/styles.ts) — названия и превью для выбора.
const STYLES = {
  smooth3d: '3D animated feature film style, smooth stylized shading, soft global illumination, expressive faces',
  watercolor: 'hand-painted 2D anime film style, soft watercolor backgrounds, warm natural light, gentle colors',
  scifi: 'cinematic sci-fi fantasy CGI style, highly detailed costumes and armor, dramatic volumetric lighting',
  steampunk: 'painterly 3D style with hand-painted textures, steampunk details, brass and copper, moody rim lighting',
}

try {
  const refs = $(REFS_NODE).first().json
  if (!refs || !('ref_count' in refs)) throw new Error(`Нет вывода scene_refs.js в узле «${REFS_NODE}»`)
  if (refs.error) throw new Error(`scene_refs.js: ${refs.error}`)
  if (!String(refs.prompt ?? '').trim()) throw new Error('У шота пустой промпт (manual_prompt и visual_prompt) — сначала Постановщик')
  const scene = $(SCENE_NODE).first().json
  const topic = $(TOPIC_NODE).first().json
  const season = $(SEASON_NODE).first().json ?? {}
  if (!season.id) throw new Error(`В узле «${SEASON_NODE}» нет сезона`)
  if (season.style && !STYLES[season.style]) throw new Error(`Стиль сезона «${season.style}» не найден в STYLES`)

  const output_prefix = `anima/${season.folder || topic.season_id}/${topic.folder || topic.topic_id}/${String(scene.scena ?? 0).padStart(2, '0')}-${scene.shot_num ?? 1}`
  return [
    {
      json: {
        scene_id: refs.scene_id,
        prompt: refs.prompt,
        refs: refs.ref_images ?? [],
        ref_count: refs.ref_count,
        output_prefix,
        style: STYLES[season.style] ?? '',
        workflow_file: 'frame-refs.json', // один процесс и с персонажами, и без: лишние #ref заполнитель удаляет
      },
    },
  ]
} catch (error) {
  return [{ json: { error: error.message } }]
}
