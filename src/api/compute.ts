// Вычисления: мини-API к RunPod внутри dev-сервера админки (плагин runpodApi в vite.config.ts).
// Ключ RunPod — RUNPOD_API_KEY в .env.local (без VITE_), в браузер не попадает. Запросы — с токеном Supabase.
import { supabase } from '@/lib/supabase'

const BASE = '/compute'

export interface Pod {
  id: string
  name: string
  gpuType: string
  gpuCount: number
  status: string // RUNNING | EXITED | TERMINATED | …
  costPerHr: number
  country: string
  uptimeSeconds: number
}

export interface PodsInfo {
  pods: Pod[]
  balance: number | null // баланс аккаунта RunPod, $
  spendPerHr: number | null // текущий расход аккаунта, $/ч (включая хранение)
  comfy: import('../../server/comfy').ServerStats | null // ComfyUI работающего пода (через прокси RunPod)
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(BASE + path, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${data.session?.access_token ?? ''}` } })
  const body = await res.json().catch(() => null)
  if (body && typeof body === 'object' && 'error' in body) throw new Error(body.error)
  if (!res.ok) throw new Error(`Сервис вычислений ответил ${res.status}`)
  return body as T
}

export const getPods = () => call<PodsInfo>('/pods')
export const podAction = (id: string, action: 'start' | 'stop') => call<{ ok: boolean }>(`/pods/${id}/${action}`, { method: 'POST' })

/** Адрес ComfyUI пода через прокси RunPod (порт 8188 должен быть открыт как http). */
export const podComfyUrl = (id: string) => `https://${id}-8188.proxy.runpod.net`

// ----- свои серверы с ComfyUI (COMPUTE_SERVERS в .env.local; типы — server/comfy.ts)
export type { ComputeServer, ServerStats, Generation, KindStats } from '../../server/comfy'
import type { ComputeServer, ServerStats } from '../../server/comfy'
export const getServers = () => call<ComputeServer[]>('/servers')
export const getServerStats = (id: string) => call<ServerStats>(`/servers/${id}/stats`)
