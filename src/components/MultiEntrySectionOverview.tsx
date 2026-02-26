import type { ReactNode } from "react";

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
  function move(index: number, direction: -1 | 1) {
    if (!onMoveRow) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= rows.length) return;
    onMoveRow(index, nextIndex);
  }

  return (
    <div className="structured-editor-list">
      <div className="entry-overview-actions-row">
        <button className="small-action add-entry-top-btn" onClick={onAddEntry}>
          {addLabel}
        </button>
        {topActionSlot}
      </div>

      <div className="multi-entry-overview-list" ref={containerRef}>
        {rows.map((row, index) => (
          <div className="multi-entry-overview-row" key={row.id}>
            {supportsOrdering && (
              <div className="multi-entry-overview-ordering" aria-label="Reorder entry controls">
                <button type="button" className="drag-handle" title="Drag handle" aria-hidden="true" disabled>
                  ⋮⋮
                </button>
                <div className="field-reorder-buttons">
                  <button
                    type="button"
                    className="reorder-btn"
                    onClick={() => move(index, -1)}
                    disabled={!onMoveRow || index === 0}
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="reorder-btn"
                    onClick={() => move(index, 1)}
                    disabled={!onMoveRow || index === rows.length - 1}
                    title="Move down"
                  >
                    ↓
                  </button>
                </div>
              </div>
            )}

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

      {rows.length === 0 && <p className="editor-empty-state">{emptyMessage}</p>}
    </div>
  );
}
