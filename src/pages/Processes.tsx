import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Boxes, CheckCircle2, ChevronRight, FileJson, RefreshCw, Upload, Workflow, XCircle } from 'lucide-react'
import { getWorkflows } from '@/api/compute'
import { LABELS, SLOTS, analyzeWorkflow, type Slot, type WorkflowFile, type WorkflowReport } from '@/lib/workflows'
import { cn, fmtBytes, timeAgo } from '@/lib/utils'
import { Button } from '@/components/ui'

/** Процессы ComfyUI конвейера: что лежит в workflows/, все ли метки на месте, какие модели нужны.
 *  n8n подставляет данные по меткам (заголовкам узлов), см. lib/workflows.ts. */
export function ProcessesPage() {
  const [files, setFiles] = useState<WorkflowFile[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dropped, setDropped] = useState<{ name: string; report: WorkflowReport } | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const load = useCallback(async () => {
    try {
      setFiles(await getWorkflows())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => void load(), [load])

  const byName = new Map((files ?? []).map((f) => [f.name, f]))
  const extra = (files ?? []).filter((f) => !SLOTS.some((s) => s.file === f.name))
  const ready = SLOTS.filter((s) => {
    const f = byName.get(s.file)
    return f?.json && analyzeWorkflow(f.json, s).ok
  }).length

  const check = async (file: File) => {
    try {
      const json = JSON.parse(await file.text())
      setDropped({
        name: file.name,
        report: analyzeWorkflow(
          json,
          SLOTS.find((s) => s.file === file.name),
        ),
      })
    } catch (e) {
      setDropped({ name: file.name, report: { ...analyzeWorkflow(null), fatal: `Не JSON: ${e instanceof Error ? e.message : e}` } })
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold">Процессы</h1>
            <p className="text-[13px] text-fg-3">
              Процессы ComfyUI конвейера (API-формат, папка <span className="font-mono">workflows/</span>). n8n находит узлы по меткам в заголовке и подставляет данные сцены.
            </p>
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl leading-none font-semibold">
              {ready}/{SLOTS.length}
            </div>
            <div className="mt-1 text-[11px] text-fg-3">процессов готово</div>
          </div>
          <Button variant="ghost" size="icon" aria-label="Обновить" title="Перечитать папку" onClick={() => void load()}>
            <RefreshCw />
          </Button>
        </div>

        {error && <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}

        <section className="space-y-2">
          {SLOTS.map((s) => (
            <SlotRow key={s.file} slot={s} file={byName.get(s.file)} loading={!files && !error} />
          ))}
        </section>

        {extra.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold tracking-wide text-fg-3 uppercase">Другие файлы в workflows/</h2>
            {extra.map((f) => (
              <SlotRow key={f.name} file={f} />
            ))}
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-2">
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const f = e.dataTransfer.files[0]
              if (f) void check(f)
            }}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors',
              dragOver ? 'border-accent bg-accent/5' : 'border-border hover:border-fg-3',
            )}
          >
            <Upload className="size-6 text-fg-3" />
            <div className="text-[13px] font-medium">Проверить процесс</div>
            <div className="max-w-sm text-xs text-fg-3">
              Перетащите API-json из ComfyUI — покажу, какие метки найдены и чего не хватает. Назовите файл как слот (например <span className="font-mono">frame-refs.json</span>) — проверю по его
              требованиям. Чтобы подключить — положите файл в <span className="font-mono">workflows/</span>.
            </div>
            <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void check(e.target.files[0])} />
          </label>
          <LabelsHelp />
        </section>

        {dropped && (
          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-3 flex items-center gap-2 text-[13px] font-medium">
              <FileJson className="size-4 text-fg-3" /> {dropped.name}
              <Verdict report={dropped.report} />
            </div>
            <Report report={dropped.report} />
          </section>
        )}
      </div>
    </div>
  )
}

function Verdict({ report }: { report: WorkflowReport }) {
  if (report.fatal)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-danger">
        <XCircle className="size-3.5" /> не подходит
      </span>
    )
  if (!report.ok)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gold">
        <AlertTriangle className="size-3.5" /> не хватает меток
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 text-xs text-success">
      <CheckCircle2 className="size-3.5" /> готов
    </span>
  )
}

/** Строка слота (или лишнего файла): статус, раскрывается в отчёт по меткам. */
function SlotRow({ slot, file, loading }: { slot?: Slot; file?: WorkflowFile; loading?: boolean }) {
  const [open, setOpen] = useState(false)
  const report = file?.json ? analyzeWorkflow(file.json, slot) : file?.error ? { ...analyzeWorkflow(null), fatal: `Не читается: ${file.error}` } : null
  return (
    <div className="rounded-lg border border-border bg-surface">
      <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => report && setOpen((o) => !o)} disabled={!report}>
        <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4', report?.ok ? 'bg-success/15 text-success' : 'bg-raised text-fg-3')}>
          <Workflow />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-medium">{slot?.title ?? file?.name}</span>
            <span className="font-mono text-[11px] text-fg-3">{slot?.file ?? ''}</span>
          </div>
          <div className="truncate text-xs text-fg-3">
            {slot?.description}
            {file && ` · ${fmtBytes(file.size)} · изменён ${timeAgo(new Date(file.mtime).toISOString())}`}
            {report && !report.fatal && ` · узлов ${report.nodes}`}
          </div>
        </div>
        {slot && (
          <div className="hidden shrink-0 gap-1 md:flex">
            {[...slot.required, ...slot.optional].map((l) => {
              const has = report?.found.some((f) => f.label === l)
              const req = slot.required.includes(l)
              return (
                <span
                  key={l}
                  title={`${LABELS[l].what}${req ? ' — обязательна' : ' — по желанию'}`}
                  className={cn('rounded px-1.5 font-mono text-[10px]', has ? 'bg-success/15 text-success' : req ? 'bg-danger/15 text-danger' : 'bg-raised text-fg-3')}
                >
                  {l}
                </span>
              )
            })}
          </div>
        )}
        <div className="w-28 shrink-0 text-right">
          {loading ? <span className="text-xs text-fg-3">…</span> : !file ? <span className="text-xs text-fg-3">нет файла</span> : report && <Verdict report={report} />}
        </div>
        {report && <ChevronRight className={cn('size-4 shrink-0 text-fg-3 transition-transform', open && 'rotate-90')} />}
      </button>
      {open && report && (
        <div className="border-t border-border p-4">
          <Report report={report} />
        </div>
      )}
    </div>
  )
}

/** Отчёт по процессу: найденные метки (узел, поле, текущее значение), проблемы, нужные модели. */
function Report({ report }: { report: WorkflowReport }) {
  if (report.fatal) return <div className="text-[13px] text-danger">{report.fatal}</div>
  const problems = [
    ...report.missing.map((l) => `нет обязательной метки ${l} — ${LABELS[l].what}`),
    ...report.duplicates.map((l) => `метка ${l} стоит на нескольких узлах — n8n не поймёт, какой брать`),
    ...report.badField.map((l) => `метка ${l} на узле без поля ${LABELS[l].fields.join(' / ')}`),
    ...report.wiring,
    ...report.unknownLabels.map((t) => `заголовок «${t}» — не из договора меток, n8n его не тронет`),
  ]
  return (
    <div className="space-y-4 text-xs">
      {problems.length > 0 && (
        <ul className="space-y-1">
          {problems.map((p) => (
            <li key={p} className="flex items-start gap-1.5 text-gold">
              <AlertTriangle className="mt-px size-3.5 shrink-0" /> {p}
            </li>
          ))}
        </ul>
      )}
      {report.found.length > 0 ? (
        <table className="w-full">
          <thead className="text-left text-fg-3">
            <tr>
              <th className="py-1 pr-3 font-medium">Метка</th>
              <th className="py-1 pr-3 font-medium">Узел</th>
              <th className="py-1 pr-3 font-medium">Поле</th>
              <th className="py-1 font-medium">Сейчас в процессе</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {report.found.map((f) => (
              <tr key={f.label + f.nodeId} className="border-t border-border/60 align-top">
                <td className="py-1.5 pr-3 text-accent">{f.label}</td>
                <td className="py-1.5 pr-3 text-fg-2">
                  {f.classType} <span className="text-fg-3">#{f.nodeId}</span>
                </td>
                <td className="py-1.5 pr-3">{f.field ?? <span className="text-danger">нет</span>}</td>
                <td className="max-w-md truncate py-1.5 text-fg-3" title={typeof f.value === 'string' ? f.value : JSON.stringify(f.value)}>
                  {typeof f.value === 'string' ? f.value : JSON.stringify(f.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="text-fg-3">Меток нет — у узлов в ComfyUI задайте заголовки (Title): #prompt, #ref1, #save…</div>
      )}
      {report.missingOptional.length > 0 && <div className="text-fg-3">По желанию, не найдены: {report.missingOptional.join(', ')}</div>}
      {report.models.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-fg-3">
            <Boxes className="size-3.5" /> Модели, которые процесс ждёт на сервере
          </div>
          <div className="flex flex-wrap gap-1">
            {report.models.map((m) => (
              <span key={m} className="rounded bg-raised px-1.5 py-0.5 font-mono text-[11px] text-fg-2">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function LabelsHelp() {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 text-[13px] font-medium">Метки узлов</div>
      <p className="mb-3 text-xs text-fg-3">В ComfyUI: правый клик по узлу → Title. Метка — первое слово заголовка, дальше можно писать что угодно («#ref1 Kunti»).</p>
      <table className="w-full text-xs">
        <tbody>
          {Object.values(LABELS).map((l) => (
            <tr key={l.label} className="border-t border-border/60">
              <td className="py-1 pr-3 font-mono text-accent">{l.label}</td>
              <td className="py-1 pr-3 font-mono text-fg-3">{l.fields.join(' / ')}</td>
              <td className="py-1 text-fg-2">{l.what}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
