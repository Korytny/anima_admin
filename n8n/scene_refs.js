// ═══════════════════════════════════════════════════════════════════════════
// scene_refs.js — n8n Code-узел (Mode: Run Once for All Items)
//
// Для каждой сцены: какие картинки персонажей идут в референсы (#ref1..#ref3),
// какой промпт отдать модели («the person from image N»), и голос говорящего.
//
// Используется в двух местах (номера считаются одинаково — разъехаться им негде):
//   1. Подготовка сцен: пишем в scenes char_img_url + speaking_character_voice + speaker_voice_profile.
//   2. Генерация кадра: берём prompt, ref_images, ref_count и подставляем в процесс workflows/frame-refs.json.
//
// Вход ($input): сцены (строки public.scenes) — одна или все сцены серии.
// Узел CHARACTERS_NODE: персонажи сезона — строки public.characters, где season = topics.season_id серии.
//
// Правила (CLAUDE.md админки):
//   • Порядок референсов = порядок в scene.character. Персонаж без записи/картинки выпадает,
//     и номера считаются по ОСТАВШИМСЯ — чтобы картинка N и «image N» в промпте всегда совпадали.
//   • Теги персонажей в промпте заменяются на «the person from image N». Тег без картинки остаётся словом.
//   • Пути в БД — относительно ComfyUI/output. Для LoadImage на своём сервере — суффикс " [output]"
//     (файл не загружаем). Для удалённого сервера — LOCAL_SERVER = false и загрузка через /upload/image.
// ═══════════════════════════════════════════════════════════════════════════

// ── Настройки ──────────────────────────────────────────────────────────────
const CHARACTERS_NODE = 'Characters'   // имя узла с персонажами сезона
const SCENE_NODE = 'Scene'             // имя узла со строкой scenes (если на вход пришёл не шот)
const MAX_REFS = 3                     // сколько #ref в процессе frame-refs.json
const LOCAL_SERVER = true              // ComfyUI видит папку output, где лежат персонажи
const STYLE_TRIGGER = ''               // триггер стиля в начало промпта, напр. 'mhbh style' (пусто — без него)
// ───────────────────────────────────────────────────────────────────────────

// Имя → ключ: регистр, пробелы, _ и - не важны («Karna_boy» = «karna boy» = «KARNABOY»)
const norm = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// Путь относительно ComfyUI/output: срезаем всё до /output/, обратные слэши → прямые
const toRelative = (p) => {
  const s = String(p ?? '').trim().replace(/\\/g, '/')
  if (!s) return ''
  const i = s.toLowerCase().lastIndexOf('/output/')
  return i >= 0 ? s.slice(i + '/output/'.length) : s.replace(/^\/+/, '')
}

// Картинка персонажа — первое непустое из base_img, pers_file, filename (как в админке: characterImages)
const characterImage = (c) => [c.base_img, c.pers_file, c.filename].map(toRelative).find(Boolean) || ''

// Регулярка тега: целое слово, без учёта регистра; части тега через _, пробел или дефис.
// «Kunti's» тоже ловится (апостроф не часть слова) → «the person from image 1's».
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const tagRegex = (tag) => {
  const parts = String(tag).trim().split(/[\s_-]+/).filter(Boolean).map(escape)
  return new RegExp(`(?<![A-Za-z0-9_])${parts.join('[\\s_-]+')}(?![A-Za-z0-9_])`, 'gi')
}

const asList = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? v.split(',') : []).map((x) => String(x).trim()).filter(Boolean)

try {
  // ── Персонажи сезона: ключ имени → запись ──
  const byName = new Map()
  for (const item of $(CHARACTERS_NODE).all()) {
    const c = item.json
    if (c?.name) byName.set(norm(c.name), c)
  }

  // Шоты: со входа, а если на вход пришло другое (персонажи, вебхук) — из узла SCENE_NODE
  const isScene = (j) => j && typeof j === 'object' && 'scene_id' in j
  let sceneItems = $input.all().filter((i) => isScene(i.json))
  if (!sceneItems.length) {
    try {
      sceneItems = $(SCENE_NODE).all().filter((i) => isScene(i.json))
    } catch {
      /* узла нет — ниже понятная ошибка */
    }
  }
  if (!sceneItems.length)
    throw new Error(`Нет шота: на вход и в узле «${SCENE_NODE}» нет строки scenes (поле scene_id). Проверьте, что узел Scene нашёл шот по scene_id из вебхука`)
  if (!byName.size) throw new Error(`Нет персонажей сезона в узле «${CHARACTERS_NODE}» — проверьте фильтр characters.season = topics.season_id`)

  const out = sceneItems.map(({ json: scene }) => {
    const tags = [...new Set(asList(scene.character).map((t) => t))] // порядок как в сцене, без повторов
    const refs = [] // { tag, image }
    const missing = [] // теги без записи или без картинки
    for (const tag of tags) {
      const c = byName.get(norm(tag))
      const image = c ? characterImage(c) : ''
      if (image && refs.length < MAX_REFS) refs.push({ tag, image })
      else missing.push(c ? (image ? `${tag} (больше ${MAX_REFS} референсов)` : `${tag} (нет картинки)`) : `${tag} (нет в персонажах сезона)`)
    }

    // ── Промпт для модели: ручной важнее авто; теги → «the person from image N» ──
    let prompt = String(scene.manual_prompt || scene.visual_prompt || '').trim()
    // Длинные теги первыми: «Karna_boy» раньше «Karna»
    const ordered = refs.map((r, i) => ({ ...r, n: i + 1 })).sort((a, b) => b.tag.length - a.tag.length)
    // Сначала в метки-заглушки, потом в текст — чтобы замена не задела уже вставленное
    for (const r of ordered) prompt = prompt.replace(tagRegex(r.tag), `\u0000${r.n}\u0000`)
    prompt = prompt.replace(/\u0000(\d+)\u0000/g, (_, n) => `the person from image ${n}`)
    if (STYLE_TRIGGER) prompt = `${STYLE_TRIGGER}, ${prompt}`

    // ── Голос говорящего ──
    const speaker = scene.speaking_character ? byName.get(norm(scene.speaking_character)) : null

    return {
      json: {
        scene_id: scene.scene_id,
        // → scenes.char_img_url (админка показывает их миниатюрами в карточке сцены)
        char_img_url: refs.map((r) => r.image),
        // → LoadImage в #ref1..#refN (на своём сервере — из папки output, без загрузки)
        ref_images: refs.map((r) => (LOCAL_SERVER ? `${r.image} [output]` : r.image)),
        ref_tags: refs.map((r) => r.tag),
        // сколько #ref оставить; лишние n8n удаляет с конца вместе со входом images.imageN
        ref_count: refs.length,
        // → #prompt (тот же процесс и без персонажей: при ref_count = 0 все #ref удаляются)
        prompt,
        missing,
        // → scenes.speaking_character_voice / speaker_voice_profile
        speaking_character_voice: speaker?.voice_name ?? null,
        speaker_voice_profile: speaker?.voice_profile ?? null,
        speaker_missing: scene.speaking_character && !speaker ? scene.speaking_character : null,
      },
    }
  })

  return out
} catch (error) {
  return [{ json: { error: error.message } }]
}
