import { Fragment, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, FileText, MapPin, ScrollText } from 'lucide-react'
import type { Scene } from '@/types'
import { seasonCharacters, useData, useScenesByTopic } from '@/store/data'
import { parseScript, type ScriptScene } from '@/lib/script'
import { cn, storageGet } from '@/lib/utils'
import { LAST_TOPIC_KEY, TopicSelect } from '@/components/TopicSelect'
import { PanelFooter, PanelScroll, SidePanel } from '@/components/SidePanel'
import { Badge, Button, EmptyState, Kbd, Textarea } from '@/components/ui'

export function ScriptPage() {
  const { topicId } = useParams()
  if (!topicId) {
    const last = storageGet<string | null>(LAST_TOPIC_KEY, null)
    if (last) return <Navigate to={`/script/${last}`} replace />
    return <EmptyState icon={<ScrollText />} title="Выберите ролик" action={<TopicSelect value="" base="/script" className="w-72" />} />
  }
  return <TopicScript key={topicId} topicId={topicId} />
}

const norm = (s: string) => s.trim().toLowerCase()

/** Блоки агента перед ===STORY===. */
const NOTE_LABELS: Record<string, string> = { CONFLICT: 'Конфликт', PARADOX: 'Парадокс', TWIST: 'Твист', TRANSFORMATION: 'Трансформация', ANCHOR: 'Якорь' }

function TopicScript({ topicId }: { topicId: string }) {
  const navigate = useNavigate()
  const { topics, characters, loading, updateTopic } = useData()
  const dbScenes = useScenesByTopic().get(topicId) ?? []
  const topic = topics.find((t) => t.topic_id === topicId)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null) // правка исходника; null — не редактируем
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    localStorage.setItem(LAST_TOPIC_KEY, JSON.stringify(topicId))
  }, [topicId])

  const source = draft ?? topic?.script_scenas ?? ''
  const parsed = useMemo(() => parseScript(source), [source])
  const known = useMemo(() => new Set(seasonCharacters(topic?.season_id, characters).map((c) => norm(c.name ?? ''))), [characters, topic?.season_id])

  // шоты в БД по номеру сцены
  const shotsByNum = useMemo(() => {
    const m = new Map<number, Scene[]>()
    for (const s of dbScenes) if (s.scena != null) m.set(s.scena, [...(m.get(s.scena) ?? []), s])
    return m
  }, [dbScenes])
  const covered = parsed.scenes.filter((s) => s.num != null && shotsByNum.has(s.num)).length
  const dirty = draft != null && draft !== (topic?.script_scenas ?? '')

  const save = async () => {
    if (!dirty) return
    setSaving(true)
    const t = await updateTopic(topicId, { script_scenas: draft || null })
    setSaving(false)
    if (t) setDraft(null)
  }

  if (!loading && !topic) return <EmptyState icon={<ScrollText />} title="Ролик не найден" description={topicId} />

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
          <TopicSelect value={topicId} base="/script" className="w-64" />
          <div className="flex items-center gap-4 text-xs text-fg-3">
            <span>
              Локаций <b className="text-fg">{parsed.locations.length}</b>
            </span>
            <span>
              Сцен <b className="text-fg">{parsed.scenes.length}</b>
            </span>
            <span title="Сцены сценария, для которых в таблице scenes есть шоты">
              Разбито на шоты <b className="text-fg">{covered}</b>/{parsed.scenes.length}
            </span>
            {parsed.warnings.length > 0 && (
              <span className="flex items-center gap-1 text-gold" title={parsed.warnings.join('\n')}>
                <AlertTriangle className="size-3.5" /> Не разобрано строк: {parsed.warnings.length}
              </span>
            )}
          </div>
          <Button className="ml-auto" variant={sourceOpen ? 'secondary' : 'outline'} onClick={() => setSourceOpen((v) => !v)}>
            <FileText /> Исходник{dirty && ' •'}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {parsed.notes.length > 0 && (
            <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-2 xl:grid-cols-3">
              {parsed.notes.map((n, i) => (
                <div key={i} className="rounded-lg border border-border bg-surface p-3">
                  <div className="mb-1 text-[11px] font-semibold tracking-wide text-accent-hover uppercase">{NOTE_LABELS[n.tag] ?? n.tag}</div>
                  <p className="text-[13px] leading-relaxed whitespace-pre-line text-fg-2">{n.text}</p>
                </div>
              ))}
            </div>
          )}
          {!parsed.scenes.length ? (
            <EmptyState
              icon={<ScrollText />}
              title={source.trim() ? 'Не удалось разобрать сценарий' : 'Сценария пока нет'}
              description={source.trim() ? 'Ожидается формат «=== ЛОКАЦИЯ: … ===», «@Scene: N — …», «Описание: …». Откройте исходник.' : 'Поле script_scenas у ролика пустое.'}
            />
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-surface text-left text-xs text-fg-3">
                <tr className="border-b border-border">
                  <th className="w-14 px-3 py-2 font-medium">№</th>
                  <th className="w-36 px-3 py-2 font-medium">Бит</th>
                  <th className="w-48 px-3 py-2 font-medium">Персонажи</th>
                  <th className="px-3 py-2 font-medium">Описание</th>
                  <th className="w-28 px-3 py-2 font-medium">В БД</th>
                </tr>
              </thead>
              <tbody>
                {parsed.scenes.map((s, i) => (
                  <Fragment key={i}>
                    {s.location !== parsed.scenes[i - 1]?.location && (
                      <tr className="border-b border-border bg-raised">
                        <td colSpan={5} className="px-3 py-1.5 text-xs font-semibold text-fg-2">
                          <MapPin className="mr-1.5 inline size-3.5 text-accent" />
                          {s.location ?? 'Без локации'}
                        </td>
                      </tr>
                    )}
                    <Row scene={s} known={known} shots={s.num != null ? shotsByNum.get(s.num) : undefined} onOpenShots={(id) => navigate(`/scenes/${topicId}?scene=${id}`)} />
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <SidePanel open={sourceOpen} onClose={() => setSourceOpen(false)} panelKey="source" header={<h2 className="text-base font-semibold">script_scenas</h2>}>
        <PanelScroll>
          <div className="p-4">
            <Textarea
              value={source}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                  e.preventDefault()
                  void save()
                }
              }}
              rows={30}
              className="font-mono text-xs leading-relaxed"
            />
            <p className="mt-2 text-[11px] text-fg-3">Таблица слева обновляется на лету — удобно проверять разметку.</p>
          </div>
        </PanelScroll>
        {dirty && (
          <PanelFooter>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'} <Kbd>⌘S</Kbd>
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Отмена
            </Button>
          </PanelFooter>
        )}
      </SidePanel>
    </div>
  )
}

function Row({ scene, known, shots, onOpenShots }: { scene: ScriptScene; known: Set<string>; shots?: Scene[]; onOpenShots: (sceneId: string) => void }) {
  const frames = shots?.filter((s) => s.base_image_url).length ?? 0
  return (
    <tr className="border-b border-border align-top hover:bg-hover/40">
      <td className="px-3 py-2.5 font-mono text-fg-2">{scene.num ?? '—'}</td>
      <td className="px-3 py-2.5">{scene.beat ? <Badge>{scene.beat}</Badge> : <span className="text-fg-3">—</span>}</td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          {scene.characters.map((c) => (
            <span
              key={c}
              title={known.has(norm(c)) ? undefined : 'Нет в библиотеке персонажей сезона'}
              className={cn('rounded px-1.5 py-0.5 text-xs', known.has(norm(c)) ? 'bg-raised text-fg' : 'border border-dashed border-border text-fg-3')}
            >
              {c}
            </span>
          ))}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <Description text={scene.description} />
        {Object.entries(scene.extra).map(([k, v]) => (
          <div key={k} className="mt-1 text-xs text-fg-3">
            <span className="font-mono">@{k}:</span> {v}
          </div>
        ))}
      </td>
      <td className="px-3 py-2.5 text-xs">
        {shots?.length ? (
          <button className="text-left hover:text-accent" onClick={() => onOpenShots(shots[0].scene_id)}>
            <div className="text-success">{shots.length} шот.</div>
            <div className="text-fg-3">
              кадров {frames}/{shots.length}
            </div>
          </button>
        ) : (
          <span className="text-fg-3">нет</span>
        )}
      </td>
    </tr>
  )
}

/** Описание с выделенными репликами «X говорит: «…»» и пометками [реплика: …]. */
function Description({ text }: { text: string }) {
  const parts = text.split(/([А-ЯЁA-Z][^.!?«»:]*?\s+говорит\s*:\s*«[^»]*»|\[реплика:[^\]]*\])/gi)
  return (
    <p className="leading-relaxed whitespace-pre-line text-fg-2">
      {parts.map((p, i) => {
        const cue = p.match(/^\[реплика:\s*([^\]]*)\]$/i)
        if (cue)
          return (
            <span key={i} className="mx-0.5 inline rounded border border-dashed border-accent/50 px-1 py-0.5 text-xs text-fg-2" title="Пометка для агента «Диалоги»">
              💬 {cue[1]}
            </span>
          )
        const m = p.match(/^(.*?)\s+говорит\s*:\s*«([^»]*)»$/)
        if (!m) return <Fragment key={i}>{p}</Fragment>
        return (
          <span key={i} className="mx-0.5 inline rounded bg-accent/10 px-1 py-0.5">
            <b className="font-medium text-fg">{m[1]}:</b> <span className="text-fg">«{m[2]}»</span>
          </span>
        )
      })}
    </p>
  )
}
