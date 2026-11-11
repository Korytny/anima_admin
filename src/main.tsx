import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import './index.css'
import { DataProvider } from '@/store/data'
import { AuthGate } from '@/components/AuthGate'
import { AppLayout } from '@/components/layout/AppLayout'
import { DashboardPage } from '@/pages/Dashboard'
import { ContentPlanPage } from '@/pages/ContentPlan'
import { ScenesPage } from '@/pages/Scenes'
import { CharactersPage } from '@/pages/Characters'
import { StoryboardPage } from '@/pages/Storyboard'
import { VoicePage } from '@/pages/Voice'
import { AnimationPage } from '@/pages/Animation'
import { MontagePage } from '@/pages/Montage'
import { MusicPage } from '@/pages/Music'
import { ScriptPage } from '@/pages/Script'
import { AgentsPage } from '@/pages/Agents'
import { SeasonsPage } from '@/pages/Seasons'
import { SettingsPage } from '@/pages/Settings'
import { applyBundledUiSettings } from '@/lib/uiSettings'

// Эталонные настройки интерфейса владельца (ui-settings.json в корне) — до первого чтения localStorage
applyBundledUiSettings()

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/topics" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'seasons/:seasonId?', element: <SeasonsPage /> },
      { path: 'topics/:topicId?', element: <ContentPlanPage /> },
      { path: 'scenes/:topicId?', element: <ScenesPage /> },
      { path: 'script/:topicId?', element: <ScriptPage /> },
      { path: 'storyboard/:topicId?', element: <StoryboardPage /> },
      { path: 'voice/:topicId?', element: <VoicePage /> },
      { path: 'animation/:topicId?', element: <AnimationPage /> },
      { path: 'music/:topicId?', element: <MusicPage /> },
      { path: 'montage/:topicId?', element: <MontagePage /> },
      { path: 'characters/:seasonId?', element: <CharactersPage /> },
      { path: 'agents', element: <AgentsPage /> },
      { path: 'settings/:section?', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/topics" replace /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <DataProvider>
        <RouterProvider router={router} />
      </DataProvider>
    </AuthGate>
    <Toaster
      theme="dark"
      position="top-right"
      toastOptions={{ style: { background: '#1C1C26', border: '1px solid #2A2A35', color: '#fff' } }}
    />
  </StrictMode>,
)
