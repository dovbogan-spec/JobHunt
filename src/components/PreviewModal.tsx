import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import ReactDOM from "react-dom";

type PreviewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;

const getDefaultZoom = () => {
  if (typeof window === "undefined") return 1;
  return window.matchMedia("(max-width: 768px)").matches ? 0.8 : 1;
};

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(zoom.toFixed(1))));

export function PreviewModal({ isOpen, onClose, children }: PreviewModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const pageWrapperRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const [zoom, setZoom] = useState(getDefaultZoom);
  const [scaledHeight, setScaledHeight] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setZoom(getDefaultZoom());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !pageWrapperRef.current) return;

    const measure = () => {
      const rawHeight = pageWrapperRef.current?.scrollHeight ?? 0;
      setScaledHeight(rawHeight * zoom);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pageWrapperRef.current);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [children, isOpen, zoom]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusCloseButton = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !modalRef.current) return;
      const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusCloseButton);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const onBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleZoomOut = () => {
    setZoom((currentZoom) => clampZoom(currentZoom - ZOOM_STEP));
  };

  const handleZoomIn = () => {
    setZoom((currentZoom) => clampZoom(currentZoom + ZOOM_STEP));
  };

  return ReactDOM.createPortal(
    <div className="preview-modal-backdrop" onClick={onBackdropClick}>
      <div className="preview-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="preview-modal-header">
          <h3 id={titleId}>Preview</h3>
          <div className="preview-modal-header-controls">
            <span className="preview-modal-zoom-icon" aria-hidden="true">
              🔍
            </span>
            <button type="button" className="round-icon-button" onClick={handleZoomOut} aria-label="Zoom out">
              −
            </button>
            <span className="preview-modal-zoom-label" aria-live="polite">
              {Math.round(zoom * 100)}%
            </span>
            <button type="button" className="round-icon-button" onClick={handleZoomIn} aria-label="Zoom in">
              +
            </button>
            <button ref={closeButtonRef} type="button" className="round-icon-button" onClick={onClose} aria-label="Close preview modal">
              ✕
            </button>
          </div>
        </header>
        <div className="preview-modal-body">
          <div className="preview-modal-scroll-container">
            <div className="preview-modal-stage-wrapper" style={{ minHeight: `${scaledHeight}px` }}>
              <div
                className="preview-modal-page-wrapper"
                ref={pageWrapperRef}
                style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
              >
                {children}
              </div>
            </div>
          </div>
        </div>
        <footer className="preview-modal-footer">
          <button type="button" className="primary" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
