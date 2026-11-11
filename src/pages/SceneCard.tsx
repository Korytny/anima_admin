import { useMemo, useState } from 'react'
import { Copy, Loader2, Sparkles, Trash2 } from 'lucide-react'
import type { Character, Scene, Topic } from '@/types'
import { useNavigate } from 'react-router-dom'
import { GENERATING, characterImages, characterTitle, sceneCharacters, seasonCharacters, useData } from '@/store/data'
import { pipelineConfigured } from '@/api/pipeline'
import { absPath, mediaUrl, scenePath } from '@/lib/media'
import { PathHint } from '@/components/PathHint'
import { PromptDiff } from '@/components/PromptDiff'
import { SCENE_STATUS, statusMeta, statusOptions } from '@/lib/status'
import { useDraft } from '@/lib/useDraft'
import { copyText, fmtDateTime } from '@/lib/utils'
import { PanelFooter, PanelScroll, SidePanel } from '@/components/SidePanel'
import { FieldGroups, type GroupDef } from '@/components/FieldGroups'
import { VideoPlayer } from '@/components/VideoPlayer'
import { Button, ConfirmDialog, Kbd, StatusBadge, Tabs, Thumb } from '@/components/ui'

function groups(scene: Scene, topic: Topic | undefined): GroupDef<Scene>[] {
  const status = scene.status
  return [
    {
      title: 'Сцена',
      fields: [
        { key: 'scena', type: 'number', mono: true },
        { key: 'shot_num', type: 'number', mono: true },
        { key: 'order', mono: true },
        { key: 'status', type: 'select', options: statusOptions(SCENE_STATUS, [status]).map((o) => ({ ...o, label: `${o.label} (${o.value})` })) },
      ],
    },
    {
      title: 'Кадр',
      fields: [
        { key: 'base_image_url', type: 'url', mono: true, extra: (v, set) => <PathHint expected={scenePath(scene, topic)} value={v} onChange={set} /> },
        { key: 'manual_prompt', label: 'manual_prompt — сработавший', type: 'textarea', rows: 4, mono: true },
        { key: 'visual_prompt', label: 'visual_prompt — авто', type: 'textarea', rows: 4, mono: true },
        { key: 'shot_type' },
        { key: 'char_img_url', type: 'list', rows: 3 },
        { key: 'inpaint_filename', mono: true },
      ],
    },
    {
      title: 'Диалог',
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
  return (
    <SidePanel
      open={!!scene}
      onClose={onClose}
      panelKey={scene?.scene_id}
      header={
        scene && (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 items-center rounded bg-raised px-1.5 font-mono text-xs">
                {scene.scena ?? '—'}.{scene.shot_num ?? '—'}
              </span>
              <StatusBadge meta={statusMeta(SCENE_STATUS, scene.status)} />
            </div>
            <h2 className="mt-1 truncate text-base font-semibold">{scene.speaking_character || `Сцена ${scene.scena ?? ''}`}</h2>
          </div>
        )
      }
    >
      {scene && <Body key={scene.scene_id} scene={scene} siblings={siblings} onDelete={onDelete} />}
    </SidePanel>
  )
}

function Body({ scene, siblings, onDelete }: { scene: Scene; siblings: Scene[]; onDelete: (id: string) => void }) {
  const { updateScene, updateScenes, generateSceneImages, topics, characters } = useData()
  const navigate = useNavigate()
  const seasonId = topics.find((t) => t.topic_id === scene.topic)?.season_id
  const cast = useMemo(() => sceneCharacters(scene, seasonCharacters(seasonId, characters)), [scene, characters, seasonId])
  const missing = useMemo(() => {
    const found = new Set(cast.map((c) => (c.name ?? '').trim().toLowerCase()))
    return [...new Set([...(scene.character ?? []), scene.speaking_character].filter((n): n is string => !!n?.trim()))].filter((n) => !found.has(n.trim().toLowerCase()))
  }, [cast, scene])
  const { draft, set, reset, submit, dirty, dirtyKeys, saving } = useDraft(scene, 'scene_id', (patch) => updateScene(scene.scene_id, patch))
  const [media, setMedia] = useState<Media>(scene.video_file ? 'video' : 'image')
  const [img, setImg] = useState(0)
  const [applyAll, setApplyAll] = useState(false)
  const topic = topics.find((t) => t.topic_id === scene.topic)
  const fieldGroups = useMemo(() => (draft ? groups(draft, topic) : []), [draft, topic])
  if (!draft) return null

  const images = [...(scene.char_img_url ?? []), scene.base_image_url, scene.event_img].filter((x): x is string => !!x)
  const applyKeys = [...dirtyKeys].filter((k) => !NO_BULK.has(k))
  const generating = scene.status === GENERATING

  // Несохранённые правки промпта сначала пишем в БД — n8n берёт данные оттуда
  const generate = async () => {
    if (dirty && !(await submit())) return
    setImg(0)
    setMedia('image')
    await generateSceneImages([{ ...scene, ...draft }], topics, characters)
  }
  const generateBtn = (
    <Button
      variant={dirty ? 'outline' : 'primary'}
      onClick={generate}
      disabled={generating || saving || !pipelineConfigured}
      title={pipelineConfigured ? 'Сгенерировать кадр (base_image_url) в n8n' : 'Не задан VITE_N8N_IMAGE_WEBHOOK'}
    >
      {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {generating ? 'Генерируется…' : dirty ? 'Сохранить и сгенерировать' : scene.base_image_url ? 'Перегенерировать' : 'Сгенерировать фото'}
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
            <VideoPlayer src={scene.video_file} poster={images[0]} subtitles={scene.video_sub || undefined} />
          ) : (
            <>
              <div className="relative">
                <Thumb src={images[img] ?? images[0]} className="aspect-video w-full rounded-lg object-contain" />
                {generating && (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-bg/70 text-sm text-fg-2 backdrop-blur-[1px]">
                    <Loader2 className="size-4 animate-spin" /> Генерация в n8n…
                  </div>
                )}
              </div>
              {images.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto">
                  {images.map((p, i) => (
                    <button key={p + i} onClick={() => setImg(i)} className={`shrink-0 rounded ring-2 ${i === img ? 'ring-accent' : 'ring-transparent'}`}>
                      <Thumb src={p} className="h-10 w-16" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {(cast.length > 0 || missing.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {cast.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/characters/${c.season}?character=${c.id}`)}
                  title={characterImages(c)[0] ?? 'Нет файла персонажа'}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-raised py-1 pr-2 pl-1 text-xs hover:bg-hover"
                >
                  <Thumb src={characterImages(c)[0]} className="size-6" />
                  {characterTitle(c)}
                  {!characterImages(c).length && <span className="text-danger">нет файла</span>}
                </button>
              ))}
              {missing.map((n) => (
                <span key={n} title="Нет записи в characters для этого ролика" className="flex items-center rounded-md border border-dashed border-danger/40 px-2 py-1 text-xs text-danger">
                  {n}?
                </span>
              ))}
            </div>
          )}
          <PromptBlock scene={draft} cast={cast} />
          {scene.audio_file && <audio src={mediaUrl(scene.audio_file)} controls className="h-9 w-full" />}
          {scene.dialogue_text && (
            <blockquote className="rounded-md border-l-2 border-accent bg-bg px-3 py-2 text-[13px] text-fg-2">
              «{scene.dialogue_text}»{scene.dialogue_direction && <span className="ml-1 text-fg-3">— {scene.dialogue_direction}</span>}
            </blockquote>
          )}
        </div>
        <FieldGroups groups={fieldGroups} draft={draft} onChange={set} dirtyKeys={dirtyKeys} />
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
                Применить ко всем
              </Button>
            )}
            <Button variant="ghost" onClick={reset}>
              Отмена
            </Button>
          </>
        ) : (
          <>
            {generateBtn}
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
