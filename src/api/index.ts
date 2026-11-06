import { demoApi } from './demo'
import { supabaseData } from './supabase'
import type { Api } from './types'

// topics/scenes — реальная БД (Supabase), остальное — демо до появления таблиц.
export const api: Api = { ...demoApi, ...supabaseData }
export type { Api }
