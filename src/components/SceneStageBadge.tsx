import type { Scene } from '@/types'
import { SCENE_STAGES, SCENE_STATUS, sceneStage } from '@/lib/status'
import { StatusBadge } from './ui'
import { useData } from '@/store/data'

/** Этап шота (вычисленный) + пометка «генерация» / «ошибка» из scenes.status, если она есть. */
export function SceneStageBadge({ scene, topic }: { scene: Scene; topic?: { url_final: string | null } | null }) {
  const stage = sceneStage(scene, topic)
  const queued = useData().isQueued(scene.scene_id)
  const tech = scene.status === 'generating' || scene.status === 'error' ? SCENE_STATUS[scene.status] : null
  return (
    <span className="inline-flex items-center gap-1" title={SCENE_STAGES[stage].hint}>
      <StatusBadge meta={SCENE_STAGES[stage]} />
      {tech && <StatusBadge meta={tech} />}
      {queued && !tech && <StatusBadge meta={{ label: 'В очереди', color: '#A1A1AA' }} />}
    </span>
  )
}
