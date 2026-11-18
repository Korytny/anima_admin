// Шоты серии из topics.script_shots (вывод агента-Редактора, Scenario/редактор_рассказчик.md) и их проверка.
// Формат:
//   === LOCATION N: <название> ===
//   @time: day
//   @NS: <описание локации>
//   # Scene N
//   K: #do|#talk !wide|!medium|!close %left|%right|%center|%face {Tag, Tag}
//   (<кадр>)
//   [<движение>]
//   *Narrator: <текст> ~ <тон>      (только в #do)
//   *Tag: <реплика> ~ <тон>         (только в #talk)
import { NARRATOR, type ParsedScript } from './script'
import { ranges } from './utils'

export interface ShotLine {
  speaker: string
  text: string
  tone: string | null
}

export interface Shot {
  n: number
  scene: number | null
  /** Индекс блока локации в locations. */
  loc: number
  type: string
  size: string | null
  angle: string | null
  chars: string[]
  frame: string
  motion: string
  lines: ShotLine[]
}

export interface ShotLocation {
  num: number | null
  name: string
  time: string | null
  ns: string
}

export interface ParsedShots {
  locations: ShotLocation[]
  shots: Shot[]
  warnings: string[]
}

const RE_LOC = /^=+\s*LOCATION\s*(\d+)?\s*:\s*(.+?)\s*=*\s*$/i
const RE_SCENE = /^#\s*Scene\s*(\d+)/i
const RE_SHOT = /^(\d+)\s*:\s*(#\w+)\s*(.*)$/
const RE_LINE = /^\*\s*([^:]+?)\s*:\s*(.*?)\s*(?:~\s*(.*))?$/

export function parseShots(src: string | null | undefined): ParsedShots {
  const locations: ShotLocation[] = []
  const shots: Shot[] = []
  const warnings: string[] = []
  let scene: number | null = null
  let cur: Shot | null = null
  for (const raw of (src ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line === '```') continue
    let m: RegExpMatchArray | null
    if ((m = line.match(RE_LOC))) {
      cur = null
      locations.push({ num: m[1] ? +m[1] : null, name: m[2], time: null, ns: '' })
    } else if ((m = line.match(/^@time\s*:\s*(.*)$/i)) && locations.length) {
      locations[locations.length - 1].time = m[1].trim() || null
    } else if ((m = line.match(/^@NS\s*:\s*(.*)$/i)) && locations.length) {
      locations[locations.length - 1].ns = m[1].trim()
    } else if ((m = line.match(RE_SCENE))) {
      cur = null
      scene = +m[1]
    } else if ((m = line.match(RE_SHOT))) {
      const rest = m[3]
      const chars = rest.match(/\{([^}]*)\}/)?.[1] ?? ''
      cur = {
        n: +m[1],
        scene,
        loc: Math.max(0, locations.length - 1),
        type: m[2].toLowerCase(),
        size: rest.match(/!(\w+)/)?.[1] ?? null,
        angle: rest.match(/%(\w+)/)?.[1] ?? null,
        chars: chars.split(',').map((s) => s.trim()).filter(Boolean),
        frame: '',
        motion: '',
        lines: [],
      }
      shots.push(cur)
    } else if (cur && line.startsWith('(')) {
      cur.frame = line.replace(/^\(|\)$/g, '').trim()
    } else if (cur && line.startsWith('[')) {
      cur.motion = line.replace(/^\[|\]$/g, '').trim()
    } else if (cur && (m = line.match(RE_LINE))) {
      cur.lines.push({ speaker: m[1].trim(), text: m[2].trim(), tone: m[3]?.trim() || null })
    } else {
      warnings.push(line)
    }
  }
  return { locations, shots, warnings }
}

// ── Проверка по правилам Редактора ──

export interface ShotIssue {
  /** Номера шотов, к которым относится замечание. */
  shots: number[]
  text: string
}

const LIMITS = { silentSceneShots: 2, silentRun: 4, narratorMax: 28 }
/** Строка заканчивается не концом предложения — фразу разрезали между шотами, озвучка прозвучит обрывком. */
const CUT = /[^.!?…»"')]$/
const isNarrator = (s: string) => s.trim().toLowerCase() === NARRATOR.toLowerCase()
const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
const SPEAKING = /\b(speak|speaks|speaking|say|says|saying|talk|talks|talking|lips?|mouths?|whispers?|whispering|recites?|reciting)\b/i
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')


/** Сводит одинаковые замечания разных шотов в одно: «Нет в {}: … — шоты 4, 5». */
function grouped(map: Map<string, number[]>, issues: ShotIssue[], suffix = '') {
  for (const [text, ns] of map) issues.push({ shots: ns, text: `${text}${suffix}` })
}
const add = (map: Map<string, number[]>, key: string, n: number) => map.set(key, [...(map.get(key) ?? []), n])

export function checkShots(parsed: ParsedShots, opts: { script?: ParsedScript; tags?: string[] }) {
  const issues: ShotIssue[] = []
  const { shots, locations } = parsed
  const script = opts.script
  // Теги персонажей: из библиотеки сезона, иначе — все, что встречаются в {}
  const tags = opts.tags?.length ? opts.tags : [...new Set(shots.flatMap((s) => s.chars))]
  const known = new Set(tags.map((t) => t.toLowerCase()))

  // Локации: номера подряд, повтор названия — тот же @NS, число блоков как в сценарии
  const nums = locations.map((l) => l.num)
  if (nums.some((n, i) => n !== i + 1)) issues.push({ shots: [], text: `Номера локаций не подряд: ${nums.map((n) => n ?? '?').join(', ')} — при возврате в место номер всё равно новый` })
  locations.forEach((l, i) => {
    const first = locations.findIndex((x) => x.name.trim().toLowerCase() === l.name.trim().toLowerCase())
    if (first < i && locations[first].ns !== l.ns) issues.push({ shots: shots.filter((s) => s.loc === i).map((s) => s.n), text: `Локация «${l.name}» повторяется, но @NS отличается от первого — место будет выглядеть по-другому` })
    if (!l.ns) issues.push({ shots: [], text: `У локации «${l.name}» нет @NS` })
  })
  if (script?.scenes.length) {
    const blocks = script.scenes.filter((s, i) => i === 0 || s.location !== script.scenes[i - 1].location).length
    if (blocks !== locations.length) issues.push({ shots: [], text: `Блоков локаций ${locations.length}, в сценарии ${blocks}` })
  }

  // Сцены: все сцены сценария разбиты на шоты, по порядку
  const sceneNums = [...new Set(shots.map((s) => s.scene).filter((n): n is number => n != null))]
  if (script?.scenes.length) {
    const missing = script.scenes.map((s) => s.num).filter((n): n is number => n != null && !sceneNums.includes(n))
    if (missing.length) issues.push({ shots: [], text: `Нет шотов для сцен: ${ranges(missing)}` })
  }
  if (sceneNums.some((n, i) => i > 0 && n < sceneNums[i - 1])) issues.push({ shots: [], text: 'Сцены идут не по порядку' })

  // Формат шота
  const fmt = new Map<string, number[]>()
  for (const s of shots) {
    if (s.type !== '#do' && s.type !== '#talk') add(fmt, `Тип ${s.type} — бывает только #do или #talk`, s.n)
    if (!s.frame) add(fmt, 'Нет кадра ()', s.n)
    if (!s.motion) add(fmt, 'Нет движения []', s.n)
    if (/[~*]/.test(s.motion)) add(fmt, 'В [] попал текст реплики или рассказчика', s.n)
    if (s.angle === 'face' && s.chars.length < 2) add(fmt, '%face при одном персонаже — только для двоих и больше', s.n)
    for (const c of s.chars) if (!known.has(c.toLowerCase())) add(fmt, `Тег ${c} не из персонажей сезона`, s.n)
  }
  grouped(fmt, issues)

  // Персонажи в кадре: упомянут в () — должен быть в {}
  const missingRef = new Map<string, number[]>()
  for (const s of shots) {
    const inShot = new Set(s.chars.map((c) => c.toLowerCase().split('_')[0]))
    for (const t of tags) {
      if (isNarrator(t)) continue
      const name = t.split('_')[0]
      if (inShot.has(name.toLowerCase())) continue
      if (new RegExp(`(?<![\\p{L}])${esc(name)}(?![\\p{L}])`, 'iu').test(s.frame)) add(missingRef, `${name} упомянут в (), но его нет в {} — нарисуется без референса`, s.n)
    }
    if (!s.chars.length && tags.some((t) => !isNarrator(t) && new RegExp(`(?<![\\p{L}])${esc(t.split('_')[0])}(?![\\p{L}])`, 'iu').test(s.frame)))
      add(missingRef, 'Пустой {}, но в () есть герой', s.n)
  }
  grouped(missingRef, issues)

  // #do / #talk и строки
  const talk = new Map<string, number[]>()
  for (const s of shots) {
    const narr = s.lines.filter((l) => isNarrator(l.speaker))
    const say = s.lines.filter((l) => !isNarrator(l.speaker))
    if (narr.length > 1) add(talk, 'Несколько строк рассказчика в одном шоте', s.n)
    if (s.type === '#do') {
      if (say.length) add(talk, 'Реплика персонажа в #do — нужен #talk', s.n)
      if (SPEAKING.test(`${s.frame} ${s.motion}`)) add(talk, 'В #do персонаж говорит (speak, lips, mouth…) — видео покажет рот без звука', s.n)
      for (const l of narr) {
        const w = words(l.text)
        if (w > LIMITS.narratorMax) add(talk, `Фраза рассказчика длиннее ${LIMITS.narratorMax} слов — шот затянется`, s.n)
        if (CUT.test(l.text)) add(talk, 'Фраза рассказчика оборвана — продолжение в другом шоте, озвучка прозвучит обрывком', s.n)
      }
    } else if (s.type === '#talk') {
      if (narr.length) add(talk, 'Рассказчик в #talk — его строка только в #do', s.n)
      if (!say.length) add(talk, '#talk без реплики', s.n)
      for (const l of say) if (CUT.test(l.text)) add(talk, 'Реплика оборвана — она должна быть целиком в одном #talk', s.n)
      if (s.chars.length !== 1) add(talk, '#talk: в {} должен быть ровно один — говорящий', s.n)
      for (const l of say) if (s.chars.length && !s.chars.some((c) => c.toLowerCase() === l.speaker.toLowerCase())) add(talk, 'Говорящий не совпадает с {}', s.n)
      if (/\b(faces away|back to|turned away|from behind)\b/i.test(s.frame)) add(talk, '#talk: лица говорящего не видно — липсинк не получится', s.n)
    }
  }
  grouped(talk, issues)

  // Тишина: немые сцены длиннее двух шотов и длинные немые цепочки
  const voiced = (s: Shot) => s.lines.length > 0
  const byScene = new Map<number, Shot[]>()
  for (const s of shots) if (s.scene != null) byScene.set(s.scene, [...(byScene.get(s.scene) ?? []), s])
  for (const [n, list] of byScene)
    if (!list.some(voiced) && list.length > LIMITS.silentSceneShots)
      issues.push({ shots: list.map((s) => s.n), text: `Немая сцена ${n} — ${list.length} шота (норма до ${LIMITS.silentSceneShots})` })
  let run: number[] = []
  const flush = () => {
    if (run.length >= LIMITS.silentRun) issues.push({ shots: run, text: `Немых шотов подряд: ${run.length} — долгая тишина` })
    run = []
  }
  for (const s of shots) (voiced(s) ? flush() : run.push(s.n))
  flush()

  // Текст рассказчика и реплики — как в сценарии, по сценам
  if (script?.scenes.length) {
    for (const sc of script.scenes) {
      if (sc.num == null) continue
      const list = byScene.get(sc.num) ?? []
      if (!list.length) continue
      const ns = list.map((s) => s.n)
      const hasNarr = sc.lines.some((l) => isNarrator(l.speaker))
      const shotNarr = list.some((s) => s.lines.some((l) => isNarrator(l.speaker)))
      if (hasNarr && !shotNarr) issues.push({ shots: ns, text: `Сцена ${sc.num}: текст рассказчика из сценария потерян` })
      if (!hasNarr && shotNarr) issues.push({ shots: ns, text: `Сцена ${sc.num}: у рассказчика текст, которого нет в сценарии` })
      const want = sc.lines.filter((l) => !isNarrator(l.speaker)).length
      const got = list.flatMap((s) => s.lines).filter((l) => !isNarrator(l.speaker)).length
      if (got < want) issues.push({ shots: ns, text: `Сцена ${sc.num}: реплик в шотах ${got}, в сценарии ${want}` })
      if (got > want) issues.push({ shots: ns, text: `Сцена ${sc.num}: реплик в шотах ${got}, в сценарии ${want} — добавлены редактором` })
    }
  }

  const narratorWords = shots.flatMap((s) => s.lines).filter((l) => isNarrator(l.speaker)).reduce((a, l) => a + words(l.text), 0)
  return {
    issues,
    narratorWords,
    /** Озвучка ~2.5 слова/с по-английски + немые шоты по 3 с. */
    seconds: Math.round(narratorWords / 2.5 + shots.filter((s) => !s.lines.length).length * 3),
    silent: shots.filter((s) => !s.lines.length).length,
  }
}
