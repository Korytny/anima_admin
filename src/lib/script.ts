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
