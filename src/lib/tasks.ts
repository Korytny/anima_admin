// Задачи команды: статусы, подписи, картинка и ссылка привязанного объекта (шот, персонаж, серия).
import type { Character, Scene, Task, TeamMember, Topic } from '@/types'
import { sceneCode } from './media'

export const TASK_STATUSES = [
  { value: 'open', label: 'Открыта', color: '#3B82F6' },
  { value: 'in_progress', label: 'В работе', color: '#F59E0B' },
  { value: 'review', label: 'На проверке', color: '#8B5CF6' },
  { value: 'done', label: 'Готово', color: '#22C55E' },
] as const

export const taskStatus = (s: string) => TASK_STATUSES.find((x) => x.value === s) ?? { value: s, label: s, color: '#6B7280' }
export const isOpen = (t: Task) => t.status !== 'done'

export const memberName = (team: TeamMember[], id: string | null | undefined) => {
  const m = team.find((x) => x.user_id === id)
  return m ? m.name || m.email?.split('@')[0] || 'без имени' : id ? 'кто-то' : 'никому'
}

/** К чему привязана задача: подпись, картинка, ссылка в админке. */
export function taskTarget(t: Task, d: { scenes: Scene[]; topics: Topic[]; characters: Character[] }) {
  const scene = t.scene_id ? d.scenes.find((s) => s.scene_id === t.scene_id) : undefined
  const topic = d.topics.find((x) => x.topic_id === (t.topic_id ?? scene?.topic))
  const ch = t.character_id ? d.characters.find((c) => c.id === t.character_id) : undefined
  if (scene)
    return {
      label: `шот ${sceneCode(scene)}${topic ? ` · ${topic.title}` : ''}`,
      image: scene.base_image_url ?? undefined,
      href: `/scenes/${scene.topic}?scene=${scene.scene_id}`,
    }
  if (ch) return { label: `персонаж ${ch.name}`, image: ch.base_img ?? ch.pers_file ?? ch.filename ?? undefined, href: `/characters/${ch.season}?character=${ch.id}` }
  if (topic) return { label: `серия «${topic.title}»`, image: undefined, href: `/topics/${topic.topic_id}` }
  return null
}
