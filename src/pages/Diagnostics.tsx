import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, Stethoscope, XCircle } from 'lucide-react'
import { getDiagnostics, type DiagCheck } from '@/api/compute'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'

/** Диагностика машины, где запущена админка (обычно сервер с n8n и ComfyUI): сеть, вебхуки, сервисы — с советами. */
export function DiagnosticsPage() {
  const [data, setData] = useState<{ host: string; checks: DiagCheck[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [at, setAt] = useState<Date | null>(null)

  const run = useCallback(async () => {
    setBusy(true)
    try {
      setData(await getDiagnostics())
      setError(null)
      setAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])
  useEffect(() => {
    void run()
  }, [run])

  const groups = [...new Set((data?.checks ?? []).map((c) => c.group))]
  const problems = (data?.checks ?? []).filter((c) => c.status === 'fail' || c.status === 'warn').length

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-5 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold">Диагностика</h1>
            <p className="text-[13px] text-fg-3">
              Проверка машины, где запущена админка{data ? ` (${data.host})` : ''}: связь с Supabase по IPv4 и IPv6, n8n и вебхуки, ComfyUI, OpenAI. Только чтение — процессы n8n не запускаются.
            </p>
          </div>
          {data && (
            <div className={cn('text-[13px] font-medium', problems ? 'text-gold' : 'text-success')}>{problems ? `Проблем: ${problems}` : 'Всё в порядке'}</div>
          )}
          <Button variant="outline" onClick={() => void run()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Проверить
          </Button>
        </div>
        {error && <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
        {!data && busy && (
          <div className="flex items-center gap-2 text-[13px] text-fg-3">
            <Stethoscope className="size-4" /> Проверяю — до минуты: каждый сервис опрашивается несколько раз…
          </div>
        )}
        {groups.map((g) => (
          <section key={g} className="rounded-xl border border-border bg-surface">
            <h2 className="border-b border-border px-4 py-2 text-xs font-semibold tracking-wide text-fg-3 uppercase">{g}</h2>
            <ul>
              {data!.checks
                .filter((c) => c.group === g)
                .map((c, i) => (
                  <li key={i} className="flex gap-3 border-b border-border/60 px-4 py-2.5 last:border-0">
                    <StatusIcon s={c.status} />
                    <div className="min-w-0 flex-1 text-[13px]">
                      <div className="flex flex-wrap items-baseline gap-x-3">
                        <span className="font-medium">{c.name}</span>
                        <span className="font-mono text-xs break-all text-fg-3">{c.detail}</span>
                      </div>
                      {c.advice && <div className="mt-1 rounded-md bg-gold/10 px-2.5 py-1.5 text-xs text-fg-2">{c.advice}</div>}
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        ))}
        {at && <div className="text-[11px] text-fg-3">Проверено {at.toLocaleTimeString('ru')}</div>}
      </div>
    </div>
  )
}

function StatusIcon({ s }: { s: DiagCheck['status'] }) {
  const cls = 'mt-0.5 size-4 shrink-0'
  if (s === 'ok') return <CheckCircle2 className={cn(cls, 'text-success')} />
  if (s === 'warn') return <AlertTriangle className={cn(cls, 'text-gold')} />
  if (s === 'fail') return <XCircle className={cn(cls, 'text-danger')} />
  return <Info className={cn(cls, 'text-fg-3')} />
}
