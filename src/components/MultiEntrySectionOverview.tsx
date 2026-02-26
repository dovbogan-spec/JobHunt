import { useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type MultiEntryOverviewRow = {
  id: string;
  title: string;
  subtitle?: string;
  dateSummary?: string;
  visible?: boolean;
};

type MultiEntrySectionOverviewProps = {
  rows: MultiEntryOverviewRow[];
  addLabel: string;
  emptyMessage: string;
  onAddEntry: () => void;
  onSelectRow: (rowId: string) => void;
  onToggleVisibility?: (rowId: string) => void;
  supportsOrdering?: boolean;
  onMoveRow?: (fromIndex: number, toIndex: number) => void;
  topActionSlot?: ReactNode;
  containerRef?: (node: HTMLDivElement | null) => void;
};

type SortableOverviewRowProps = {
  row: MultiEntryOverviewRow;
  onSelectRow: (rowId: string) => void;
  onToggleVisibility?: (rowId: string) => void;
};

function SortableOverviewRow({ row, onSelectRow, onToggleVisibility }: SortableOverviewRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={`multi-entry-overview-row ${isDragging ? "is-dragging" : ""}`}>
      <div className="multi-entry-overview-ordering" aria-label="Reorder entry controls">
        <button
          type="button"
          className={`section-drag-handle ${isDragging ? "is-dragging" : ""}`}
          title="Drag to reorder"
          aria-label={`Drag to reorder ${row.title || "entry"}`}
          {...attributes}
          {...listeners}
        >
          {Array.from({ length: 6 }).map((_, dotIndex) => (
            <span key={`${row.id}-dot-${dotIndex}`} aria-hidden="true" className="section-drag-dot" />
          ))}
        </button>
      </div>

      <button type="button" className="multi-entry-overview-main" onClick={() => onSelectRow(row.id)}>
        <span className="multi-entry-overview-title">{row.title || "Untitled entry"}</span>
        {row.subtitle ? <span className="multi-entry-overview-subtitle">{row.subtitle}</span> : null}
        {row.dateSummary ? <span className="multi-entry-overview-date">{row.dateSummary}</span> : null}
      </button>

      {onToggleVisibility && (
        <button
          type="button"
          className="section-visibility-btn"
          onClick={() => onToggleVisibility(row.id)}
          title={row.visible !== false ? "Hide entry" : "Show entry"}
          aria-label={row.visible !== false ? "Hide entry" : "Show entry"}
        >
          {row.visible !== false ? "👁" : "🙈"}
        </button>
      )}
    </div>
  );
}

function OverviewRowPreview({ row }: { row: MultiEntryOverviewRow }) {
  return (
    <div className="multi-entry-overview-row drag-overlay">
      <div className="multi-entry-overview-ordering" aria-hidden="true">
        <span className="section-drag-handle is-dragging">
          {Array.from({ length: 6 }).map((_, dotIndex) => (
            <span key={`${row.id}-overlay-dot-${dotIndex}`} className="section-drag-dot" />
          ))}
        </span>
      </div>
      <div className="multi-entry-overview-main">
        <span className="multi-entry-overview-title">{row.title || "Untitled entry"}</span>
        {row.subtitle ? <span className="multi-entry-overview-subtitle">{row.subtitle}</span> : null}
        {row.dateSummary ? <span className="multi-entry-overview-date">{row.dateSummary}</span> : null}
      </div>
    </div>
  );
}

export function MultiEntrySectionOverview({
  rows,
  addLabel,
  emptyMessage,
  onAddEntry,
  onSelectRow,
  onToggleVisibility,
  supportsOrdering = false,
  onMoveRow,
  topActionSlot,
  containerRef,
}: MultiEntrySectionOverviewProps) {
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 180,
        tolerance: 8,
      },
    }),
  );

  const activeRow = useMemo(() => rows.find((row) => row.id === activeRowId) || null, [activeRowId, rows]);

  function handleDragStart(event: DragStartEvent) {
    setActiveRowId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveRowId(null);

    if (!onMoveRow || !over || active.id === over.id) return;

    const oldIndex = rows.findIndex((row) => row.id === String(active.id));
    const newIndex = rows.findIndex((row) => row.id === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    onMoveRow(oldIndex, newIndex);
  }

  return (
    <div className="structured-editor-list">
      <div className="entry-overview-actions-row">
        <button className="small-action add-entry-top-btn" onClick={onAddEntry}>
          {addLabel}
        </button>
        {topActionSlot}
      </div>

      {supportsOrdering && onMoveRow ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveRowId(null)}>
          <div className="multi-entry-overview-list" ref={containerRef}>
            <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
              {rows.map((row) => (
                <SortableOverviewRow key={row.id} row={row} onSelectRow={onSelectRow} onToggleVisibility={onToggleVisibility} />
              ))}
            </SortableContext>
          </div>
          <DragOverlay>
            {activeRow ? <OverviewRowPreview row={activeRow} /> : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="multi-entry-overview-list" ref={containerRef}>
          {rows.map((row) => (
            <div className="multi-entry-overview-row" key={row.id}>
              <button type="button" className="multi-entry-overview-main" onClick={() => onSelectRow(row.id)}>
                <span className="multi-entry-overview-title">{row.title || "Untitled entry"}</span>
                {row.subtitle ? <span className="multi-entry-overview-subtitle">{row.subtitle}</span> : null}
                {row.dateSummary ? <span className="multi-entry-overview-date">{row.dateSummary}</span> : null}
              </button>

              {onToggleVisibility && (
                <button
                  type="button"
                  className="section-visibility-btn"
                  onClick={() => onToggleVisibility(row.id)}
                  title={row.visible !== false ? "Hide entry" : "Show entry"}
                  aria-label={row.visible !== false ? "Hide entry" : "Show entry"}
                >
                  {row.visible !== false ? "👁" : "🙈"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 && <p className="editor-empty-state">{emptyMessage}</p>}
    </div>
  );
}
