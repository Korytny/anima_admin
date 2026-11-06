import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Film, Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button, Input } from './ui'

const SessionCtx = createContext<Session | null>(null)
export const useSession = () => useContext(SessionCtx)

export async function signOut() {
  await supabase.auth.signOut()
}

/** Пускает в приложение только залогиненного пользователя Supabase Auth. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined)
    return (
      <div className="flex h-full items-center justify-center text-fg-3">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  if (!session) return <Login />
  return <SessionCtx.Provider value={session}>{children}</SessionCtx.Provider>
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [linkSent, setLinkSent] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin, shouldCreateUser: false } })
        if (error) throw error
        setLinkSent(true)
      }
    } catch (err) {
      toast.error('Не удалось войти', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-[#6d28d9] text-white">
            <Film className="size-4" />
          </div>
          <div>
            <div className="font-semibold">Pipeline Manager</div>
            <div className="text-xs text-fg-3">Вход для команды</div>
          </div>
        </div>
        {linkSent ? (
          <div className="space-y-3 text-center">
            <Mail className="mx-auto size-8 text-accent" />
            <p>
              Ссылка для входа отправлена на <b>{email}</b>
            </p>
            <Button variant="ghost" onClick={() => setLinkSent(false)}>
              Назад
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs text-fg-2">Email</span>
              <Input type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-fg-2">Пароль</span>
              <Input type="password" autoComplete="current-password" placeholder="Пусто — войти по ссылке на почту" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <Button type="submit" variant="primary" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {password ? 'Войти' : 'Получить ссылку для входа'}
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}
