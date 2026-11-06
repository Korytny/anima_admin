// Медиа лежат на диске сервера в ComfyUI/output. В БД — путь ОТНОСИТЕЛЬНО output:
//   anima/<topic_id>/characters/<имя>.png
//   anima/<topic_id>/scenes/<scena>-<shot_num>.png
// Полный путь (/…/ComfyUI/output/anima/…) тоже понимаем — отрезаем корень.
// Полные URL (http…) отдаются как есть.
import type { Character, Scene } from '@/types'

const BASE = (import.meta.env.VITE_MEDIA_BASE_URL || '/media').replace(/\/$/, '')
/** Абсолютный путь к ComfyUI/output на сервере — для копирования путей в ComfyUI и разбора полных путей. */
export const MEDIA_ROOT = ((import.meta.env.VITE_MEDIA_ROOT as string | undefined) ?? '').replace(/\/$/, '')

const isUrl = (p: string) => /^(https?:|blob:|data:)/.test(p)

/** Приводит путь к виду «относительно output». */
export function toRelative(path: string): string {
  let p = path.trim().replace(/\\/g, '/')
  if (MEDIA_ROOT && p.startsWith(MEDIA_ROOT + '/')) return p.slice(MEDIA_ROOT.length + 1)
  const i = p.lastIndexOf('/output/')
  if (p.startsWith('/') && i >= 0) p = p.slice(i + '/output/'.length)
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

export const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '') || 'noname'

const topicDir = (topicId: string | null) => `anima/${topicId ?? 'no-topic'}`

/** «03-1» — код кадра: сцена (2 знака, для сортировки в папке) и шот. */
export const sceneCode = (s: Pick<Scene, 'scena' | 'shot_num'>) => `${String(s.scena ?? 0).padStart(2, '0')}-${s.shot_num ?? 1}`

/** Ожидаемый путь кадра сцены. */
export const scenePath = (s: Scene) => `${topicDir(s.topic)}/scenes/${sceneCode(s)}.png`

/** Ожидаемый путь картинки персонажа. */
export const characterPath = (c: Character) => `${topicDir(c.topic)}/characters/${slug(c.name ?? c.id)}.png`

/** filename_prefix для SaveImage в ComfyUI (ComfyUI сам допишет _00001_.png). */
export const outputPrefix = (s: Scene) => `${topicDir(s.topic)}/scenes/${sceneCode(s)}`
