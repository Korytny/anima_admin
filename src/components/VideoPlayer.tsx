import { useEffect, useRef, useState } from 'react'
import { Captions, Maximize, Pause, Play, StepBack, StepForward, Volume2, VolumeX } from 'lucide-react'
import { cn, fmtDuration } from '@/lib/utils'
import { mediaUrl } from '@/lib/media'

const SPEEDS = [0.5, 1, 1.5, 2]
const FRAME = 1 / 25

/** Кастомный плеер. Горячие клавиши (когда плеер в фокусе): пробел, ←/→, , и . — покадрово. */
export function VideoPlayer({ src, poster, subtitles, className }: { src: string; poster?: string; subtitles?: string; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [subs, setSubs] = useState(true)

  useEffect(() => {
    setPlaying(false)
    setTime(0)
  }, [src])

  useEffect(() => {
    const v = video.current
    if (v?.textTracks[0]) v.textTracks[0].mode = subs ? 'showing' : 'hidden'
  }, [subs, subtitles])

  const v = () => video.current!
  const toggle = () => (v().paused ? v().play() : v().pause())
  const seek = (dt: number) => (v().currentTime = Math.max(0, Math.min(duration, v().currentTime + dt)))

  return (
    <div
      ref={wrap}
      tabIndex={0}
      onKeyDown={(e) => {
        const map: Record<string, () => void> = {
          ' ': toggle,
          ArrowLeft: () => seek(-5),
          ArrowRight: () => seek(5),
          ',': () => (v().pause(), seek(-FRAME)),
          '.': () => (v().pause(), seek(FRAME)),
        }
        if (map[e.key]) {
          e.preventDefault()
          e.stopPropagation()
          map[e.key]()
        }
      }}
      className={cn('group relative overflow-hidden rounded-lg border border-border bg-black', className)}
    >
      <video
        ref={video}
        src={mediaUrl(src)}
        poster={mediaUrl(poster)}
        className="aspect-video w-full cursor-pointer object-contain"
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        preload="metadata"
      >
        {subtitles && <track kind="subtitles" src={mediaUrl(subtitles)} default />}
      </video>

      {!playing && (
        <button onClick={toggle} aria-label="Воспроизвести" className="absolute inset-0 m-auto flex size-12 items-center justify-center rounded-full bg-accent/90 text-white shadow-lg">
          <Play className="ml-0.5 size-5 fill-current" />
        </button>
      )}

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/90 to-transparent px-2.5 pt-6 pb-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={time}
          onChange={(e) => (v().currentTime = Number(e.target.value))}
          className="h-1 w-full cursor-pointer accent-accent"
          aria-label="Позиция"
        />
        <div className="flex items-center gap-1 text-white [&_button]:flex [&_button]:size-7 [&_button]:items-center [&_button]:justify-center [&_button]:rounded [&_button:hover]:bg-white/10 [&_svg]:size-4">
          <button onClick={toggle} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>
            {playing ? <Pause /> : <Play />}
          </button>
          <button onClick={() => (v().pause(), seek(-FRAME))} aria-label="Кадр назад" title="Кадр назад (,)">
            <StepBack />
          </button>
          <button onClick={() => (v().pause(), seek(FRAME))} aria-label="Кадр вперёд" title="Кадр вперёд (.)">
            <StepForward />
          </button>
          <button
            onClick={() => {
              v().muted = !muted
              setMuted(!muted)
            }}
            aria-label={muted ? 'Включить звук' : 'Выключить звук'}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </button>
          <span className="ml-1 font-mono text-[11px] text-white/80">
            {fmtDuration(time)} / {fmtDuration(duration)}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              className="!w-auto px-1.5 font-mono text-[11px]"
              onClick={() => {
                const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
                v().playbackRate = next
                setSpeed(next)
              }}
              title="Скорость"
            >
              {speed}x
            </button>
            {subtitles && (
              <button onClick={() => setSubs((s) => !s)} aria-label="Субтитры" className={cn(subs && 'text-accent-hover')}>
                <Captions />
              </button>
            )}
            <button onClick={() => wrap.current?.requestFullscreen()} aria-label="Во весь экран">
              <Maximize />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
