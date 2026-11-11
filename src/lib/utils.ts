import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNowStrict } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

export function fmtDuration(sec?: number | null) {
  if (sec == null || Number.isNaN(sec)) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function fmtBytes(n?: number | null) {
  if (n == null) return '—'
  const u = ['Б', 'КБ', 'МБ', 'ГБ']
  let i = 0
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`
}

export function timeAgo(iso?: string | null) {
  if (!iso) return '—'
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: ru })
}

export function fmtDateTime(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}

export function storageGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

/** useState, синхронизированный с localStorage. */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => storageGet(key, initial))
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* ignore */
    }
  }, [key, value])
  return [value, setValue] as const
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const esc = (v: unknown) => {
    const s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

/** По http (не localhost) navigator.clipboard недоступен — копируем через скрытый textarea. */
function legacyCopy(text: string) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
  document.body.appendChild(ta)
  ta.select()
  const ok = document.execCommand('copy')
  ta.remove()
  if (!ok) throw new Error('execCommand copy failed')
}

export async function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text)
    else legacyCopy(text)
    toast.success('Скопировано', { description: text.length > 60 ? text.slice(0, 60) + '…' : text })
  } catch {
    toast.error('Не удалось скопировать')
  }
}

export function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

/** Глобальная горячая клавиша. combo: 'mod+s', 'n', 'escape' */
export function useHotkey(combo: string, handler: (e: KeyboardEvent) => void, opts: { enabled?: boolean; allowInInput?: boolean } = {}) {
  const { enabled = true, allowInInput = false } = opts
  const ref = useRef(handler)
  ref.current = handler
  const cb = useCallback((e: KeyboardEvent) => ref.current(e), [])
  useEffect(() => {
    if (!enabled) return
    const parts = combo.toLowerCase().split('+')
    const key = parts.pop()!
    const needMod = parts.includes('mod')
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key) return
      if (needMod !== (e.metaKey || e.ctrlKey)) return
      if (!needMod && !allowInInput && isTypingTarget(e.target)) return
      cb(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [combo, cb, enabled, allowInInput])
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')

/** Стабильный цвет из строки — для аватаров. */
export function colorFromString(s: string) {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h} 60% 55%)`
}
