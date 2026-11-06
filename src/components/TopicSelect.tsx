import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { topicTitle, useData, useScenesByTopic } from '@/store/data'
import { Select } from '@/components/ui'

/** Последний выбранный ролик — общий для «Сцен» и «Персонажей». */
export const LAST_TOPIC_KEY = 'scenes:lastTopic'

/** Выбор ролика; ведёт на `${base}/${topicId}`. Ролики со сценами — наверху. */
export function TopicSelect({ value, base, className }: { value: string; base: string; className?: string }) {
  const navigate = useNavigate()
  const { topics } = useData()
  const byTopic = useScenesByTopic()
  const options = useMemo(
    () =>
      [...topics]
        .sort((a, b) => (byTopic.get(b.topic_id)?.length ?? 0) - (byTopic.get(a.topic_id)?.length ?? 0))
        .map((t) => ({ value: t.topic_id, label: `${topicTitle(t)} · ${byTopic.get(t.topic_id)?.length ?? 0} сц.` })),
    [topics, byTopic],
  )
  return (
    <Select
      className={className}
      aria-label="Выбрать ролик"
      value={value}
      placeholder={value ? undefined : 'Выбрать ролик…'}
      onChange={(e) => e.target.value && navigate(`${base}/${e.target.value}`)}
      options={options}
    />
  )
}
