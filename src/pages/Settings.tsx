import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Navigate, useParams } from 'react-router-dom'
import { Check, Database, Eraser, HardDrive, KeyRound, Loader2, Mail, Plug, Server, Shield, SlidersHorizontal, Sparkles, Trash2, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import type { Integration, SystemSettings, User, UserRole } from '@/types'
import { useData } from '@/store/data'
import { ROLES, toOptions } from '@/lib/status'
import { cn, fmtDateTime, timeAgo } from '@/lib/utils'
import { Avatar, Button, ConfirmDialog, Input, Modal, Select, Skeleton } from '@/components/ui'

const SECTIONS = [
  { id: 'access', label: 'Права доступа', icon: Shield },
  { id: 'integrations', label: 'Интеграции', icon: Plug },
  { id: 'system', label: 'Системные', icon: SlidersHorizontal },
] as const

export function SettingsPage() {
  const { section } = useParams()
  if (!section) return <Navigate to="/settings/integrations" replace />
  return (
    <div className="flex h-full min-h-0">
      <nav className="w-52 shrink-0 space-y-0.5 border-r border-border p-3" aria-label="Разделы настроек">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <NavLink
            key={id}
            to={`/settings/${id}`}
            className={({ isActive }) =>
              cn('flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-fg-2 hover:bg-hover hover:text-fg', isActive && 'bg-raised text-fg')
            }
          >
            <Icon className="size-4" /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl p-6">
          {section === 'access' && <AccessSection />}
          {section === 'integrations' && <IntegrationsSection />}
          {section === 'system' && <SystemSection />}
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-fg-2">{description}</p>}
      </div>
      {action}
    </div>
  )
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-xl border border-border bg-surface', className)}>{children}</div>
}

// ---------------- Права доступа

const RESOURCES = ['Контент-план', 'Сцены', 'Задачи', 'Агенты', 'Интеграции и ключи', 'Пользователи']
const MATRIX: Record<UserRole, string[]> = {
  admin: ['rw', 'rw', 'rw', 'rw', 'rw', 'rw'],
  editor: ['rw', 'rw', 'rw', 'rw', '—', '—'],
  viewer: ['r', 'r', 'r', 'r', '—', '—'],
}

function AccessSection() {
  const [users, setUsers] = useState<User[] | null>(null)
  const [invite, setInvite] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('editor')
  const [remove, setRemove] = useState<User | null>(null)

  useEffect(() => {
    api.listUsers().then(setUsers)
  }, [])

  const send = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error('Некорректный email')
    const u = await api.inviteUser(email, role)
    setUsers((x) => [...(x ?? []), u])
    toast.success('Приглашение отправлено', { description: email })
    setInvite(false)
    setEmail('')
  }

  return (
    <>
      <SectionTitle
        title="Права доступа"
        description="Пользователи и их роли. Права проверяются на сервере."
        action={
          <Button variant="primary" onClick={() => setInvite(true)}>
            <UserPlus /> Пригласить
          </Button>
        }
      />
      <Card>
        {!users && (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        )}
        {users?.map((u) => (
          <div key={u.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
            <Avatar name={u.name} size={32} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{u.name}</div>
              <div className="truncate text-xs text-fg-3">{u.email}</div>
            </div>
            <div className="hidden text-xs text-fg-3 md:block">{u.last_seen_at ? `был(а) ${timeAgo(u.last_seen_at)}` : 'приглашён(а)'}</div>
            <Select
              className="w-40"
              aria-label="Роль"
              value={u.role}
              options={toOptions(ROLES)}
              onChange={async (e) => {
                const nu = await api.updateUser(u.id, { role: e.target.value as UserRole })
                setUsers((x) => x?.map((y) => (y.id === u.id ? nu : y)) ?? null)
                toast.success('Роль изменена')
              }}
            />
            <Button variant="ghost" size="icon-sm" className="hover:text-danger" aria-label="Удалить" onClick={() => setRemove(u)}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </Card>

      <h2 className="mt-8 mb-3 font-semibold">Матрица прав</h2>
      <Card className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-xs text-fg-3">
              <th className="border-b border-border px-4 py-2.5 font-medium">Раздел</th>
              {(Object.keys(ROLES) as UserRole[]).map((r) => (
                <th key={r} className="border-b border-border px-4 py-2.5 font-medium" title={ROLES[r].description}>
                  {ROLES[r].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RESOURCES.map((res, i) => (
              <tr key={res}>
                <td className="border-b border-border/60 px-4 py-2.5">{res}</td>
                {(Object.keys(ROLES) as UserRole[]).map((r) => {
                  const v = MATRIX[r][i]
                  return (
                    <td key={r} className="border-b border-border/60 px-4 py-2.5">
                      {v === 'rw' ? (
                        <span className="inline-flex items-center gap-1 text-success"><Check className="size-3.5" /> изменение</span>
                      ) : v === 'r' ? (
                        <span className="text-info">просмотр</span>
                      ) : (
                        <span className="text-fg-3">нет доступа</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal
        open={invite}
        onOpenChange={setInvite}
        title="Пригласить пользователя"
        footer={
          <>
            <Button variant="ghost" onClick={() => setInvite(false)}>
              Отмена
            </Button>
            <Button variant="primary" onClick={send}>
              <Mail /> Отправить
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input autoFocus type="email" placeholder="name@studio.io" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
          <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)} options={toOptions(ROLES)} />
          <p className="text-xs text-fg-3">{ROLES[role].description}</p>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!remove}
        onOpenChange={(o) => !o && setRemove(null)}
        title={`Удалить ${remove?.name}?`}
        description="Пользователь потеряет доступ к админке."
        onConfirm={async () => {
          if (!remove) return
          await api.deleteUser(remove.id)
          setUsers((x) => x?.filter((u) => u.id !== remove.id) ?? null)
          toast.success('Пользователь удалён')
        }}
      />
    </>
  )
}

// ---------------- Интеграции

const KIND: Record<Integration['kind'], { title: string; icon: typeof Server }> = {
  compute: { title: 'Вычисления', icon: Server },
  llm: { title: 'LLM-провайдеры', icon: Sparkles },
  storage: { title: 'Хранилища медиа', icon: HardDrive },
}
const CONFIG_FIELDS: Partial<Record<Integration['id'], { key: string; label: string }[]>> = {
  runpod: [{ key: 'endpoint', label: 'Endpoint' }],
  s3: [
    { key: 'bucket', label: 'Bucket' },
    { key: 'region', label: 'Region' },
  ],
}

function IntegrationsSection() {
  const [items, setItems] = useState<Integration[] | null>(null)
  useEffect(() => {
    api.listIntegrations().then(setItems)
  }, [])
  const replace = (it: Integration) => setItems((x) => x?.map((y) => (y.id === it.id ? it : y)) ?? null)

  return (
    <>
      <SectionTitle title="Интеграции" description="Ключи хранятся только на сервере; здесь видны лишь последние 4 символа." />
      {!items && <Skeleton className="h-40 rounded-xl" />}
      {items &&
        (Object.keys(KIND) as Integration['kind'][]).map((kind) => {
          const list = items.filter((i) => i.kind === kind)
          if (!list.length) return null
          const K = KIND[kind]
          return (
            <section key={kind} className="mb-8">
              <h2 className="mb-3 flex items-center gap-2 font-semibold">
                <K.icon className="size-4 text-fg-3" /> {K.title}
              </h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {list.map((it) => (
                  <IntegrationCard key={it.id} item={it} onChange={replace} />
                ))}
              </div>
            </section>
          )
        })}
    </>
  )
}

const STATUS_UI: Record<Integration['status'], { label: string; color: string }> = {
  connected: { label: 'Подключено', color: '#10B981' },
  error: { label: 'Ошибка', color: '#EF4444' },
  not_configured: { label: 'Не настроено', color: '#71717A' },
}

function IntegrationCard({ item, onChange }: { item: Integration; onChange: (i: Integration) => void }) {
  const [secret, setSecret] = useState('')
  const [editingKey, setEditingKey] = useState(!item.key_hint)
  const [config, setConfig] = useState(item.config)
  const [testing, setTesting] = useState(false)
  const fields = CONFIG_FIELDS[item.id] ?? []
  const st = STATUS_UI[item.status]
  const configDirty = JSON.stringify(config) !== JSON.stringify(item.config)

  const save = async () => {
    const res = await api.updateIntegration(item.id, { config: configDirty ? config : undefined, secret: secret || undefined })
    onChange(res)
    setSecret('')
    setEditingKey(false)
    toast.success(`${item.title}: сохранено`)
  }
  const test = async () => {
    setTesting(true)
    try {
      const res = await api.testIntegration(item.id)
      onChange(res)
      res.status === 'connected' ? toast.success(`${item.title}: соединение в порядке`) : toast.error(`${item.title}: ${STATUS_UI[res.status].label}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <span className="font-semibold">{item.title}</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs" style={{ color: st.color }}>
          <span className="size-2 rounded-full bg-current" /> {st.label}
        </span>
      </div>
      <div className="mt-0.5 text-[11px] text-fg-3">{item.checked_at ? `проверено ${timeAgo(item.checked_at)}` : 'не проверялось'}</div>

      <div className="mt-4 space-y-3">
        {fields.map((f) => (
          <label key={f.key} className="block space-y-1">
            <span className="text-xs text-fg-2">{f.label}</span>
            <Input className="font-mono text-xs" value={config[f.key] ?? ''} onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))} />
          </label>
        ))}
        <div className="space-y-1">
          <span className="text-xs text-fg-2">API-ключ</span>
          {editingKey ? (
            <div className="flex gap-2">
              <Input
                type="password"
                autoComplete="off"
                className="font-mono text-xs"
                placeholder="Вставьте новый ключ"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
              {item.key_hint && (
                <Button variant="ghost" size="icon" aria-label="Отмена" onClick={() => (setEditingKey(false), setSecret(''))}>
                  <X />
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex h-8 flex-1 items-center gap-2 rounded-md border border-border bg-bg px-2.5 font-mono text-xs text-fg-2">
                <KeyRound className="size-3.5 text-fg-3" /> ••••••••{item.key_hint}
              </div>
              <Button variant="outline" onClick={() => setEditingKey(true)}>
                Заменить
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button variant="primary" disabled={!secret && !configDirty} onClick={save}>
          Сохранить
        </Button>
        <Button variant="outline" onClick={test} disabled={testing}>
          {testing ? <Loader2 className="animate-spin" /> : <Plug />} Проверить
        </Button>
      </div>
    </Card>
  )
}

// ---------------- Системные

const TIMEZONES = ['Europe/Moscow', 'Europe/Berlin', 'Europe/London', 'Asia/Dubai', 'Asia/Almaty', 'America/New_York', 'UTC']
const DATE_FORMATS = ['dd.MM.yyyy HH:mm', 'yyyy-MM-dd HH:mm', 'MM/dd/yyyy h:mm a']

function SystemSection() {
  const { topics, scenes, agents } = useData()
  const [s, setS] = useState<SystemSettings | null>(null)
  const [saved, setSaved] = useState<SystemSettings | null>(null)
  const [clear, setClear] = useState(false)
  useEffect(() => {
    api.getSystemSettings().then((x) => (setS(x), setSaved(x)))
  }, [])
  if (!s) return <Skeleton className="h-60 rounded-xl" />
  const dirty = JSON.stringify(s) !== JSON.stringify(saved)

  const exportAll = () => {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), topics, scenes, agents }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `anima-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <SectionTitle title="Системные настройки" />
      <Card className="divide-y divide-border">
        <Row label="Часовой пояс">
          <Select className="w-64" value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })} options={TIMEZONES.map((t) => ({ value: t, label: t }))} />
        </Row>
        <Row label="Формат даты и времени" hint={`Сейчас: ${fmtDateTime(new Date().toISOString())}`}>
          <Select className="w-64" value={s.date_format} onChange={(e) => setS({ ...s, date_format: e.target.value })} options={DATE_FORMATS.map((t) => ({ value: t, label: t }))} />
        </Row>
        <Row label="Базовый URL медиа" hint="Префикс для photo_paths и файлов сцен">
          <Input className="w-64 font-mono text-xs" value={s.media_base_url} onChange={(e) => setS({ ...s, media_base_url: e.target.value })} />
        </Row>
        <Row label="Язык интерфейса" hint="English — позже">
          <Select className="w-64" value="ru" disabled options={[{ value: 'ru', label: 'Русский' }]} />
        </Row>
      </Card>
      <div className="mt-3 flex gap-2">
        <Button
          variant="primary"
          disabled={!dirty}
          onClick={async () => {
            const r = await api.updateSystemSettings(s)
            setS(r)
            setSaved(r)
            toast.success('Настройки сохранены')
          }}
        >
          Сохранить
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setS(saved)}>
            Отмена
          </Button>
        )}
      </div>

      <h2 className="mt-8 mb-3 font-semibold">Данные</h2>
      <Card className="divide-y divide-border">
        <Row label="Экспорт всех данных" hint={`${topics.length} роликов, ${scenes.length} сцен, ${agents.length} агентов`}>
          <Button onClick={exportAll}>
            <Database /> Скачать JSON
          </Button>
        </Row>
        <Row label="Очистить локальный кеш" hint="Сбросит сохранённые фильтры, столбцы и вид таблиц">
          <Button variant="danger" onClick={() => setClear(true)}>
            <Eraser /> Очистить
          </Button>
        </Row>
        <Row label="Версия">
          <span className="font-mono text-xs text-fg-2">v{__APP_VERSION__}</span>
        </Row>
      </Card>

      <ConfirmDialog
        open={clear}
        onOpenChange={setClear}
        title="Очистить локальный кеш?"
        description="Настройки таблиц и фильтры вернутся к значениям по умолчанию. Данные на сервере не затрагиваются."
        confirmLabel="Очистить"
        onConfirm={() => {
          localStorage.clear()
          location.reload()
        }}
      />
    </>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div>
        <div className="font-medium">{label}</div>
        {hint && <div className="text-xs text-fg-3">{hint}</div>}
      </div>
      {children}
    </div>
  )
}
