import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ALL_SEASONS, SEASON_KEY, seasonEpisodes, seasonTitle, topicTitle, useData, useScenesByTopic } from '@/store/data'
import { Select } from '@/components/ui'
import { storageGet } from '@/lib/utils'

/** Последний выбранный ролик — общий для «Сценария», «Сцен» и «Раскадровки». */
export const LAST_TOPIC_KEY = 'scenes:lastTopic'

/** Сезон, выбранный в «Сезонах» / «Контент-плане» (SEASON_KEY): id сезона или null = все сезоны.
 *  Не выбран или удалён → первый сезон, как в «Контент-плане». */
export function useSelectedSeason(): string | null {
  const { seasons } = useData()
  const pick = storageGet<string | null>(SEASON_KEY, null)
  if (pick === ALL_SEASONS) return null
  if (seasons.some((s) => s.id === pick)) return pick
  return seasons[0]?.id ?? null
}

/** Какой ролик открыть на странице без id: последний, если он из выбранного сезона, иначе первая серия сезона. */
export function useLastTopic(): string | null {
  const { topics, loading } = useData()
  const season = useSelectedSeason()
  const last = storageGet<string | null>(LAST_TOPIC_KEY, null)
  if (loading) return null // не уводим на старый ролик, пока не знаем серии сезона
  if (!season) return last
  const episodes = seasonEpisodes(season, topics)
  if (last && episodes.some((t) => t.topic_id === last)) return last
  return episodes[0]?.topic_id ?? null
}

/** Выбор ролика; ведёт на `${base}/${topicId}`. Выбран сезон — только его серии по номеру; «Все сезоны» — все ролики,
 *  со сценами наверху. Открытый ролик из другого сезона остаётся в списке последним, с названием сезона. */
export function TopicSelect({ value, base, className }: { value: string; base: string; className?: string }) {
  const navigate = useNavigate()
  const { topics, seasons } = useData()
  const byTopic = useScenesByTopic()
  const season = useSelectedSeason()
  const options = useMemo(() => {
    const scenes = (id: string) => byTopic.get(id)?.length ?? 0
    if (!season)
      return [...topics]
        .sort((a, b) => scenes(b.topic_id) - scenes(a.topic_id))
        .map((t) => ({ value: t.topic_id, label: `${topicTitle(t)} · ${scenes(t.topic_id)} сц.` }))
    const list = seasonEpisodes(season, topics).map((t) => ({
      value: t.topic_id,
      label: `${t.backlog != null ? `${t.backlog}. ` : ''}${topicTitle(t)} · ${scenes(t.topic_id)} сц.`,
    }))
    const current = value ? topics.find((t) => t.topic_id === value) : undefined
    if (current && current.season_id !== season) {
      const other = seasons.find((s) => s.id === current.season_id)
      list.push({ value: current.topic_id, label: `${topicTitle(current)} · сезон «${seasonTitle(other)}»` })
    }
    return list
  }, [topics, seasons, byTopic, season, value])
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
