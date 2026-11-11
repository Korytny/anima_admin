import type { Modifier } from '@dnd-kit/core'

// Аналог @dnd-kit/modifiers restrictToVerticalAxis — чтобы не тянуть лишний пакет.
export const restrictToVerticalAxisModifier: Modifier = ({ transform }) => ({ ...transform, x: 0 })
export const restrictToHorizontalAxisModifier: Modifier = ({ transform }) => ({ ...transform, y: 0 })
