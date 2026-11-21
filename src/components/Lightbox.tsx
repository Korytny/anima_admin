// Просмотр картинки во весь экран: клик по фону или Esc — закрыть, ←/→ — соседние картинки списка.
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { mediaUrl } from '@/lib/media'

export function Lightbox({ images, index, onIndex, onClose }: { images: string[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const n = images.length
  const go = (d: number) => n > 1 && onIndex((index + d + n) % n)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      } else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey, true) // capture — чтобы Esc не закрыл заодно карточку
    return () => window.removeEventListener('keydown', onKey, true)
  })
  const src = mediaUrl(images[index])
  if (!src) return null
  const name = images[index].split('/').pop()
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90" onClick={onClose} role="dialog" aria-label="Просмотр картинки">
      <img src={src} alt="" className="max-h-[94vh] max-w-[94vw] object-contain" onClick={(e) => e.stopPropagation()} />
      <button className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={onClose} aria-label="Закрыть (Esc)">
        <X className="size-5" />
      </button>
      {n > 1 && (
        <>
          <button className="absolute top-1/2 left-4 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={(e) => (e.stopPropagation(), go(-1))} aria-label="Предыдущая (←)">
            <ChevronLeft className="size-6" />
          </button>
          <button className="absolute top-1/2 right-4 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={(e) => (e.stopPropagation(), go(1))} aria-label="Следующая (→)">
            <ChevronRight className="size-6" />
          </button>
        </>
      )}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-black/60 px-2 py-1 font-mono text-xs text-white/80">
        {name}
        {n > 1 && ` · ${index + 1}/${n}`}
      </div>
    </div>,
    document.body,
  )
}
