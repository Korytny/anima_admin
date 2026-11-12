// Визуальные стили производства фото. Выбирается один на сезон (seasons.style = id).
// LoRA лежат на сервере ComfyUI; имена файлов и силу впишем, когда будут известны.
// При генерации кадра стиль уходит в вебхук (api/pipeline.ts → style), n8n подставляет LoRA в процесс.

export interface VisualStyle {
  id: string
  title: string
  /** На что похоже — подпись, не название. */
  like: string
  description: string
  /** Файл LoRA в ComfyUI/models/loras (пусто — ещё не задан). */
  lora: string
  /** Сила LoRA (model strength), null — не задана. */
  strength: number | null
  /** Слова-триггеры LoRA — добавляются в промпт. */
  trigger: string
  /** Добавка к промпту кадра. */
  promptSuffix: string
  /** Пример кадра — файл в приложении: public/style-previews/ (png/jpg). */
  preview: string
  /** Цвет акцента карточки. */
  color: string
}

export const STYLES: VisualStyle[] = [
  {
    id: 'smooth3d',
    title: '3D Smooth',
    like: 'в духе Pixar',
    description: 'Объёмная 3D-анимация: мягкий свет, гладкие формы, выразительные лица. Семейный тон.',
    lora: '',
    strength: null,
    trigger: '',
    promptSuffix: '3D animated feature film style, smooth stylized shading, soft global illumination, expressive faces',
    preview: '/style-previews/smooth3d.png',
    color: '#3B82F6',
  },
  {
    id: 'watercolor',
    title: 'Акварельное аниме',
    like: 'в духе Миядзаки',
    description: 'Рисованная 2D-анимация: акварельные фоны, тёплый естественный свет, много природы и воздуха.',
    lora: '',
    strength: null,
    trigger: '',
    promptSuffix: 'hand-painted 2D anime film style, soft watercolor backgrounds, warm natural light, gentle colors',
    preview: '/style-previews/watercolor.png',
    color: '#10B981',
  },
  {
    id: 'scifi',
    title: 'Sci-fi',
    like: 'в духе Final Fantasy',
    description: 'Кинематографичная CGI-фантастика: детальные костюмы и доспехи, драматичный объёмный свет.',
    lora: '',
    strength: null,
    trigger: '',
    promptSuffix: 'cinematic sci-fi fantasy CGI style, highly detailed costumes and armor, dramatic volumetric lighting',
    preview: '/style-previews/scifi.jpg',
    color: '#8B5CF6',
  },
  {
    id: 'steampunk',
    title: 'Стимпанк',
    like: 'в духе Arcane',
    description: 'Живописный 3D с рисованными текстурами: латунь и медь, механизмы, контрастный контровой свет.',
    lora: '',
    strength: null,
    trigger: '',
    promptSuffix: 'painterly 3D style with hand-painted textures, steampunk details, brass and copper, moody rim lighting',
    preview: '/style-previews/steampunk.jpg',
    color: '#F59E0B',
  },
]

export const styleById = (id: string | null | undefined) => STYLES.find((s) => s.id === id)
