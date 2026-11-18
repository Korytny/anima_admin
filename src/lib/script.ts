import { ranges } from './utils'

// Парсер сценария из topics.script_scenas (результат агента-сценариста).
// Формат:
//   === ЛОКАЦИЯ: <название> ===
//   @Scene: <N> — <бит>
//   @Characters: A, B
//   Описание: <текст, может продолжаться на следующих строках>
//   ——                       (разделитель сцен)
// Прочие строки вида «@Key: value» сохраняются в extra.

export interface ScriptLine {
  speaker: string
  text: string
}

export interface ScriptScene {
  num: number | null
  beat: string | null
  location: string | null
  characters: string[]
  description: string
  lines: ScriptLine[]
  extra: Record<string, string>
}

/** Блок агента перед ===STORY===: [CONFLICT] …, [PARADOX] …, [TWIST] … (или [TAG] … [/TAG]). */
export interface ScriptNote {
  tag: string
  text: string
}

export interface ParsedScript {
  /** Блоки перед ===STORY=== (как агент понял серию). */
  notes: ScriptNote[]
  scenes: ScriptScene[]
  locations: string[]
  /** Строки, которые не удалось отнести ни к одной сцене. */
  warnings: string[]
}

const RE_LOCATION = /^=+\s*ЛОКАЦИЯ\s*:\s*(.+?)\s*=*\s*$/i
const RE_SCENE = /^@Scene\s*:\s*(\d+)?\s*(?:[—–-]\s*(.*))?$/i
const RE_TAG = /^@([\w-]+)\s*:\s*(.*)$/
const RE_DESC = /^Описание\s*:\s*(.*)$/i
const RE_SEP = /^[—–-]{2,}\s*$/
const RE_STORY = /^=+\s*STORY\s*=+\s*$/im
const RE_END = /^=+\s*(END|КОНЕЦ)\s*=+\s*$/im
const RE_LINE = /([А-ЯЁA-Z][^.!?«»:]*?)\s+говорит\s*:\s*«([^»]*)»/g

export function parseLines(text: string): ScriptLine[] {
  return [...text.matchAll(RE_LINE)].map((m) => ({ speaker: m[1].trim(), text: m[2].trim() }))
}

export function parseScript(src: string | null | undefined): ParsedScript {
  const scenes: ScriptScene[] = []
  const locations: string[] = []
  const warnings: string[] = []
  let location: string | null = null
  let cur: ScriptScene | null = null
  let inDesc = false

  const close = () => {
    if (cur) {
      cur.description = cur.description.trim()
      cur.lines = parseLines(cur.description)
      scenes.push(cur)
    }
    cur = null
    inDesc = false
  }

  // Ответ агента: берём только то, что между ===STORY=== и ===END=== (преамбулу и хвост модели игнорируем)
  let text = src ?? ''
  const start = text.search(RE_STORY)
  const notes = start >= 0 ? parseNotes(text.slice(0, start)) : []
  if (start >= 0) text = text.slice(start).replace(RE_STORY, '')
  const end = text.search(RE_END)
  if (end >= 0) text = text.slice(0, end)

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) {
      if (inDesc && cur) cur.description += '\n'
      continue
    }
    let m: RegExpMatchArray | null
    if ((m = line.match(RE_LOCATION))) {
      close()
      location = m[1]
      if (!locations.includes(location)) locations.push(location)
    } else if (RE_SEP.test(line)) {
      close()
    } else if ((m = line.match(RE_SCENE))) {
      close()
      cur = { num: m[1] ? +m[1] : null, beat: m[2]?.trim() || null, location, characters: [], description: '', lines: [], extra: {} }
    } else if (!cur) {
      warnings.push(line)
    } else if ((m = line.match(RE_DESC))) {
      cur.description = m[1]
      inDesc = true
    } else if ((m = line.match(RE_TAG))) {
      inDesc = false
      if (m[1].toLowerCase() === 'characters')
        cur.characters = m[2]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      else cur.extra[m[1]] = m[2]
    } else if (inDesc) {
      cur.description += (cur.description ? ' ' : '') + line
    } else {
      warnings.push(line)
    }
  }
  close()
  return { notes, scenes, locations, warnings }
}

/** [TAG] текст (может продолжаться на следующих строках, закрывающий [/TAG] необязателен). */
function parseNotes(pre: string): ScriptNote[] {
  const notes: ScriptNote[] = []
  for (const raw of pre.split(/\r?\n/)) {
    const line = raw.replace(/\[\/[^\]]+\]/g, '').trim()
    const m = line.match(/^\[([A-ZА-ЯЁ_ ]+)\]\s*(.*)$/)
    if (m) notes.push({ tag: m[1].trim(), text: m[2] })
    else if (line && notes.length) notes[notes.length - 1].text += (notes[notes.length - 1].text ? '\n' : '') + line
  }
  return notes.map((n) => ({ ...n, text: n.text.trim() })).filter((n) => n.text)
}

// ── Проверка сценария по правилам агента-сценариста (Scenario/сценарист_рассказчик.md) ──
// Формальные правила, которые модель нарушает: их проверяет код, а человек решает — править или перегенерировать.

export const NARRATOR = 'Narrator'

export interface ScriptIssue {
  /** Номера сцен, к которым относится замечание (пусто — ко всему сценарию). */
  scenes: number[]
  text: string
}

export interface ScriptCheck {
  issues: ScriptIssue[]
  /** Слов у рассказчика всего и примерная длина ролика (2 слова в секунду). */
  narratorWords: number
  seconds: number
  /** Реплики персонажей (не рассказчика). */
  characterLines: number
}

const LIMITS = { silentScenes: 2, characterLines: 2, lineWords: 10, sceneWords: 30, minWords: 100, maxWords: 180 }
const isNarrator = (s: string) => s.trim().toLowerCase() === NARRATOR.toLowerCase()
const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
const numList = (ns: number[]) => ns.join(', ')


/** Ожидаемые метки @Beats из битов серии: HOOK, 1…N, КРЮЧОК (как в промпте сценариста). */
function expectedBeats(beats: string[]): string[] {
  const out: string[] = []
  let n = 0
  for (const b of beats.map((x) => x.trim()).filter(Boolean)) {
    if (/^HOOK\b/i.test(b)) out.push('HOOK')
    else if (/^КРЮЧОК\b/i.test(b)) out.push('КРЮЧОК')
    else out.push(String(++n))
  }
  return out
}

const beatKey = (s: string) => (/^hook$/i.test(s) ? 'HOOK' : /^крючок$/i.test(s) ? 'КРЮЧОК' : s)

export function checkScript(parsed: ParsedScript, opts: { beats?: string[] | null; known?: Set<string> }): ScriptCheck {
  const issues: ScriptIssue[] = []
  const { scenes } = parsed
  const num = (s: ScriptScene, i: number) => s.num ?? i + 1
  const known = opts.known
  const isKnown = (tag: string) => !known || known.has(tag.trim().toLowerCase())

  // Биты: все на месте и по порядку
  const expected = opts.beats?.length ? expectedBeats(opts.beats) : []
  if (expected.length) {
    const seen: string[] = []
    scenes.forEach((s) => {
      for (const b of (s.extra.Beats ?? '').split(',').map((x) => beatKey(x.trim())).filter(Boolean)) if (!seen.includes(b)) seen.push(b)
    })
    const missing = expected.filter((b) => !seen.includes(b))
    if (missing.length) issues.push({ scenes: [], text: `Нет битов: ${missing.join(', ')}` })
    const order = seen.filter((b) => expected.includes(b))
    if (order.some((b, i) => i > 0 && expected.indexOf(b) < expected.indexOf(order[i - 1]))) issues.push({ scenes: [], text: `Биты не по порядку: ${order.join(' → ')}` })
  }

  // Теги персонажей
  if (known) {
    // Одно замечание на все теги: «Karna (сц. 1–10), Drona (сц. 2)»
    const bad = new Map<string, number[]>()
    scenes.forEach((s, i) => s.characters.filter((c) => !isKnown(c)).forEach((c) => bad.set(c, [...(bad.get(c) ?? []), num(s, i)])))
    if (bad.size)
      issues.push({
        scenes: [...new Set([...bad.values()].flat())].sort((a, b) => a - b),
        text: `Нет в персонажах сезона: ${[...bad].map(([c, ns]) => `${c} (сц. ${ranges(ns)})`).join(', ')}`,
      })
  }

  // Рассказчик: немые сцены, объём
  const silent: number[] = []
  let narratorWords = 0
  scenes.forEach((s, i) => {
    const narr = s.lines.filter((l) => isNarrator(l.speaker))
    const w = narr.reduce((a, l) => a + words(l.text), 0)
    narratorWords += w
    if (!narr.length) silent.push(num(s, i))
    else if (w > LIMITS.sceneWords) issues.push({ scenes: [num(s, i)], text: `У рассказчика ${w} слов в сцене (норма до ${LIMITS.sceneWords}) — текст, вероятно, объясняет соседние сцены` })
  })
  if (silent.length > LIMITS.silentScenes) issues.push({ scenes: silent, text: `Сцен без рассказчика ${silent.length}: ${numList(silent)} (норма — не больше ${LIMITS.silentScenes})` })
  const runs = silent.filter((n) => silent.includes(n - 1) || silent.includes(n + 1))
  if (runs.length) issues.push({ scenes: runs, text: `Сцены без рассказчика подряд: ${numList(runs)}` })
  if (scenes.length && (narratorWords < LIMITS.minWords || narratorWords > LIMITS.maxWords))
    issues.push({ scenes: [], text: `У рассказчика ${narratorWords} слов на серию (норма ${LIMITS.minWords}–${LIMITS.maxWords})` })

  // Реплики персонажей
  const lines = scenes.flatMap((s, i) => s.lines.filter((l) => !isNarrator(l.speaker)).map((l) => ({ ...l, n: num(s, i) })))
  if (lines.length > LIMITS.characterLines) issues.push({ scenes: [...new Set(lines.map((l) => l.n))], text: `Реплик персонажей ${lines.length} (норма — не больше ${LIMITS.characterLines})` })
  for (const l of lines) {
    if (!isKnown(l.speaker)) issues.push({ scenes: [l.n], text: `Говорит «${l.speaker}» — нет в персонажах сезона, у него нет голоса` })
    if (words(l.text) > LIMITS.lineWords) issues.push({ scenes: [l.n], text: `Реплика ${l.speaker} длиннее ${LIMITS.lineWords} слов` })
  }

  // Говорит без реплики — видео покажет рот без звука
  scenes.forEach((s, i) => {
    const desc = s.description.replace(/[А-ЯЁA-Z][^.!?«»:]*?\s+говорит\s*:\s*«[^»]*»/g, '')
    if (/начинает говорить|губы\s+(шевел|повтор|двига)|произносит|шепчет|говорит(?!\s*:)/i.test(desc))
      issues.push({ scenes: [num(s, i)], text: 'В описании персонаж говорит без реплики — видео покажет рот без звука' })
  })

  return { issues, narratorWords, seconds: Math.round(narratorWords / 2), characterLines: lines.length }
}
