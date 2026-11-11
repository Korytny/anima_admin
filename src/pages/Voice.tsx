import { useEffect, useMemo, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { AudioLines, Loader2, Mic } from 'lucide-react'
import type { Scene } from '@/types'
import { useData, useScenesByTopic } from '@/store/data'
import { audioConfigured } from '@/api/pipeline'
import { mediaUrl } from '@/lib/media'
import { storageGet } from '@/lib/utils'
import { DataTable } from '@/components/DataTable'
import { LAST_TOPIC_KEY, TopicSelect } from '@/components/TopicSelect'
import { Button, ConfirmDialog, EmptyState } from '@/components/ui'
import { SceneCard } from './SceneCard'

/** Озвучка серии: сцены с репликой (scenes.dialogue_text). Результат n8n пишет в audio_file / audio_duration. */
export function VoicePage() {
  const { topicId } = useParams()
  if (!topicId) {
    const last = storageGet<string | null>(LAST_TOPIC_KEY, null)
    if (last) return <Navigate to={`/voice/${last}`} replace />
    return <EmptyState icon={<Mic />} title="Выберите ролик" action={<TopicSelect value="" base="/voice" className="w-72" />} />
  }
  return <Voice key={topicId} topicId={topicId} />
}

const hasLine = (s: Scene) => !!s.dialogue_text?.trim()
const noAudioTitle = audioConfigured ? undefined : 'Не задан VITE_N8N_AUDIO_WEBHOOK'

function Voice({ topicId }: { topicId: string }) {
  const [params, setParams] = useSearchParams()
  const { loading, deleteScenes, runJobs, isRunning } = useData()
  const all = useScenesByTopic().get(topicId) ?? []
  const lines = useMemo(() => all.filter(hasLine), [all])
  const voiced = lines.filter((s) => s.audio_file).length
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [confirm, setConfirm] = useState<string | null>(null)
  const selectedIds = Object.keys(selection)

  useEffect(() => {
    localStorage.setItem(LAST_TOPIC_KEY, JSON.stringify(topicId))
  }, [topicId])

  const activeId = params.get('scene')
  const active = all.find((s) => s.scene_id === activeId) ?? null
  const open = (id: string | null) =>
    setParams((p) => {
      if (id == null) p.delete('scene')
      else p.set('scene', id)
      return p
    })

  const columns = useMemo<ColumnDef<Scene, any>[]>(
    () => [
      {
        id: 'num',
        accessorFn: (s) => (s.scena ?? 0) * 1000 + (s.shot_num ?? 0),
        header: 'Сц.шот',
        size: 76,
        meta: { label: 'Сцена.шот' },
        cell: ({ row }) => (
          <span className="inline-flex h-5 items-center rounded bg-raised px-1.5 font-mono text-xs text-fg-2">
            {row.original.scena ?? '—'}.{row.original.shot_num ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'speaking_character',
        header: 'Говорит',
        size: 120,
        meta: { label: 'Говорит' },
      },
      {
        accessorKey: 'speaking_character_voice',
        header: 'Голос',
        size: 120,
        meta: { label: 'Голос' },
        cell: ({ getValue }) => <span className="font-mono text-xs text-fg-2">{getValue() || '—'}</span>,
      },
      {
        accessorKey: 'dialogue_text',
        header: 'Реплика',
        size: 320,
        meta: { label: 'Реплика' },
        cell: ({ getValue }) => <span className="line-clamp-2 whitespace-normal">{getValue()}</span>,
      },
      {
        accessorKey: 'dialogue_direction',
        header: 'Подача',
        size: 160,
        meta: { label: 'Подача' },
        cell: ({ getValue }) => <span className="line-clamp-2 whitespace-normal text-fg-3">{getValue()}</span>,
      },
      {
        id: 'audio',
        accessorKey: 'audio_file',
        header: 'Озвучка',
        size: 260,
        enableSorting: false,
        meta: { label: 'Озвучка' },
        cell: ({ row }) => {
          const s = row.original
          if (isRunning('audio', s.scene_id))
            return (
              <span className="inline-flex items-center gap-1.5 text-xs text-gold">
                <Loader2 className="size-3.5 animate-spin" /> в работе
              </span>
            )
          if (!s.audio_file) return <span className="text-xs text-fg-3">нет</span>
          return <audio src={mediaUrl(s.audio_file)} controls preload="none" className="h-8 w-full" onClick={(e) => e.stopPropagation()} />
        },
      },
      {
        accessorKey: 'audio_duration',
        header: 'Аудио, с',
        size: 76,
        meta: { label: 'Длительность аудио' },
        cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() ?? '—'}</span>,
      },
      {
        accessorKey: 'time',
        header: 'Сек',
        size: 60,
        meta: { label: 'Сек (длительность шота)' },
        cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() ?? '—'}</span>,
      },
      {
        id: 'run',
        header: '',
        size: 140,
        enableSorting: false,
        meta: { label: 'Кнопка озвучки' },
        cell: ({ row }) => {
          const s = row.original
          return (
            <Button
              size="sm"
              variant="ghost"
              disabled={!audioConfigured || isRunning('audio', s.scene_id)}
              title={noAudioTitle}
              onClick={(e) => {
                e.stopPropagation()
                void runJobs('audio', [s.scene_id])
              }}
            >
              <AudioLines /> {s.audio_file ? 'Переозвучить' : 'Озвучить'}
            </Button>
          )
        },
      },
    ],
    [isRunning, runJobs],
  )

  const unvoiced = lines.filter((s) => !s.audio_file && !isRunning('audio', s.scene_id)).map((s) => s.scene_id)

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
          <TopicSelect value={topicId} base="/voice" className="w-64" />
          <div className="ml-auto flex items-center gap-4 text-xs text-fg-3">
            <span>
              Реплик <b className="text-fg">{lines.length}</b>
            </span>
            <span>
              Озвучено <b className="text-fg">{voiced}</b>/{lines.length}
            </span>
          </div>
        </div>

        <DataTable
          data={lines}
          columns={columns}
          getRowId={(s) => s.scene_id}
          storageKey="voice"
          rowSelection={selection}
          onRowSelectionChange={setSelection}
          activeId={activeId}
          onRowClick={(s) => open(s.scene_id === activeId ? null : s.scene_id)}
          loading={loading}
          toolbarRight={
            <>
              {selectedIds.length > 0 && (
                <Button
                  variant="outline"
                  disabled={!audioConfigured}
                  title={noAudioTitle}
                  onClick={() => {
                    void runJobs('audio', selectedIds)
                    setSelection({})
                  }}
                >
                  <AudioLines /> Озвучить выбранные ({selectedIds.length})
                </Button>
              )}
              <Button variant="primary" disabled={!audioConfigured || !unvoiced.length} title={noAudioTitle} onClick={() => void runJobs('audio', unvoiced)}>
                <Mic /> Озвучить неозвученное
                {unvoiced.length ? ` (${unvoiced.length})` : ''}
              </Button>
            </>
          }
          empty={<EmptyState icon={<Mic />} title={all.length ? 'В сценах серии нет реплик' : 'У ролика нет сцен'} />}
        />
      </div>

      <SceneCard scene={active} siblings={all} onClose={() => open(null)} onDelete={setConfirm} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Удалить сцену?"
        description="Сцена будет удалена из БД. Действие нельзя отменить."
        onConfirm={async () => {
          if (!confirm) return
          await deleteScenes([confirm])
          if (activeId === confirm) open(null)
        }}
      />
    </div>
  )
}
