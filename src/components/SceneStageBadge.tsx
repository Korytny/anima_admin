import type { Scene } from '@/types'
import { SCENE_STAGES, SCENE_STATUS, sceneStage } from '@/lib/status'
import { StatusBadge } from './ui'

/** Этап шота (вычисленный) + пометка «генерация» / «ошибка» из scenes.status, если она есть. */
export function SceneStageBadge({ scene, topic }: { scene: Scene; topic?: { url_final: string | null } | null }) {
  const stage = sceneStage(scene, topic)
  const tech = scene.status === 'generating' || scene.status === 'error' ? SCENE_STATUS[scene.status] : null
  return (
    <span className="inline-flex items-center gap-1" title={SCENE_STAGES[stage].hint}>
      <StatusBadge meta={SCENE_STAGES[stage]} />
      {tech && <StatusBadge meta={tech} />}
    </span>
  )
}
