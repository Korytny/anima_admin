// Шаги конвейера, к которым относятся агенты (agents.step, supabase/agent_step.sql).
import type { Agent } from '@/types'

export const AGENT_STEPS = [
  { value: 'script', label: 'Сценарий' },
  { value: 'shots', label: 'Шоты' },
  { value: 'frames', label: 'Промпты кадров' },
] as const

export type AgentStep = (typeof AGENT_STEPS)[number]['value']

/** Агенты шага: активные первыми, затем по id. */
export const stepAgents = (agents: Agent[], step: AgentStep) =>
  agents.filter((a) => a.step === step).sort((a, b) => Number(!!b.is_active) - Number(!!a.is_active) || a.id - b.id)

/** Агент, который работает на шаге: активный агент шага. Активным на шаге может быть только один
 *  (при включении остальные выключаются — useAgentUpdate в pages/Agents.tsx). */
export const activeStepAgent = (agents: Agent[], step: AgentStep): Agent | null => stepAgents(agents, step).find((a) => a.is_active) ?? null
