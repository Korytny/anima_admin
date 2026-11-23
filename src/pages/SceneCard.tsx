import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AudioLines, Clapperboard, Copy, ListTodo, Loader2, Sparkles, Trash2 } from 'lucide-react'
import { useSession } from '@/components/AuthGate'
import type { Character, Scene, Season, Topic } from '@/types'
import { useNavigate } from 'react-router-dom'
import { GENERATING, characterImages, characterTitle, sceneCharacters, seasonCharacters, useData } from '@/store/data'
import { audioConfigured, pipelineConfigured, videoConfigured } from '@/api/pipeline'
import { absPath, mediaUrl, outputPrefix, sceneCode, scenePath } from '@/lib/media'
import { listVariants, variantPrefix, videoVariantPrefix, type Variant } from '@/api/media'
import { PathHint } from '@/components/PathHint'
import { PromptDiff } from '@/components/PromptDiff'
import { SCENE_STATUS, isTalkLine, statusOptions, videoBlocker } from '@/lib/status'
import { useDraft } from '@/lib/useDraft'
import { useCardLayout } from '@/lib/useCardLayout'
import { cn, copyText, fmtDateTime } from '@/lib/utils'
import { PanelFooter, PanelScroll, SidePanel } from '@/components/SidePanel'
import { FieldGroups, type GroupDef } from '@/components/FieldGroups'
import { VideoPlayer } from '@/components/VideoPlayer'
import { Button, ConfirmDialog, Kbd, Tabs, Thumb } from '@/components/ui'
import { SceneStageBadge } from '@/components/SceneStageBadge'
import { Lightbox } from '@/components/Lightbox'

function groups(scene: Scene, topic: Topic | undefined, season: Season | undefined, blocks: { prompt: ReactNode; audio: ReactNode }): GroupDef<Scene>[] {
  const status = scene.status
  return [
    {
      // Всегда открыта; остальные поля сюда переносятся через «Остальное». Номера сцены/шота не правятся — в «Остальном»
      title: 'Общее',
      fields: [{ key: 'status', type: 'select', options: statusOptions(SCENE_STATUS, [status]).map((o) => ({ ...o, label: `${o.label} (${o.value})` })) }],
    },
    {
      title: 'Кадр',
      defaultOpen: false,
      fields: [
        { key: 'base_image_url', type: 'url', mono: true, extra: (v, set) => <PathHint expected={scenePath(scene, topic, season)} value={v} onChange={set} /> },
        { key: 'manual_prompt', label: 'manual_prompt — сработавший', type: 'textarea', rows: 4, mono: true },
        { key: 'visual_prompt', label: 'visual_prompt — авто', type: 'textarea', rows: 4, mono: true },
        { key: 'shot_type' },
        { key: 'char_img_url', type: 'list', rows: 3 },
        { key: 'inpaint_filename', mono: true },
      ],
    },
    {
      title: 'Диалог',
      defaultOpen: false,
      fields: [
        { key: 'speaking_character' },
        { key: 'dialogue_text', type: 'textarea', rows: 3 },
        { key: 'dialogue_direction' },
      ],
    },
    {
      title: 'Персонаж',
      defaultOpen: false,
      fields: [
        { key: 'character', type: 'list', rows: 2 },
        { key: 'speaking_character_voice', mono: true },
        { key: 'speaker_voice_profile', type: 'json', rows: 6 },
        { key: 'face' },
        { key: 'crop', mono: true },
      ],
    },
    {
      title: 'Действие',
      defaultOpen: false,
      fields: [
        { key: 'action', type: 'textarea', rows: 2 },
        { key: 'action_prompt', type: 'textarea', rows: 3, mono: true },
        { key: 'event_prompt', type: 'textarea', rows: 3, mono: true },
        { key: 'event_img', type: 'url', mono: true },
      ],
    },
    {
      title: 'Окружение',
      defaultOpen: false,
      before: blocks.prompt,
      fields: [
        { key: 'environment', type: 'textarea', rows: 2 },
        { key: 'location_desc' },
        { key: 'location_details', type: 'textarea', rows: 2 },
        { key: 'location_num', type: 'number', mono: true },
        { key: 'time', type: 'number', mono: true },
        { key: 'daytime' },
      ],
    },
    {
      title: 'Аудио',
      defaultOpen: false,
      before: blocks.audio,
      fields: [
        { key: 'audio_file', type: 'url', mono: true },
        { key: 'audio_duration', label: 'audio_duration, сек', type: 'number', mono: true },
        { key: 'noice' },
        { key: 'music' },
        { key: 'music_file', type: 'url', mono: true },
      ],
    },
    {
      title: 'Видео',
      defaultOpen: false,
      fields: [
        { key: 'video_file', type: 'url', mono: true },
        { key: 'video_sub', type: 'url', mono: true },
      ],
    },
    {
      title: 'Системное',
      defaultOpen: false,
      fields: [
        { key: 'scene_id', type: 'readonly' },
        { key: 'topic', type: 'readonly' },
        { key: 'created_at', type: 'readonly', render: (v) => fmtDateTime(v as string) },
        { key: 'updated_at', type: 'readonly', render: (v) => fmtDateTime(v as string) },
      ],
    },
  ]
}

// Поля, которые нельзя массово копировать во все сцены
const NO_BULK = new Set(['scena', 'shot_num', 'order', 'scene_id', 'topic', 'dialogue_text', 'speaking_character', 'char_img_url', 'audio_file', 'video_file', 'base_image_url', 'manual_prompt', 'visual_prompt'])

type Media = 'image' | 'video'

export function SceneCard({ scene, siblings, onClose, onDelete }: { scene: Scene | null; siblings: Scene[]; onClose: () => void; onDelete: (id: string) => void }) {
  const { topics } = useData()
  return (
    <SidePanel
      open={!!scene}
      onClose={onClose}
      panelKey={scene?.scene_id}
      header={
        scene && (
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-5 shrink-0 items-center rounded bg-raised px-1.5 font-mono text-xs">
              {scene.scena ?? '—'}.{scene.shot_num ?? '—'}
            </span>
            <h2 className="min-w-0 truncate text-base font-semibold">{scene.speaking_character || `Сцена ${scene.scena ?? ''}`}</h2>
            <span className="shrink-0">
              <SceneStageBadge scene={scene} topic={topics.find((t) => t.topic_id === scene.topic)} />
            </span>
          </div>
        )
      }
    >
      {scene && <Body key={scene.scene_id} scene={scene} siblings={siblings} onDelete={onDelete} />}
    </SidePanel>
  )
}

function Body({ scene, siblings, onDelete }: { scene: Scene; siblings: Scene[]; onDelete: (id: string) => void }) {
  const { updateScene, updateScenes, generateSceneImages, isQueued, topics, characters, seasons, team, tasks, createTask } = useData()
  const me = useSession()?.user.id
  const navigate = useNavigate()
  const seasonId = topics.find((t) => t.topic_id === scene.topic)?.season_id
  const cast = useMemo(() => sceneCharacters(scene, seasonCharacters(seasonId, characters)), [scene, characters, seasonId])
  const missing = useMemo(() => {
    const found = new Set(cast.map((c) => (c.name ?? '').trim().toLowerCase()))
    return [...new Set([...(scene.character ?? []), scene.speaking_character].filter((n): n is string => !!n?.trim()))].filter((n) => !found.has(n.trim().toLowerCase()))
  }, [cast, scene])
  const { draft, set, reset, submit, dirty, dirtyKeys, saving } = useDraft(scene, 'scene_id', (patch) => updateScene(scene.scene_id, patch))
  const [media, setMedia] = useState<Media>(scene.video_file ? 'video' : 'image')
  const [img, setImg] = useState<number | null>(null) // null — кадр сцены (или пусто, если кадра нет)
  const [applyAll, setApplyAll] = useState(false)
  const topic = topics.find((t) => t.topic_id === scene.topic)
  const season = seasons.find((x) => x.id === topic?.season_id)
  const blocks = {
    prompt: draft ? <PromptBlock scene={draft} cast={cast} /> : null,
    audio:
      scene.dialogue_text || scene.audio_file ? (
        <div className="space-y-2">
          {scene.dialogue_text && (
            <blockquote className="rounded-md border-l-2 border-accent bg-bg px-3 py-2 text-[13px] text-fg-2">
              «{scene.dialogue_text}»{scene.dialogue_direction && <span className="ml-1 text-fg-3">— {scene.dialogue_direction}</span>}
            </blockquote>
          )}
          {scene.audio_file && (
            <div className="flex items-center gap-2">
              <audio src={mediaUrl(scene.audio_file)} controls className="h-9 min-w-0 flex-1" />
              {scene.audio_duration != null && <span className="shrink-0 font-mono text-xs text-fg-3">{scene.audio_duration} с</span>}
            </div>
          )}
        </div>
      ) : null,
  }
  const codeGroups = useMemo(() => (draft ? groups(draft, topic, season, blocks) : []), [draft, topic, season, cast, scene.audio_file, scene.audio_duration, scene.dialogue_text, scene.dialogue_direction]) // eslint-disable-line react-hooks/exhaustive-deps
  const layout = useCardLayout('card:scene', codeGroups, draft)
  // Варианты кадра на диске (каждая перегенерация — новый файл рядом); основной — тот, что в base_image_url
  const [variants, setVariants] = useState<Variant[]>([])
  const [variant, setVariant] = useState<string | null>(null) // выбранный для просмотра; null — показываем основной
  const [zoom, setZoom] = useState<number | null>(null) // индекс в списке zoomList — открыт просмотр во весь экран
  const prefix = scene.base_image_url ? variantPrefix(scene.base_image_url) : outputPrefix(scene, topic, season)
  useEffect(() => {
    let alive = true
    void listVariants(prefix).then((v) => alive && setVariants(v))
    return () => {
      alive = false
    }
  }, [prefix, scene.base_image_url, scene.updated_at])
  // Варианты видео (каждая перегенерация — новый mp4 рядом); основной — тот, что в video_file
  const [videos, setVideos] = useState<Variant[]>([])
  const [video, setVideo] = useState<string | null>(null) // выбранный для просмотра; null — основной
  const videoPrefix = scene.video_file ? videoVariantPrefix(scene.video_file) : outputPrefix(scene, topic, season)
  useEffect(() => {
    let alive = true
    void listVariants(videoPrefix, 'video').then((v) => alive && setVideos(v))
    return () => {
      alive = false
    }
  }, [videoPrefix, scene.video_file, scene.updated_at])
  if (!draft) return null

  // Сначала кадр сцены, потом референсы персонажей. Нет кадра — большое окно пустое, пока не выбран референс
  const frames = [scene.base_image_url, scene.event_img].filter((x): x is string => !!x)
  const images = [...frames, ...(scene.char_img_url ?? []).filter(Boolean)]
  const mainSrc = variant ?? (img != null ? images[img] : frames[0])
  // Во весь экран листаются: кадр, варианты кадра, референсы — без повторов
  const zoomList = [...new Set([...frames, ...variants.map((v) => v.path), ...images.slice(frames.length)])]
  const isMain = (p: string) => !!scene.base_image_url && variantPrefix(p) === variantPrefix(scene.base_image_url) && p.split('/').pop() === scene.base_image_url.split('/').pop()
  const applyKeys = [...dirtyKeys].filter((k) => !NO_BULK.has(k))
  const generating = scene.status === GENERATING
  const queued = isQueued(scene.scene_id)
  const openTasks = tasks.filter((t) => t.scene_id === scene.scene_id && t.status !== 'done').length

  // Несохранённые правки промпта сначала пишем в БД — n8n берёт данные оттуда
  const generate = async () => {
    if (dirty && !(await submit())) return
    setImg(null)
    setVariant(null)
    setMedia('image')
    generateSceneImages([{ ...scene, ...draft }])
  }
  const generateBtn = (
    <Button
      variant={dirty ? 'outline' : 'primary'}
      onClick={generate}
      disabled={generating || queued || saving || !pipelineConfigured}
      title={
        !pipelineConfigured
          ? 'Не задан VITE_N8N_IMAGE_WEBHOOK'
          : `${dirty ? 'Сохранить правки и сгенерировать' : scene.base_image_url ? 'Перегенерировать' : 'Сгенерировать'} кадр (очередь кадров; пуста — сразу в n8n)`
      }
    >
      {generating || queued ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {generating ? 'Фото…' : queued ? 'В очереди' : 'Фото'}
    </Button>
  )

  return (
    <>
      <PanelScroll>
        <div className="space-y-2 p-4">
          {scene.video_file && (
            <Tabs<Media>
              className="mb-2 border-0 px-0"
              value={media}
              onChange={setMedia}
              tabs={[
                { value: 'image', label: 'Кадры' },
                { value: 'video', label: 'Видео' },
              ]}
            />
          )}
          {media === 'video' && scene.video_file ? (
            <>
              <VideoPlayer key={video ?? scene.video_file} src={video ?? scene.video_file} poster={frames[0]} subtitles={scene.video_sub || undefined} />
              {videos.length > 1 && (
                <div>
                  <div className="mb-1 flex items-center gap-2 text-[11px] text-fg-3">
                    Варианты видео · {videos.length}
                    {video && video !== scene.video_file && (
                      <Button
                        variant="primary"
                        size="sm"
                        className="ml-auto"
                        onClick={async () => {
                          const s = await updateScene(scene.scene_id, { video_file: video })
                          if (s) setVideo(null)
                        }}
                      >
                        Сделать основным
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {videos.map((v) => {
                      const main = v.path === scene.video_file
                      const shown = (video ?? scene.video_file) === v.path
                      return (
                        <button
                          key={v.path}
                          onClick={() => setVideo(main ? null : v.path)}
                          title={`${v.path.split('/').pop()} · ${fmtDateTime(new Date(v.mtime).toISOString())}${main ? ' — основной' : ''}`}
                          className={cn('relative shrink-0 overflow-hidden rounded ring-2', shown ? 'ring-accent' : 'ring-transparent')}
                        >
                          <video src={mediaUrl(v.path)} muted preload="metadata" className="pointer-events-none h-16 w-12 bg-raised object-cover" />
                          {main && <span className="absolute right-0 bottom-0 left-0 bg-success/80 text-center text-[9px] leading-tight text-bg">основной</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="relative">
                <button className="block w-full cursor-zoom-in" disabled={!mainSrc} title="Открыть во весь экран" onClick={() => mainSrc && setZoom(Math.max(0, zoomList.indexOf(mainSrc)))}>
                  <Thumb src={mainSrc} className="aspect-video w-full rounded-lg object-contain" />
                </button>
                {zoom != null && zoomList.length > 0 && <Lightbox images={zoomList} index={Math.min(zoom, zoomList.length - 1)} onIndex={setZoom} onClose={() => setZoom(null)} />}
                {!mainSrc && !generating && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-fg-3">Кадра ещё нет</div>
                )}
                {generating && (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-bg/70 text-sm text-fg-2 backdrop-blur-[1px]">
                    <Loader2 className="size-4 animate-spin" /> Генерация в n8n…
                  </div>
                )}
              </div>
              {(variants.length > 1 || scene.event_img || cast.length > 0 || missing.length > 0) && (
                <div>
                  {variants.length > 1 && (
                    <div className="mb-1 flex h-6 items-center gap-2 text-[11px] text-fg-3">
                      Варианты кадра · {variants.length}
                      {variant && !isMain(variant) && (
                        <Button
                          variant="primary"
                          size="sm"
                          className="ml-auto"
                          onClick={async () => {
                            const s = await updateScene(scene.scene_id, { base_image_url: variant })
                            if (s) setVariant(null)
                          }}
                        >
                          Сделать основным
                        </Button>
                      )}
                    </div>
                  )}
                  {/* Одна лента: варианты кадра (и второй кадр события) | герои шота */}
                  <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
                    {variants.length > 1 &&
                      variants.map((v) => {
                        const main = isMain(v.path)
                        const shown = img == null && (variant ? variant === v.path : main)
                        return (
                          <button
                            key={v.path}
                            onClick={() => {
                              setImg(null)
                              setVariant(main ? null : v.path)
                            }}
                            title={`${v.path.split('/').pop()}${main ? ' — основной' : ''}`}
                            className={cn('relative shrink-0 rounded ring-2', shown ? 'ring-accent' : 'ring-transparent')}
                          >
                            <Thumb src={v.path} className="h-16 w-9" />
                            {main && <span className="absolute right-0 bottom-0 left-0 rounded-b bg-success/80 text-center text-[9px] leading-tight text-bg">основной</span>}
                          </button>
                        )
                      })}
                    {scene.event_img && (
                      <button
                        onClick={() => {
                          setImg(frames.indexOf(scene.event_img!))
                          setVariant(null)
                        }}
                        title="Кадр события (event_img)"
                        className={cn('shrink-0 rounded ring-2', img === frames.indexOf(scene.event_img) ? 'ring-accent' : 'ring-transparent')}
                      >
                        <Thumb src={scene.event_img} className="h-16 w-9" />
                      </button>
                    )}
                    {(variants.length > 1 || scene.event_img) && (cast.length > 0 || missing.length > 0) && <span className="mx-1 w-px shrink-0 bg-border" />}
                    {cast.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => navigate(`/characters/${c.season}?character=${c.id}`)}
                        title={`${characterTitle(c)} — открыть карточку персонажа${characterImages(c).length ? '' : ' (нет файла)'}`}
                        className="relative shrink-0 overflow-hidden rounded ring-1 ring-border hover:ring-accent"
                      >
                        <Thumb src={characterImages(c)[0]} className="h-16 w-12" />
                        <span className={cn('absolute right-0 bottom-0 left-0 truncate bg-bg/80 px-0.5 text-center text-[9px] leading-tight', characterImages(c).length ? 'text-fg-2' : 'text-danger')}>
                          {characterTitle(c)}
                        </span>
                      </button>
                    ))}
                    {missing.map((n) => (
                      <span
                        key={n}
                        title="Нет записи в characters для этого сезона"
                        className="flex h-16 w-12 shrink-0 items-center justify-center rounded border border-dashed border-danger/40 px-0.5 text-center text-[9px] text-danger"
                      >
                        {n}?
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <FieldGroups groups={layout.groups} draft={draft} onChange={set} dirtyKeys={dirtyKeys} fieldAction={layout.fieldAction} />
        {layout.customized && (
          <div className="border-t border-border px-4 py-2 text-right">
            <button className="text-xs text-fg-3 hover:text-accent-hover" onClick={layout.reset}>
              Вернуть раскладку полей по умолчанию
            </button>
          </div>
        )}
      </PanelScroll>

      <PanelFooter>
        {dirty ? (
          <>
            <Button variant="primary" onClick={submit} disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'} <Kbd>⌘S</Kbd>
            </Button>
            {generateBtn}
            {applyKeys.length > 0 && siblings.length > 1 && (
              <Button onClick={() => setApplyAll(true)} title="Записать изменённые поля во все сцены ролика">
                Ко всем
              </Button>
            )}
            <Button variant="ghost" onClick={reset}>
              Отмена
            </Button>
          </>
        ) : (
          <>
            {generateBtn}
            <VideoButton scene={scene} disabled={generating} />
            <AudioButton scene={scene} />
            <Button
              variant="ghost"
              className="px-2"
              aria-label="Задача по шоту"
              title={`Создать задачу по этому шоту${team.length > 1 ? ' и назначить другому участнику' : ''}${openTasks ? ` · открытых: ${openTasks}` : ''}`}
              onClick={async () => {
                const other = team.find((m) => m.user_id !== me)?.user_id ?? me ?? null
                const t = await createTask({ title: `Шот ${sceneCode(scene)}: выбрать лучший кадр`, scene_id: scene.scene_id, topic_id: scene.topic, assignee: other })
                if (t) navigate(`/tasks?who=all&task=${t.id}`)
              }}
            >
              <ListTodo />
              {openTasks > 0 && <span className="rounded-full bg-accent/20 px-1.5 text-[10px] text-accent-hover">{openTasks}</span>}
            </Button>
            <Button variant="ghost" size="icon" title="Скопировать ссылку" aria-label="Скопировать ссылку" onClick={() => copyText(location.href)}>
              <Copy />
            </Button>
            <Button variant="ghost" size="icon" className="ml-auto hover:text-danger" title="Удалить" aria-label="Удалить" onClick={() => onDelete(scene.scene_id)}>
              <Trash2 />
            </Button>
          </>
        )}
      </PanelFooter>

      <ConfirmDialog
        open={applyAll}
        onOpenChange={setApplyAll}
        title={`Применить ко всем сценам ролика (${siblings.length})?`}
        description={
          <>
            Будут перезаписаны поля: <span className="font-mono text-xs text-fg">{applyKeys.join(', ')}</span>
          </>
        }
        confirmLabel="Применить"
        onConfirm={async () => {
          const patch = Object.fromEntries(applyKeys.map((k) => [k, draft[k as keyof Scene]])) as Partial<Scene>
          await updateScenes(
            siblings.map((s) => s.scene_id),
            patch,
          )
          reset()
        }}
      />
    </>
  )
}

/** Озвучка шота в n8n: текст шота (рассказчик или реплика) голосом говорящего → audio_file, audio_duration. */
function AudioButton({ scene }: { scene: Scene }) {
  const { runJobs, isRunning } = useData()
  const running = isRunning('audio', scene.scene_id)
  const noText = !scene.dialogue_text?.trim()
  const talk = isTalkLine(scene)
  return (
    <Button
      variant="outline"
      disabled={running || noText || !audioConfigured}
      title={
        !audioConfigured
          ? 'Не задан VITE_N8N_AUDIO_WEBHOOK'
          : noText
            ? 'У шота нет текста (dialogue_text) — озвучивать нечего'
            : `${scene.audio_file ? 'Переозвучить' : 'Озвучить'}: ${scene.speaking_character ?? 'говорящий'} — Google TTS, голос из карточки персонажа` +
              (talk ? '. Реплика: с озвучкой видео подстроит губы под неё (озвучить до видео); без озвучки голос сделает само видео' : '')
      }
      onClick={() => void runJobs('audio', [scene.scene_id])}
    >
      {running ? <Loader2 className="animate-spin" /> : <AudioLines />}
      {running ? 'Озвучка…' : 'Озвучить'}
    </Button>
  )
}

/** Видео шота в n8n: кадр раскадровки → видео со звуком. У #talk: есть озвучка — губы под неё, нет — голос делает видео. */
function VideoButton({ scene, disabled }: { scene: Scene; disabled?: boolean }) {
  const { runJobs, isRunning } = useData()
  const running = isRunning('video', scene.scene_id)
  const blocker = videoBlocker(scene)
  return (
    <Button
      variant="outline"
      disabled={disabled || running || !!blocker || !videoConfigured}
      title={
        !videoConfigured
          ? 'Не задан VITE_N8N_VIDEO_WEBHOOK'
          : blocker
            ? blocker
            : `${scene.video_file ? 'Перегенерировать' : 'Сделать'} видео: кадр → видео со звуком (n8n, сервер Таиланд, ~4–5 мин)`
      }
      onClick={() => void runJobs('video', [scene.scene_id])}
    >
      {running ? <Loader2 className="animate-spin" /> : <Clapperboard />}
      {running ? 'Видео…' : 'Видео'}
    </Button>
  )
}

/** Промпты кадра: что поменял человек (auto → manual) + копирование для ComfyUI. */
function PromptBlock({ scene, cast }: { scene: Scene; cast: Character[] }) {
  const auto = scene.visual_prompt?.trim() ?? ''
  const manual = scene.manual_prompt?.trim() ?? ''
  if (!auto && !manual) return null
  const refs = cast.flatMap((c) => characterImages(c).slice(0, 1).map((p) => `${characterTitle(c)}: ${absPath(p)}`))
  const forComfy = [manual || auto, refs.length ? `\nРеференсы:\n${refs.join('\n')}` : ''].join('')
  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium text-fg-2">Промпт</span>
        <span className="text-fg-3">{manual && auto ? 'авто → ручной' : manual ? 'ручной' : 'авто (ручного ещё нет)'}</span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => copyText(forComfy)} title="Промпт (ручной, иначе авто) + пути к картинкам персонажей">
          <Copy /> Для ComfyUI
        </Button>
      </div>
      {manual && auto && manual !== auto ? (
        <PromptDiff from={auto} to={manual} />
      ) : (
        <div className="rounded-md border border-border bg-bg p-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg-2">{manual || auto}</div>
      )}
    </div>
  )
}
