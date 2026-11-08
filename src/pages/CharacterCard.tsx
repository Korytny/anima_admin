import { useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import type { Character, Topic } from '@/types'
import { characterImages, characterTitle, useData } from '@/store/data'
import { useDraft } from '@/lib/useDraft'
import { copyText, fmtDateTime } from '@/lib/utils'
import { PanelFooter, PanelScroll, SidePanel } from '@/components/SidePanel'
import { FieldGroups, type GroupDef } from '@/components/FieldGroups'
import { Button, Kbd, Thumb } from '@/components/ui'
import { PathHint } from '@/components/PathHint'
import { characterPath } from '@/lib/media'

function groups(c: Character, topic: Topic | undefined): GroupDef<Character>[] {
  return [
  {
    title: 'Основное',
    fields: [
      { key: 'name' },
      { key: 'number', type: 'number', mono: true },
      { key: 'role_key', mono: true },
      { key: 'status' },
      { key: 'story', type: 'textarea', rows: 3 },
    ],
  },
  {
    title: 'Внешность',
    fields: [
      { key: 'text_prompt', type: 'textarea', rows: 5, mono: true },
      { key: 'full_body_prompt', type: 'textarea', rows: 4, mono: true },
      { key: 'base_img', type: 'url', mono: true, extra: (v, set) => <PathHint expected={characterPath(c, topic)} value={v} onChange={set} /> },
      { key: 'pers_file', type: 'url', mono: true },
      { key: 'filename', mono: true },
      { key: 'template', mono: true },
    ],
  },
  {
    title: 'Голос',
    defaultOpen: false,
    fields: [
      { key: 'voice_name', mono: true },
      { key: 'voice_profile', type: 'json', rows: 6 },
      { key: 'speed', type: 'number', mono: true },
      { key: 'style', type: 'number', mono: true },
      { key: 'stability', type: 'number', mono: true },
      { key: 'similarityBoost', type: 'number', mono: true },
    ],
  },
  {
    title: 'Системное',
    defaultOpen: false,
    fields: [
      { key: 'id', type: 'readonly' },
      { key: 'topic', type: 'readonly' },
      { key: 'character_set_id', mono: true },
      { key: 'created_at', type: 'readonly', render: (v) => fmtDateTime(v as string) },
    ],
  },
  ]
}

export function CharacterCard({ character, onClose, onDelete }: { character: Character | null; onClose: () => void; onDelete: (id: string) => void }) {
  return (
    <SidePanel
      open={!!character}
      onClose={onClose}
      panelKey={character?.id}
      header={character && <h2 className="truncate text-base font-semibold">{characterTitle(character)}</h2>}
    >
      {character && <Body key={character.id} character={character} onDelete={onDelete} />}
    </SidePanel>
  )
}

function Body({ character, onDelete }: { character: Character; onDelete: (id: string) => void }) {
  const { updateCharacter, topics } = useData()
  const topic = topics.find((t) => t.topic_id === character.topic)
  const { draft, set, reset, submit, dirty, dirtyKeys, saving } = useDraft(character, 'id', (patch) => updateCharacter(character.id, patch))
  const [img, setImg] = useState(0)
  if (!draft) return null
  const images = characterImages(character)

  return (
    <>
      <PanelScroll>
        <div className="space-y-2 p-4">
          <Thumb src={images[img] ?? images[0]} className="aspect-square max-h-80 w-full rounded-lg object-contain" />
          {images.length > 1 && (
            <div className="flex gap-1.5">
              {images.map((p, i) => (
                <button key={p + i} onClick={() => setImg(i)} className={`shrink-0 rounded ring-2 ${i === img ? 'ring-accent' : 'ring-transparent'}`}>
                  <Thumb src={p} className="size-12" />
                </button>
              ))}
            </div>
          )}
        </div>
        <FieldGroups groups={groups(draft, topic)} draft={draft} onChange={set} dirtyKeys={dirtyKeys} />
      </PanelScroll>

      <PanelFooter>
        {dirty ? (
          <>
            <Button variant="primary" onClick={submit} disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'} <Kbd>⌘S</Kbd>
            </Button>
            <Button variant="ghost" onClick={reset}>
              Отмена
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="icon" title="Скопировать ссылку" aria-label="Скопировать ссылку" onClick={() => copyText(location.href)}>
              <Copy />
            </Button>
            <Button variant="ghost" size="icon" className="ml-auto hover:text-danger" title="Удалить" aria-label="Удалить" onClick={() => onDelete(character.id)}>
              <Trash2 />
            </Button>
          </>
        )}
      </PanelFooter>
    </>
  )
}
