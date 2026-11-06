import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import * as RDialog from '@radix-ui/react-dialog'
import * as RDropdown from '@radix-ui/react-dropdown-menu'
import * as RPopover from '@radix-ui/react-popover'
import * as RSwitch from '@radix-ui/react-switch'
import * as RSlider from '@radix-ui/react-slider'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn, colorFromString, initials } from '@/lib/utils'
import type { StatusMeta } from '@/lib/status'

// ---------- Button

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'icon' | 'icon-sm'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover shadow-[0_0_0_1px_rgba(139,92,246,.4)]',
  secondary: 'bg-raised text-fg hover:bg-hover border border-border',
  outline: 'border border-border text-fg-2 hover:text-fg hover:bg-hover',
  ghost: 'text-fg-2 hover:text-fg hover:bg-hover',
  danger: 'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20',
}
const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-[13px] gap-2',
  icon: 'h-8 w-8',
  'icon-sm': 'h-7 w-7',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-[background,color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
})

// ---------- Inputs

const fieldBase =
  'w-full rounded-md border border-border bg-bg px-2.5 text-[13px] text-fg placeholder:text-fg-3 transition-colors hover:border-[#3a3a48] focus:border-accent focus:outline-none disabled:opacity-50'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...p },
  ref,
) {
  return <input ref={ref} className={cn(fieldBase, 'h-8', className)} {...p} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...p }, ref) {
    return <textarea ref={ref} className={cn(fieldBase, 'min-h-[72px] resize-y py-2 leading-relaxed', className)} {...p} />
  },
)

export interface Option {
  value: string
  label: string
}

export function Select({
  options,
  placeholder,
  className,
  ...p
}: SelectHTMLAttributes<HTMLSelectElement> & { options: Option[]; placeholder?: string }) {
  return (
    <div className={cn('relative', className)}>
      <select className={cn(fieldBase, 'h-8 appearance-none pr-7')} {...p}>
        {placeholder != null && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-fg-3" />
    </div>
  )
}

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  className,
  ...p
}: { checked: boolean; indeterminate?: boolean; onChange: (v: boolean) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'checked'
>) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked
  }, [indeterminate, checked])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className={cn('size-3.5 cursor-pointer rounded', className)}
      {...p}
    />
  )
}

export function Switch({ checked, onChange, ...p }: { checked: boolean; onChange: (v: boolean) => void; 'aria-label'?: string }) {
  return (
    <RSwitch.Root
      checked={checked}
      onCheckedChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className="relative h-5 w-9 shrink-0 rounded-full bg-border transition-colors data-[state=checked]:bg-accent"
      {...p}
    >
      <RSwitch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px]" />
    </RSwitch.Root>
  )
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.1,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}) {
  return (
    <RSlider.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={([v]) => onChange(v)}
      className="relative flex h-5 w-full touch-none items-center select-none"
    >
      <RSlider.Track className="relative h-1 grow rounded-full bg-border">
        <RSlider.Range className="absolute h-full rounded-full bg-accent" />
      </RSlider.Track>
      <RSlider.Thumb className="block size-4 rounded-full border-2 border-accent bg-white shadow" aria-label="Значение" />
    </RSlider.Root>
  )
}

// ---------- Badges

export function StatusBadge({ meta, className }: { meta?: StatusMeta; className?: string }) {
  if (!meta) return <span className="text-fg-3">—</span>
  return (
    <span
      className={cn('inline-flex h-[22px] max-w-full items-center gap-1.5 rounded-full border px-2 text-xs font-medium whitespace-nowrap', className)}
      style={{ color: meta.color, backgroundColor: `${meta.color}1a`, borderColor: `${meta.color}40` }}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full bg-current', meta.pulse && 'pulse-dot')} />
      <span className="truncate">{meta.label}</span>
    </span>
  )
}

export function Badge({ children, color, className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={cn('inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium whitespace-nowrap', !color && 'bg-raised text-fg-2', className)}
      style={color ? { color, backgroundColor: `${color}1f` } : undefined}
    >
      {children}
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-bg px-1 font-mono text-[10px] text-fg-3">
      {children}
    </kbd>
  )
}

export function Avatar({ name, size = 28, src }: { name: string; size?: number; src?: string }) {
  if (src) return <img src={src} alt={name} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: colorFromString(name) }}
      title={name}
    >
      {initials(name) || '?'}
    </span>
  )
}

export function ProgressBar({ value, color = '#8B5CF6', className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-border', className)}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  )
}

export function Thumb({ src, className, alt = '' }: { src?: string; className?: string; alt?: string }) {
  const [err, setErr] = useState(false)
  if (!src || err) return <div className={cn('skeleton rounded', className)} />
  return <img src={src} alt={alt} loading="lazy" onError={() => setErr(true)} className={cn('rounded bg-raised object-cover', className)} />
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded', className)} />
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-raised text-fg-3 [&_svg]:size-6">{icon}</div>
      <div className="text-base font-semibold">{title}</div>
      {description && <div className="max-w-sm text-fg-2">{description}</div>}
      {action}
    </div>
  )
}

// ---------- Dropdown

export const DropdownMenu = RDropdown.Root
export const DropdownTrigger = RDropdown.Trigger

export function DropdownContent({ children, align = 'end', className }: { children: ReactNode; align?: 'start' | 'end' | 'center'; className?: string }) {
  return (
    <RDropdown.Portal>
      <RDropdown.Content
        align={align}
        sideOffset={6}
        className={cn('z-50 min-w-48 rounded-lg border border-border bg-raised p-1 shadow-2xl shadow-black/50', className)}
      >
        {children}
      </RDropdown.Content>
    </RDropdown.Portal>
  )
}

const itemCls =
  'flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] text-fg-2 outline-none select-none data-[highlighted]:bg-hover data-[highlighted]:text-fg [&_svg]:size-4'

export function DropdownItem({ children, onSelect, danger }: { children: ReactNode; onSelect?: () => void; danger?: boolean }) {
  return (
    <RDropdown.Item onSelect={onSelect} className={cn(itemCls, danger && 'text-danger data-[highlighted]:text-danger')}>
      {children}
    </RDropdown.Item>
  )
}

export function DropdownCheckItem({ children, checked, onChange }: { children: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <RDropdown.CheckboxItem checked={checked} onCheckedChange={onChange} onSelect={(e) => e.preventDefault()} className={itemCls}>
      <span className={cn('flex size-4 items-center justify-center rounded border border-border', checked && 'border-accent bg-accent text-white')}>
        {checked && <Check className="!size-3" />}
      </span>
      {children}
    </RDropdown.CheckboxItem>
  )
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <RDropdown.Label className="px-2 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-fg-3 uppercase">{children}</RDropdown.Label>
}

export const DropdownSeparator = () => <RDropdown.Separator className="my-1 h-px bg-border" />

// ---------- MultiSelect (фильтр)

export function MultiSelectFilter({
  label,
  options,
  value,
  onChange,
  renderOption,
}: {
  label: string
  options: Option[]
  value: string[]
  onChange: (v: string[]) => void
  renderOption?: (o: Option) => ReactNode
}) {
  const active = value.length > 0
  return (
    <RPopover.Root>
      <RPopover.Trigger asChild>
        <Button variant="outline" className={cn(active && 'border-accent/50 bg-accent/10 text-fg')}>
          {label}
          {active && <span className="rounded bg-accent px-1 text-[11px] text-white">{value.length}</span>}
          <ChevronDown className="!size-3.5 opacity-60" />
        </Button>
      </RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content align="start" sideOffset={6} className="z-50 w-56 rounded-lg border border-border bg-raised p-1 shadow-2xl shadow-black/50">
          {options.map((o) => {
            const checked = value.includes(o.value)
            return (
              <button
                key={o.value}
                onClick={() => onChange(checked ? value.filter((x) => x !== o.value) : [...value, o.value])}
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-fg-2 hover:bg-hover hover:text-fg"
              >
                <span className={cn('flex size-4 shrink-0 items-center justify-center rounded border border-border', checked && 'border-accent bg-accent text-white')}>
                  {checked && <Check className="size-3" />}
                </span>
                {renderOption ? renderOption(o) : o.label}
              </button>
            )
          })}
          {active && (
            <>
              <div className="my-1 h-px bg-border" />
              <button onClick={() => onChange([])} className="flex h-8 w-full items-center rounded-md px-2 text-[13px] text-fg-3 hover:bg-hover hover:text-fg">
                Сбросить
              </button>
            </>
          )}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  )
}

// ---------- Dialog

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Удалить',
  onConfirm,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  onConfirm: () => void
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <RDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-2xl">
          <RDialog.Title className="text-base font-semibold">{title}</RDialog.Title>
          {description && <RDialog.Description className="mt-2 text-fg-2">{description}</RDialog.Description>}
          <div className="mt-5 flex justify-end gap-2">
            <RDialog.Close asChild>
              <Button variant="ghost">Отмена</Button>
            </RDialog.Close>
            <Button
              variant="danger"
              className="bg-danger text-white hover:bg-danger/90"
              autoFocus
              onClick={() => {
                onConfirm()
                onOpenChange(false)
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}

export function Modal({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <RDialog.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-50 w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <RDialog.Title className="text-base font-semibold">{title}</RDialog.Title>
            <RDialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Закрыть">
                <X />
              </Button>
            </RDialog.Close>
          </div>
          <div className="p-5">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}

// ---------- Tabs (простые)

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div role="tablist" className={cn('flex gap-1 border-b border-border px-4', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'relative -mb-px flex h-9 items-center gap-1.5 px-2 text-[13px] font-medium text-fg-3 transition-colors hover:text-fg',
            value === t.value && 'text-fg after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode; title?: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex h-8 items-center rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex h-full items-center rounded px-2 text-xs text-fg-3 hover:text-fg [&_svg]:size-3.5',
            value === o.value && 'bg-raised text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
