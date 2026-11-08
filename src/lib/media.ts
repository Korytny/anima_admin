// Медиа лежат на диске сервера в ComfyUI/output. В БД — путь ОТНОСИТЕЛЬНО output:
//   anima/<topics.folder>/characters/<имя>.png
//   anima/<topics.folder>/scenes/<scena>-<shot_num>.png
// topics.folder — транслит названия (+ -2, -3 при совпадении), назначает админка один раз (uniqueFolder).
// Полный путь тоже понимаем — отрезаем корень: /…/ComfyUI/output/anima/…, c:/ComfyUI/…/output/…, C:\…\output\…
// Полные URL (http…) отдаются как есть.
import type { Character, Scene, Topic } from '@/types'

const slashes = (p: string) => p.trim().replace(/\\/g, '/').replace(/\/+$/, '')

const BASE = (import.meta.env.VITE_MEDIA_BASE_URL || '/media').replace(/\/$/, '')
/** Абсолютный путь к ComfyUI/output на сервере — для копирования путей в ComfyUI и разбора полных путей. */
export const MEDIA_ROOT = slashes((import.meta.env.VITE_MEDIA_ROOT as string | undefined) ?? '')

const isUrl = (p: string) => /^(https?:|blob:|data:)/.test(p)
/** Абсолютный путь: /…, c:/…, C:\… */
const isAbs = (p: string) => /^(\/|[a-z]:\/)/i.test(p)

/** Приводит путь к виду «относительно output». */
export function toRelative(path: string): string {
  const p = slashes(path)
  // Windows-пути регистронезависимы: C:/ComfyUI == c:/comfyui
  if (MEDIA_ROOT && p.toLowerCase().startsWith(MEDIA_ROOT.toLowerCase() + '/')) return p.slice(MEDIA_ROOT.length + 1)
  if (isAbs(p)) {
    const i = p.toLowerCase().lastIndexOf('/output/')
    if (i >= 0) return p.slice(i + '/output/'.length)
  }
  return p.replace(/^\/+/, '')
}

export function mediaUrl(path?: string | null): string | undefined {
  if (!path?.trim()) return undefined
  if (isUrl(path)) return path
  return `${BASE}/${toRelative(path).split('/').map(encodeURIComponent).join('/')}`
}

/** Абсолютный путь на сервере (для вставки в ComfyUI). */
export function absPath(path: string): string {
  if (isUrl(path)) return path
  return MEDIA_ROOT ? `${MEDIA_ROOT}/${toRelative(path)}` : toRelative(path)
}

// ----- соглашение об именах

const TR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

/** «Адхиратха» → «adkhiratkha». Только [a-z0-9-], до 40 символов. */
export const slug = (s: string) =>
  [...s.toLowerCase()]
    .map((ch) => TR[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '') || 'noname'

/** Свободное имя папки для ролика: slug названия, при совпадении -2, -3… */
export function uniqueFolder(title: string | null | undefined, taken: Set<string>) {
  const base = slug(title ?? '') === 'noname' ? 'topic' : slug(title ?? '')
  let name = base
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}`
  return name
}

type TopicRef = Pick<Topic, 'topic_id' | 'folder'> | undefined

/** Папка ролика; пока folder не назначен — по topic_id. */
const topicDir = (topic: TopicRef, topicId: string | null) => `anima/${topic?.folder || topicId || 'no-topic'}`

/** «03-1» — код кадра: сцена (2 знака, для сортировки в папке) и шот. */
export const sceneCode = (s: Pick<Scene, 'scena' | 'shot_num'>) => `${String(s.scena ?? 0).padStart(2, '0')}-${s.shot_num ?? 1}`

/** Ожидаемый путь кадра сцены. */
export const scenePath = (s: Scene, topic: TopicRef) => `${topicDir(topic, s.topic)}/scenes/${sceneCode(s)}.png`

/** Ожидаемый путь картинки персонажа. */
export const characterPath = (c: Character, topic: TopicRef) => `${topicDir(topic, c.topic)}/characters/${slug(c.name ?? c.id)}.png`

/** filename_prefix для SaveImage в ComfyUI (ComfyUI сам допишет _00001_.png). */
export const outputPrefix = (s: Scene, topic: TopicRef) => `${topicDir(topic, s.topic)}/scenes/${sceneCode(s)}`
