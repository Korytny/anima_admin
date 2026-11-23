// Варианты кадра и видео шота на диске (перегенерации лежат рядом: 01-1_00001_.png, 01-1_00002_.png…; 01-1_00001-audio.mp4…).
// Список отдаёт сервер админки (плагин media-dir в vite.config.ts) — только чтение папки MEDIA_DIR.
import { toRelative } from '@/lib/media'

export interface Variant {
  path: string // относительно ComfyUI/output
  mtime: number
}

/** Префикс шота из пути кадра: anima/karna/ep/01-1_00002_.png → anima/karna/ep/01-1 */
export const variantPrefix = (path: string) =>
  toRelative(path)
    .replace(/\.(png|jpe?g|webp)$/i, '')
    .replace(/_\d+_$/, '')

/** Префикс шота из пути видео: anima/karna/ep/08-22_00002-audio.mp4 → anima/karna/ep/08-22 */
export const videoVariantPrefix = (path: string) =>
  toRelative(path)
    .replace(/\.(mp4|webm|mov)$/i, '')
    .replace(/-audio$/i, '')
    .replace(/_\d+_?$/, '')

export async function listVariants(prefix: string, kind: 'image' | 'video' = 'image'): Promise<Variant[]> {
  try {
    const r = await fetch(`/media-api/variants?prefix=${encodeURIComponent(prefix)}${kind === 'video' ? '&kind=video' : ''}`)
    return r.ok ? ((await r.json()) as Variant[]) : []
  } catch {
    return []
  }
}
