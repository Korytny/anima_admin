// Варианты кадра шота на диске (ComfyUI кладёт перегенерации рядом: 01-1_00001_.png, 01-1_00002_.png…).
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

export async function listVariants(prefix: string): Promise<Variant[]> {
  try {
    const r = await fetch(`/media-api/variants?prefix=${encodeURIComponent(prefix)}`)
    return r.ok ? ((await r.json()) as Variant[]) : []
  } catch {
    return []
  }
}
