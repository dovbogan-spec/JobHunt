import { useEffect, useMemo, useRef, useState } from "react";
import { PICKER_THEMES } from "../theme/palette";
import { useTheme } from "../theme/ThemeProvider";

type PopoverAlign = "right" | "left";

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [displayExpanded, setDisplayExpanded] = useState(false);
  const [align, setAlign] = useState<PopoverAlign>("right");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const { themeKey, setThemeColor } = useTheme();

  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setDisplayExpanded(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setDisplayExpanded(false);
      }
    };

    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !popoverRef.current) return;
    const bounds = popoverRef.current.getBoundingClientRect();
    setAlign(bounds.left < 8 ? "left" : "right");
  }, [open]);

  const displayLabel = useMemo(() => (displayExpanded ? "Hide Display" : "Display"), [displayExpanded]);

  return (
    <div className="settings-container" ref={containerRef}>
      <button
        type="button"
        className="settings-gear-btn"
        aria-label="Settings"
        onClick={() => setOpen((prev) => !prev)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M10.3 2.8a1.1 1.1 0 0 1 1.4 0l1.1 1 .2.1c.4.1.7.3 1.1.5l.3.1 1.5-.3a1.1 1.1 0 0 1 1.2.7l.8 1.6a1.1 1.1 0 0 1-.3 1.3l-1.2 1 .1.2c.2.4.3.8.4 1.2v.3l1.2 1a1.1 1.1 0 0 1 .3 1.3l-.8 1.6a1.1 1.1 0 0 1-1.2.7l-1.5-.3-.3.1a6 6 0 0 1-1.1.5l-.2.1-1.1 1a1.1 1.1 0 0 1-1.4 0l-1.1-1-.2-.1a6 6 0 0 1-1.1-.5l-.3-.1-1.5.3a1.1 1.1 0 0 1-1.2-.7l-.8-1.6a1.1 1.1 0 0 1 .3-1.3l1.2-1v-.3a6.4 6.4 0 0 1 .4-1.2l.1-.2-1.2-1a1.1 1.1 0 0 1-.3-1.3l.8-1.6a1.1 1.1 0 0 1 1.2-.7l1.5.3.3-.1c.3-.2.7-.4 1.1-.5l.2-.1 1.1-1Z" />
          <circle cx="12" cy="12" r="2.7" />
        </svg>
      </button>

      {open && (
        <div className={`settings-popover settings-popover-${align}`} role="dialog" aria-label="Settings menu" ref={popoverRef}>
          <button
            type="button"
            className={`settings-display-btn ${displayExpanded ? "active" : ""}`}
            onClick={() => setDisplayExpanded((prev) => !prev)}
            aria-expanded={displayExpanded}
          >
            {displayLabel}
          </button>
          {displayExpanded && (
            <div className="theme-picker-panel">
              <p className="theme-picker-title">Theme Color</p>
              <div className="theme-swatch-grid" role="list">
                {PICKER_THEMES.map((theme) => {
                  const isActive = theme.key === themeKey;
                  return (
                    <button
                      type="button"
                      key={theme.key}
                      role="listitem"
                      className={`theme-swatch-item ${isActive ? "selected" : ""}`}
                      onClick={() => setThemeColor(theme.key)}
                    >
                      <span className="theme-swatch-color" style={{ backgroundColor: theme.baseHex }} aria-hidden="true">
                        {isActive ? "✓" : ""}
                      </span>
                      <span className="theme-swatch-label">{theme.label} ({theme.code})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
