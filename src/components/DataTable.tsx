import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnOrderState,
  type ColumnSizingState,
  type Header,
  type OnChangeFn,
  type Row,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToHorizontalAxisModifier, restrictToVerticalAxisModifier } from './dnd'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, ArrowUpDown, GripVertical, Rows2, Rows3, Rows4, Settings2 } from 'lucide-react'
import { cn, usePersistentState } from '@/lib/utils'
import {
  Button,
  Checkbox,
  DropdownCheckItem,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSeparator,
  DropdownTrigger,
  SegmentedControl,
  Skeleton,
} from './ui'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string
    className?: string
    /** столбец создан автоматически из поля записи */
    auto?: boolean
  }
}

export type Density = 'compact' | 'default' | 'comfortable'
const ROW_H: Record<Density, number> = { compact: 32, default: 40, comfortable: 56 }

interface Props<T> {
  data: T[]
  columns: ColumnDef<T, any>[]
  getRowId: (row: T) => string
  storageKey: string
  rowSelection: RowSelectionState
  onRowSelectionChange: OnChangeFn<RowSelectionState>
  activeId?: string | null
  onRowClick?: (row: T) => void
  loading?: boolean
  toolbar?: ReactNode
  toolbarRight?: ReactNode
  empty?: ReactNode
  defaultHidden?: VisibilityState
  /** Перетаскивание строк (без виртуализации). Работает только без сортировки. */
  reorderable?: boolean
  onReorder?: (activeId: string, overId: string) => void
  footer?: ReactNode
}

export function DataTable<T>({
  data,
  columns: userColumns,
  getRowId,
  storageKey,
  rowSelection,
  onRowSelectionChange,
  activeId,
  onRowClick,
  loading,
  toolbar,
  toolbarRight,
  empty,
  defaultHidden = {},
  reorderable,
  onReorder,
  footer,
}: Props<T>) {
  const [sorting, setSorting] = usePersistentState<SortingState>(`${storageKey}:sorting`, [])
  const [visibility, setVisibility] = usePersistentState<VisibilityState>(`${storageKey}:columns`, defaultHidden)
  const [density, setDensity] = usePersistentState<Density>(`${storageKey}:density`, 'default')
  // Ширина и порядок столбцов — перетаскиванием в заголовке, хранятся в localStorage
  const [sizing, setSizing] = usePersistentState<ColumnSizingState>(`${storageKey}:sizes`, {})
  const [order, setOrder] = usePersistentState<ColumnOrderState>(`${storageKey}:order`, [])
  const rowH = ROW_H[density]

  // Все поля записей, для которых нет своего столбца, — автоматически (скрыты, включаются в «Настройке столбцов»).
  // Так в таблице доступны все колонки БД, включая новые.
  const autoKeys = useMemo(() => {
    const covered = new Set(userColumns.flatMap((c) => [(c as { accessorKey?: string }).accessorKey, c.id].filter(Boolean) as string[]))
    const keys = new Set<string>()
    for (const row of data.slice(0, 50)) for (const k of Object.keys(row as object)) if (!covered.has(k)) keys.add(k)
    return [...keys].sort()
  }, [data, userColumns])
  const autoColumns = useMemo<ColumnDef<T, any>[]>(
    () =>
      autoKeys.map((k) => ({
        id: k,
        accessorFn: (row: T) => (row as Record<string, unknown>)[k],
        header: k,
        size: 160,
        meta: { label: k, auto: true },
        cell: ({ getValue }) => {
          const text = fmtCell(getValue())
          return (
            <span className="font-mono text-xs text-fg-2" title={text}>
              {text || '—'}
            </span>
          )
        },
      })),
    [autoKeys],
  )
  const effectiveVisibility = useMemo(() => ({ ...Object.fromEntries(autoKeys.map((k) => [k, false])), ...visibility }), [autoKeys, visibility])

  const columns = useMemo<ColumnDef<T, any>[]>(
    () => [
      {
        id: 'select',
        size: 40,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
        header: ({ table }) => (
          <Checkbox
            aria-label="Выбрать все"
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onChange={(v) => table.toggleAllRowsSelected(v)}
          />
        ),
        cell: ({ row }) => <Checkbox aria-label="Выбрать строку" checked={row.getIsSelected()} onChange={(v) => row.toggleSelected(v)} />,
      },
      ...userColumns,
      ...autoColumns,
    ],
    [userColumns, autoColumns],
  )

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: { sorting, columnVisibility: effectiveVisibility, rowSelection, columnSizing: sizing, columnOrder: order },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    onColumnSizingChange: setSizing,
    onColumnOrderChange: setOrder,
    columnResizeMode: 'onChange',
    defaultColumn: { minSize: 40 },
    onRowSelectionChange,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    sortDescFirst: false,
  })

  const rows = table.getRowModel().rows
  const colName = (c: { id: string; columnDef: ColumnDef<T, any> }) => c.columnDef.meta?.label ?? c.id
  const hiddenColumns = table
    .getAllLeafColumns()
    .filter((c) => c.getCanHide() && !c.getIsVisible())
    .sort((a, b) => colName(a).localeCompare(colName(b), 'ru'))
  const canReorder = !!reorderable && sorting.length === 0
  const scrollRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH,
    overscan: 12,
  })
  useEffect(() => virtualizer.measure(), [rowH, virtualizer])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) onReorder?.(String(e.active.id), String(e.over.id))
  }
  // Перестановка столбцов; «select» всегда первый
  const onColumnDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id || e.over.id === 'select') return
    const ids = table.getAllLeafColumns().map((c) => c.id)
    const from = ids.indexOf(String(e.active.id))
    const to = ids.indexOf(String(e.over.id))
    if (from >= 0 && to >= 0) setOrder(arrayMove(ids, from, to))
  }
  const resetView = () => {
    setVisibility(defaultHidden)
    setSizing({})
    setOrder([])
  }

  const visibleRows: { row: Row<T>; key: string | number }[] = canReorder
    ? rows.map((row) => ({ row, key: row.id }))
    : virtualizer.getVirtualItems().map((vi) => ({ row: rows[vi.index], key: vi.key as string | number }))
  const vItems = virtualizer.getVirtualItems()
  const padTop = canReorder ? 0 : (vItems[0]?.start ?? 0)
  const padBottom = canReorder ? 0 : virtualizer.getTotalSize() - (vItems[vItems.length - 1]?.end ?? 0)
  const colCount = table.getVisibleLeafColumns().length + 1 // + столбец-заполнитель
  const selectedCount = Object.keys(rowSelection).length

  const body = (
    <tbody>
      {padTop > 0 && (
        <tr>
          <td colSpan={colCount} style={{ height: padTop }} />
        </tr>
      )}
      {visibleRows.map(({ row, key }) => (
        <TableRow
          key={key}
          row={row}
          height={rowH}
          active={row.id === activeId}
          sortable={canReorder}
          onClick={onRowClick ? () => onRowClick(row.original) : undefined}
        />
      ))}
      {padBottom > 0 && (
        <tr>
          <td colSpan={colCount} style={{ height: padBottom }} />
        </tr>
      )}
    </tbody>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        {toolbar}
        <div className="ml-auto flex items-center gap-2">
          {toolbarRight}
          <SegmentedControl<Density>
            value={density}
            onChange={setDensity}
            options={[
              { value: 'compact', label: <Rows4 />, title: 'Компактно' },
              { value: 'default', label: <Rows3 />, title: 'Обычно' },
              { value: 'comfortable', label: <Rows2 />, title: 'Просторно' },
            ]}
          />
          <DropdownMenu>
            <DropdownTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Настройка столбцов" title="Настройка столбцов">
                <Settings2 />
              </Button>
            </DropdownTrigger>
            <DropdownContent className="max-h-[70vh] overflow-auto">
              {/* Показанные — в порядке таблицы; скрытые — по алфавиту. Отметка переносит столбец между группами. */}
              <DropdownLabel>Столбцы</DropdownLabel>
              {table
                .getVisibleLeafColumns()
                .filter((c) => c.getCanHide())
                .map((c) => (
                  <DropdownCheckItem key={c.id} checked onChange={(v) => c.toggleVisibility(v)}>
                    <ColumnName column={c} />
                  </DropdownCheckItem>
                ))}
              {hiddenColumns.length > 0 && (
                <>
                  <DropdownSeparator />
                  <DropdownLabel>Остальные поля</DropdownLabel>
                  {hiddenColumns.map((c) => (
                    <DropdownCheckItem key={c.id} checked={false} onChange={(v) => c.toggleVisibility(v)}>
                      <ColumnName column={c} />
                    </DropdownCheckItem>
                  ))}
                </>
              )}
              <DropdownSeparator />
              <div className="px-2 py-1 text-[11px] text-fg-3">Ширина — край заголовка, порядок — перетащить заголовок</div>
              <DropdownItem onSelect={resetView}>Сбросить столбцы, ширину и порядок</DropdownItem>
            </DropdownContent>
          </DropdownMenu>
        </div>
      </div>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-separate border-spacing-0" style={{ minWidth: table.getTotalSize() }}>
          <colgroup>
            {table.getVisibleLeafColumns().map((c) => (
              <col key={c.id} style={{ width: c.getSize() }} />
            ))}
            <col />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onColumnDragEnd} modifiers={[restrictToHorizontalAxisModifier]}>
              {table.getHeaderGroups().map((hg) => (
                <SortableContext key={hg.id} items={hg.headers.map((h) => h.column.id)} strategy={horizontalListSortingStrategy}>
                  <tr>
                    {hg.headers.map((h) => (
                      <HeaderCell key={h.id} header={h} />
                    ))}
                    <th className="h-9 border-b border-border" />
                  </tr>
                </SortableContext>
              ))}
            </DndContext>
          </thead>
          {loading ? (
            <tbody>
              {Array.from({ length: 12 }).map((_, i) => (
                <tr key={i}>
                  {table.getVisibleLeafColumns().map((c) => (
                    <td key={c.id} className="border-b border-border/60 px-3" style={{ height: rowH }}>
                      <Skeleton className="h-3.5 w-3/4" />
                    </td>
                  ))}
                  <td className="border-b border-border/60" />
                </tr>
              ))}
            </tbody>
          ) : canReorder ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxisModifier]}>
              <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                {body}
              </SortableContext>
            </DndContext>
          ) : (
            body
          )}
        </table>
        {!loading && rows.length === 0 && empty}
      </div>

      <div className="flex h-9 shrink-0 items-center gap-4 border-t border-border px-4 text-xs text-fg-3">
        <span>
          Всего: <span className="text-fg-2">{rows.length}</span>
        </span>
        {selectedCount > 0 && (
          <span>
            Выбрано: <span className="text-accent-hover">{selectedCount}</span>
          </span>
        )}
        {reorderable && !canReorder && <span>Сбросьте сортировку, чтобы перетаскивать строки</span>}
        <div className="ml-auto">{footer}</div>
      </div>
    </div>
  )
}

/** Название столбца в меню: свои — по label, автоматические (поля БД) — моноширинно по имени поля. */
function ColumnName<T>({ column: c }: { column: { id: string; columnDef: ColumnDef<T, any> } }) {
  return c.columnDef.meta?.auto ? <span className="font-mono text-xs">{c.id}</span> : <>{c.columnDef.meta?.label ?? c.id}</>
}

/** Значение поля записи одной строкой: массивы через запятую, объекты — JSON. */
function fmtCell(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** Заголовок столбца: клик — сортировка, перетаскивание — порядок, правый край — ширина (двойной клик — сброс). */
function HeaderCell<T>({ header: h }: { header: Header<T, unknown> }) {
  const col = h.column
  const fixed = col.id === 'select'
  const s = useSortable({ id: col.id, disabled: fixed })
  const sort = col.getIsSorted()
  const canSort = col.getCanSort()
  const style: CSSProperties = {
    transform: CSS.Translate.toString(s.transform),
    transition: s.transition,
    position: 'relative',
    zIndex: s.isDragging ? 5 : undefined,
  }
  return (
    <th
      ref={s.setNodeRef}
      style={style}
      {...(fixed ? {} : s.listeners)}
      aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : undefined}
      className={cn(
        'h-9 border-b border-border px-3 text-left text-xs font-medium whitespace-nowrap text-fg-3',
        !fixed && 'cursor-grab active:cursor-grabbing',
        s.isDragging && 'bg-raised shadow-lg shadow-black/30',
        col.columnDef.meta?.className,
      )}
    >
      {canSort ? (
        <button className="group inline-flex max-w-full items-center gap-1 hover:text-fg" onClick={col.getToggleSortingHandler()}>
          <span className="truncate">{flexRender(col.columnDef.header, h.getContext())}</span>
          {sort === 'asc' ? (
            <ArrowUp className="size-3 text-accent" />
          ) : sort === 'desc' ? (
            <ArrowDown className="size-3 text-accent" />
          ) : (
            <ArrowUpDown className="size-3 opacity-0 group-hover:opacity-60" />
          )}
        </button>
      ) : (
        flexRender(col.columnDef.header, h.getContext())
      )}
      {col.getCanResize() && (
        <div
          role="separator"
          aria-orientation="vertical"
          title="Ширина столбца (двойной клик — сброс)"
          onMouseDown={h.getResizeHandler()}
          onTouchStart={h.getResizeHandler()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={() => col.resetSize()}
          className={cn(
            'absolute top-1.5 right-0 bottom-1.5 w-1.5 cursor-col-resize touch-none border-r border-border select-none hover:border-accent hover:bg-accent/40',
            col.getIsResizing() && 'border-accent bg-accent/60',
          )}
        />
      )}
    </th>
  )
}

interface RowProps<T> {
  row: Row<T>
  height: number
  active: boolean
  sortable: boolean
  onClick?: () => void
}

function TableRow<T>(props: RowProps<T>) {
  return props.sortable ? <SortableRow {...props} /> : <RowView {...props} />
}

function SortableRow<T>(props: RowProps<T>) {
  const s = useSortable({ id: props.row.id })
  const style: CSSProperties = {
    transform: CSS.Translate.toString(s.transform),
    transition: s.transition,
    position: 'relative',
    zIndex: s.isDragging ? 5 : undefined,
  }
  return <RowView {...props} dnd={{ ref: s.setNodeRef, style, attrs: { ...s.attributes, ...s.listeners }, dragging: s.isDragging }} />
}

function RowView<T>({
  row,
  height,
  active,
  sortable,
  onClick,
  dnd,
}: RowProps<T> & {
  dnd?: { ref: (el: HTMLElement | null) => void; style: CSSProperties; attrs: Record<string, unknown>; dragging: boolean }
}) {
  const selected = row.getIsSelected()
  const s = { isDragging: dnd?.dragging ?? false }
  return (
    <tr
      ref={dnd?.ref}
      style={dnd?.style}
      {...(dnd?.attrs ?? {})}
      onClick={onClick}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onClick?.()
      }}
      data-state={selected ? 'selected' : undefined}
      className={cn(
        'group cursor-default transition-colors duration-150 outline-none hover:bg-hover focus-visible:bg-hover',
        selected && 'bg-accent/[0.06]',
        active && 'bg-accent/10 hover:bg-accent/15',
        s.isDragging && 'bg-raised shadow-xl shadow-black/40',
      )}
    >
      {row.getVisibleCells().map((cell, i) => (
        <td
          key={cell.id}
          style={{ height }}
          className={cn(
            'overflow-hidden border-b border-border/60 px-3 text-[13px] text-ellipsis whitespace-nowrap',
            i === 0 && active && 'shadow-[inset_2px_0_0_var(--color-accent)]',
            cell.column.columnDef.meta?.className,
          )}
        >
          {i === 0 && sortable ? (
            <span className="flex items-center gap-1">
              <GripVertical className="-ml-2 size-3.5 cursor-grab text-fg-3 opacity-0 group-hover:opacity-100" />
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </span>
          ) : (
            flexRender(cell.column.columnDef.cell, cell.getContext())
          )}
        </td>
      ))}
      <td className="border-b border-border/60" />
    </tr>
  )
}
