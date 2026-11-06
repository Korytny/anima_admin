import type { Agent, Integration, IntegrationId, Scene, SystemSettings, Topic, User } from '@/types'

/**
 * Контракт слоя данных. UI работает только через него.
 * topics/scenes — Supabase (src/api/supabase.ts); остальное — демо in-memory (src/api/demo.ts),
 * пока под это нет таблиц.
 */
export interface Api {
  listTopics(): Promise<Topic[]>
  createTopic(data?: Partial<Topic>): Promise<Topic>
  updateTopic(id: string, patch: Partial<Topic>): Promise<Topic>
  updateTopics(ids: string[], patch: Partial<Topic>): Promise<Topic[]>
  deleteTopics(ids: string[]): Promise<void>

  listScenes(): Promise<Scene[]>
  createScene(topicId: string, data?: Partial<Scene>): Promise<Scene>
  updateScene(id: string, patch: Partial<Scene>): Promise<Scene>
  updateScenes(ids: string[], patch: Partial<Scene>): Promise<Scene[]>
  deleteScenes(ids: string[]): Promise<void>

  listAgents(): Promise<Agent[]>
  createAgent(data?: Partial<Agent>): Promise<Agent>
  updateAgent(id: string, patch: Partial<Agent>): Promise<Agent>
  deleteAgents(ids: string[]): Promise<void>

  listUsers(): Promise<User[]>
  inviteUser(email: string, role: User['role']): Promise<User>
  updateUser(id: string, patch: Partial<User>): Promise<User>
  deleteUser(id: string): Promise<void>

  listIntegrations(): Promise<Integration[]>
  updateIntegration(id: IntegrationId, patch: { config?: Record<string, string>; secret?: string }): Promise<Integration>
  testIntegration(id: IntegrationId): Promise<Integration>

  getSystemSettings(): Promise<SystemSettings>
  updateSystemSettings(patch: Partial<SystemSettings>): Promise<SystemSettings>
}
