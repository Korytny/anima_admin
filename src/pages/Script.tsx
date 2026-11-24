import { Fragment, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ChevronDown, Clapperboard, FileText, MapPin, ScrollText } from 'lucide-react'
import type { Scene } from '@/types'
import { seasonCharacters, useData, useScenesByTopic } from '@/store/data'
import { NARRATOR, checkScript, parseScript, type ParsedScript, type ScriptScene } from '@/lib/script'
import { checkShots, parseShots, type ParsedShots } from '@/lib/shots'
import { cn, ranges } from '@/lib/utils'
import { LAST_TOPIC_KEY, TopicSelect, useLastTopic } from '@/components/TopicSelect'
import { PanelFooter, PanelScroll, SidePanel } from '@/components/SidePanel'
import { Badge, Button, EmptyState, Kbd, Textarea } from '@/components/ui'

export function ScriptPage() {
  const { topicId } = useParams()
  const last = useLastTopic()
  if (!topicId) {
    if (last) return <Navigate to={`/script/${last}`} replace />
    return <EmptyState icon={<ScrollText />} title="Выберите ролик" action={<TopicSelect value="" base="/script" className="w-72" />} />
  }
  return <TopicScript key={topicId} topicId={topicId} />
}

const norm = (s: string) => s.trim().toLowerCase()

/** Блоки агента перед ===STORY===. */
const NOTE_LABELS: Record<string, string> = { CONFLICT: 'Конфликт', PARADOX: 'Парадокс', TWIST: 'Твист', TRANSFORMATION: 'Трансформация', ANCHOR: 'Якорь' }

type View = 'script' | 'shots'

function TopicScript({ topicId }: { topicId: string }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const view: View = params.get('view') === 'shots' ? 'shots' : 'script'
  const field = view === 'shots' ? 'script_shots' : 'script_scenas'
  const { topics, characters, loading, updateTopic } = useData()
  const dbScenes = useScenesByTopic().get(topicId) ?? []
  const topic = topics.find((t) => t.topic_id === topicId)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null) // правка исходника; null — не редактируем
  const [saving, setSaving] = useState(false)
  const [issuesOpen, setIssuesOpen] = useState(true)

  useEffect(() => {
    localStorage.setItem(LAST_TOPIC_KEY, JSON.stringify(topicId))
  }, [topicId])

  const saved = topic?.[field] ?? ''
  const source = draft ?? saved
  const scriptSrc = view === 'script' ? source : (topic?.script_scenas ?? '')
  const parsed = useMemo(() => parseScript(scriptSrc), [scriptSrc])
  const shots = useMemo(() => (view === 'shots' ? parseShots(source) : null), [view, source])
  const seasonChars = useMemo(() => seasonCharacters(topic?.season_id, characters), [characters, topic?.season_id])
  const known = useMemo(() => new Set(seasonChars.map((c) => norm(c.name ?? ''))), [seasonChars])
  const check = useMemo(() => checkScript(parsed, { beats: topic?.beats, known: known.size ? known : undefined }), [parsed, topic?.beats, known])
  const shotCheck = useMemo(
    () => (shots ? checkShots(shots, { script: parsed, tags: seasonChars.map((c) => c.name ?? '').filter(Boolean) }) : null),
    [shots, parsed, seasonChars],
  )
  const issues: { where: string; text: string }[] = shotCheck
    ? shotCheck.issues.map((i) => ({ where: i.shots.length ? `шот ${ranges(i.shots)}` : '', text: i.text }))
    : check.issues.map((i) => ({ where: i.scenes.length ? `сц. ${ranges(i.scenes)}` : '', text: i.text }))
  const issueScenes = useMemo(() => {
    const m = new Map<number, string[]>()
    for (const i of check.issues) for (const n of i.scenes) m.set(n, [...(m.get(n) ?? []), i.text])
    return m
  }, [check])
  const issueShots = useMemo(() => {
    const m = new Map<number, string[]>()
    for (const i of shotCheck?.issues ?? []) for (const n of i.shots) m.set(n, [...(m.get(n) ?? []), i.text])
    return m
  }, [shotCheck])

  // шоты в БД по номеру сцены
  const shotsByNum = useMemo(() => {
    const m = new Map<number, Scene[]>()
    for (const s of dbScenes) if (s.scena != null) m.set(s.scena, [...(m.get(s.scena) ?? []), s])
    return m
  }, [dbScenes])
  const covered = parsed.scenes.filter((s) => s.num != null && shotsByNum.has(s.num)).length
  const dirty = draft != null && draft !== saved

  const setView = (v: View) => {
    if (v === view) return
    if (dirty && !confirm('Исходник изменён и не сохранён. Переключиться без сохранения?')) return
    setDraft(null)
    setParams(v === 'shots' ? { view: 'shots' } : {}, { replace: true })
  }

  const save = async () => {
    if (!dirty) return
    setSaving(true)
    const t = await updateTopic(topicId, { [field]: draft || null })
    setSaving(false)
    if (t) setDraft(null)
  }

  if (!loading && !topic) return <EmptyState icon={<ScrollText />} title="Ролик не найден" description={topicId} />

  const warnings = shots ? shots.warnings : parsed.warnings
  const hasContent = shots ? shots.shots.length > 0 : parsed.scenes.length > 0

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
          <TopicSelect value={topicId} base="/script" className="w-64" />
          <div className="flex rounded-md border border-border p-0.5 text-xs">
            {(['script', 'shots'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn('rounded px-2.5 py-1', view === v ? 'bg-raised font-medium text-fg' : 'text-fg-3 hover:text-fg')}
              >
                {v === 'script' ? 'Сценарий' : 'Шоты'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 text-xs text-fg-3">
            {shots && shotCheck ? (
              <>
                <span>
                  Локаций <b className="text-fg">{shots.locations.length}</b>
                </span>
                <span>
                  Шотов <b className="text-fg">{shots.shots.length}</b>, немых {shotCheck.silent}
                </span>
                <span title="Озвучка рассказчика (~2.5 слова в секунду по-английски) + немые шоты по 3 с">
                  ~<b className="text-fg">{shotCheck.seconds}</b> с
                </span>
              </>
            ) : (
              <>
                <span>
                  Локаций <b className="text-fg">{parsed.locations.length}</b>
                </span>
                <span>
                  Сцен <b className="text-fg">{parsed.scenes.length}</b>
                </span>
                <span title="Сцены сценария, для которых в таблице scenes есть шоты">
                  Разбито на шоты <b className="text-fg">{covered}</b>/{parsed.scenes.length}
                </span>
                {parsed.scenes.length > 0 && (
                  <>
                    <span title="Слов у рассказчика за серию; длина ролика — примерно 2 слова в секунду">
                      Рассказчик <b className="text-fg">{check.narratorWords}</b> сл. · ~{check.seconds} с
                    </span>
                    <span>
                      Реплик <b className="text-fg">{check.characterLines}</b>
                    </span>
                  </>
                )}
              </>
            )}
            {hasContent &&
              (issues.length ? (
                <button className="flex items-center gap-1 text-gold hover:underline" onClick={() => setIssuesOpen((v) => !v)}>
                  <AlertTriangle className="size-3.5" /> Замечаний {issues.length}
                  <ChevronDown className={cn('size-3.5 transition-transform', issuesOpen && 'rotate-180')} />
                </button>
              ) : (
                <span className="flex items-center gap-1 text-success">
                  <CheckCircle2 className="size-3.5" /> Проверка пройдена
                </span>
              ))}
            {warnings.length > 0 && (
              <span className="flex items-center gap-1 text-gold" title={warnings.join('\n')}>
                <AlertTriangle className="size-3.5" /> Не разобрано строк: {warnings.length}
              </span>
            )}
          </div>
          <Button className="ml-auto" variant={sourceOpen ? 'secondary' : 'outline'} onClick={() => setSourceOpen((v) => !v)}>
            <FileText /> Исходник{dirty && ' •'}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {issuesOpen && hasContent && issues.length > 0 && (
            <div className="border-b border-border bg-gold/5 px-4 py-3">
              <div className="mb-1.5 text-xs font-medium text-fg-2">
                {shots ? 'Проверка по правилам Редактора' : 'Проверка по правилам сценариста'} — поправьте в исходнике или перегенерируйте
              </div>
              <ul className="space-y-1 text-[13px]">
                {issues.map((i, k) => (
                  <li key={k} className="flex items-start gap-1.5 text-fg-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-gold" />
                    <span>
                      {i.where && <span className="mr-1.5 font-mono text-xs text-fg-3">{i.where}</span>}
                      {i.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {shots ? (
            <ShotsTable parsed={shots} script={parsed} issues={issueShots} source={source} />
          ) : (
            <>
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
                        <Row
                          scene={s}
                          known={known}
                          issues={s.num != null ? issueScenes.get(s.num) : undefined}
                          shots={s.num != null ? shotsByNum.get(s.num) : undefined}
                          onOpenShots={(id) => navigate(`/scenes/${topicId}?scene=${id}`)}
                        />
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>

      <SidePanel open={sourceOpen} onClose={() => setSourceOpen(false)} panelKey="source" header={<h2 className="text-base font-semibold">{field}</h2>}>
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
            <p className="mt-2 text-[11px] text-fg-3">Таблица слева и проверка обновляются на лету — удобно проверять разметку.</p>
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

/** Шоты Редактора по локациям и сценам: разметка кадра, () и [], что звучит. */
function ShotsTable({ parsed, script, issues, source }: { parsed: ParsedShots; script: ParsedScript; issues: Map<number, string[]>; source: string }) {
  if (!parsed.shots.length)
    return (
      <EmptyState
        icon={<Clapperboard />}
        title={source.trim() ? 'Не удалось разобрать шоты' : 'Шотов пока нет'}
        description={source.trim() ? 'Ожидается формат «=== LOCATION N: … ===», «# Scene N», «K: #do !medium %center {Tag}». Откройте исходник.' : 'Поле script_shots у ролика пустое.'}
      />
    )
  const beatOf = new Map(script.scenes.map((s) => [s.num, s.beat]))
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead className="sticky top-0 z-10 bg-surface text-left text-xs text-fg-3">
        <tr className="border-b border-border">
          <th className="w-14 px-3 py-2 font-medium">№</th>
          <th className="w-44 px-3 py-2 font-medium">Шот</th>
          <th className="px-3 py-2 font-medium">Кадр · движение</th>
          <th className="w-[38%] px-3 py-2 font-medium">Звучит</th>
        </tr>
      </thead>
      <tbody>
        {parsed.shots.map((s, i) => {
          const prev = parsed.shots[i - 1]
          const loc = parsed.locations[s.loc]
          const bad = issues.get(s.n)
          return (
            <Fragment key={i}>
              {(!prev || prev.loc !== s.loc) && loc && (
                <tr className="border-b border-border bg-raised">
                  <td colSpan={4} className="px-3 py-1.5 text-xs">
                    <span className="font-semibold text-fg-2">
                      <MapPin className="mr-1.5 inline size-3.5 text-accent" />
                      {loc.num != null && `${loc.num}. `}
                      {loc.name}
                    </span>
                    {loc.time && <span className="ml-2 text-fg-3">· {loc.time}</span>}
                    {loc.ns && <div className="mt-0.5 text-fg-3">{loc.ns}</div>}
                  </td>
                </tr>
              )}
              {(!prev || prev.scene !== s.scene || prev.loc !== s.loc) && s.scene != null && (
                <tr className="border-b border-border/60">
                  <td colSpan={4} className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">
                    Сцена {s.scene}
                    {beatOf.get(s.scene) && <span className="ml-1.5 font-normal normal-case">· {beatOf.get(s.scene)}</span>}
                  </td>
                </tr>
              )}
              <tr className={cn('border-b border-border align-top hover:bg-hover/40', bad && 'bg-gold/5')}>
                <td className="px-3 py-2.5 font-mono text-fg-2">
                  <span className="inline-flex items-center gap-1" title={bad?.join('\n')}>
                    {s.n}
                    {bad && <AlertTriangle className="size-3.5 text-gold" />}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1 font-mono text-[11px]">
                    <span className={cn('rounded px-1.5 py-0.5', s.type === '#talk' ? 'bg-accent/15 text-accent-hover' : 'bg-raised text-fg-2')}>{s.type}</span>
                    {s.size && <span className="rounded bg-raised px-1.5 py-0.5 text-fg-3">!{s.size}</span>}
                    {s.angle && <span className="rounded bg-raised px-1.5 py-0.5 text-fg-3">%{s.angle}</span>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {s.chars.length ? (
                      s.chars.map((c) => (
                        <span key={c} className="rounded bg-raised px-1.5 py-0.5 text-xs text-fg">
                          {c}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-fg-3">без персонажей</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <p className="leading-relaxed text-fg-2">{s.frame}</p>
                  <p className="mt-1 leading-relaxed text-fg-3">→ {s.motion}</p>
                </td>
                <td className="px-3 py-2.5">
                  {s.lines.map((l, k) =>
                    l.speaker.toLowerCase() === NARRATOR.toLowerCase() ? (
                      <p key={k} className="border-l-2 border-info/60 pl-2 leading-relaxed text-fg italic">
                        {l.text}
                        {l.tone && <span className="ml-1.5 text-xs text-fg-3 not-italic">~ {l.tone}</span>}
                      </p>
                    ) : (
                      <p key={k} className="rounded bg-accent/10 px-1.5 py-0.5 leading-relaxed">
                        <b className="font-medium text-fg">{l.speaker}:</b> <span className="text-fg">{l.text}</span>
                        {l.tone && <span className="ml-1.5 text-xs text-fg-3">~ {l.tone}</span>}
                      </p>
                    ),
                  )}
                  {!s.lines.length && <span className="text-xs text-fg-3">тишина</span>}
                </td>
              </tr>
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

function Row({ scene, known, issues, shots, onOpenShots }: { scene: ScriptScene; known: Set<string>; issues?: string[]; shots?: Scene[]; onOpenShots: (sceneId: string) => void }) {
  const frames = shots?.filter((s) => s.base_image_url).length ?? 0
  return (
    <tr className="border-b border-border align-top hover:bg-hover/40">
      <td className="px-3 py-2.5 font-mono text-fg-2">
        <span className="inline-flex items-center gap-1" title={issues?.join('\n')}>
          {scene.num ?? '—'}
          {issues && <AlertTriangle className="size-3.5 text-gold" />}
        </span>
      </td>
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
        if (m[1].trim().toLowerCase() === NARRATOR.toLowerCase())
          return (
            <span key={i} className="mt-1.5 block border-l-2 border-info/60 pl-2 text-fg italic" title="Рассказчик за кадром">
              {m[2]}
            </span>
          )
        return (
          <span key={i} className="mx-0.5 inline rounded bg-accent/10 px-1 py-0.5">
            <b className="font-medium text-fg">{m[1]}:</b> <span className="text-fg">«{m[2]}»</span>
          </span>
        )
      })}
    </p>
  )
}
