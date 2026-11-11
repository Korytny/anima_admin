// Настройки интерфейса (столбцы таблиц, раскладка карточек, плотность, сайдбар) живут в localStorage браузера.
// Эталон владельца лежит в корне проекта — ui-settings.json (экспорт кнопкой в «Настройки → Интерфейс»).
// При старте админка применяет эталон, если он новее уже применённого (по exported_at): ключи эталона перезаписываются,
// остальные настройки пользователя не трогаются. Навигация (фильтры, выбранный сезон/ролик) и сессия (sb-*) не входят.

const APPLIED_KEY = 'ui:settings-applied'

/** Ключи «внешнего вида», которые переносятся. */
const isUiKey = (k: string) => /:(columns|sizes|order|density|sorting|layout)$/.test(k) || k === 'ui:sidebar-collapsed'

interface UiSettingsFile {
  kind: 'anima-admin-ui'
  exported_at: string
  settings: Record<string, string> // ключ → сырое значение localStorage
}

export function exportUiSettings(): string {
  const settings: Record<string, string> = {}
  for (const k of Object.keys(localStorage).filter(isUiKey).sort()) settings[k] = localStorage.getItem(k)!
  const file: UiSettingsFile = { kind: 'anima-admin-ui', exported_at: new Date().toISOString(), settings }
  return JSON.stringify(file, null, 2) + '\n'
}

// Файла может не быть — тогда glob пустой и ничего не применяется
const bundled = Object.values(import.meta.glob<UiSettingsFile>('/ui-settings.json', { eager: true, import: 'default' }))[0]

/** Вызывается до рендера (main.tsx). */
export function applyBundledUiSettings() {
  try {
    if (bundled?.kind !== 'anima-admin-ui' || !bundled.settings) return
    if (localStorage.getItem(APPLIED_KEY) === bundled.exported_at) return
    for (const [k, v] of Object.entries(bundled.settings)) if (isUiKey(k) && typeof v === 'string') localStorage.setItem(k, v)
    localStorage.setItem(APPLIED_KEY, bundled.exported_at)
  } catch {
    /* localStorage недоступен — работаем с умолчаниями */
  }
}
