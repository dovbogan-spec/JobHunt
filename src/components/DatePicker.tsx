import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  MONTH_LABELS,
  formatMonthYear,
  getYearPage,
  isValueAfterMax,
  isValueBeforeMin,
  normalizeDateValue,
  parseMonthYear,
  toReadableValue,
  type DatePickerMode,
} from "../utils/datePicker";

type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  mode: DatePickerMode;
  allowPresent?: boolean;
  minDate?: string;
  maxDate?: string;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

const FOCUSABLE_SELECTOR = "button,[href],input,select,textarea,[tabindex]:not([tabindex='-1'])";

export function DatePicker({
  value,
  onChange,
  mode,
  allowPresent = false,
  minDate,
  maxDate,
  placeholder,
  ariaLabel,
  disabled = false,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"month" | "year">("month");
  const pickerId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const parsedValue = mode === "monthYear" ? parseMonthYear(value) : null;
  const now = useMemo(() => new Date(), []);
  const [displayYear, setDisplayYear] = useState(parsedValue?.year ?? now.getFullYear());


  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const onPointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (wrapperRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || !popoverRef.current) return;
    const firstFocusable = popoverRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    firstFocusable?.focus();
  }, [open, view]);

  const years = useMemo(() => getYearPage(displayYear), [displayYear]);

  const openPicker = () => {
    if (parsedValue?.year) setDisplayYear(parsedValue.year);
    setOpen(true);
  };

  const handleMonthPick = (monthIndex: number) => {
    const selectedValue = formatMonthYear(monthIndex + 1, displayYear);
    if (isValueBeforeMin(selectedValue, minDate, "monthYear")) return;
    if (isValueAfterMax(selectedValue, maxDate, "monthYear")) return;
    onChange(selectedValue);
    setOpen(false);
  };

  const handleFullDateKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") setOpen(false);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key !== "Tab" || !popoverRef.current) return;

    const focusables = Array.from(popoverRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => !element.hasAttribute("disabled"),
    );
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const invalidRange = value && value !== "Present" && (isValueBeforeMin(value, minDate, mode) || isValueAfterMax(value, maxDate, mode));

  if (mode === "fullDate") {
    return (
      <div className="date-picker-wrapper" ref={wrapperRef}>
        <input
          type="date"
          className={`date-picker-input ${invalidRange ? "is-invalid" : ""}`}
          value={normalizeDateValue(value, "fullDate")}
          onChange={(event) => onChange(event.target.value)}
          min={minDate}
          max={maxDate}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onKeyDown={handleFullDateKeyDown}
          disabled={disabled}
        />
      </div>
    );
  }

  const selectedMonth = parsedValue?.month;
  const selectedYear = parsedValue?.year;

  return (
    <div className="date-picker-wrapper" ref={wrapperRef}>
      <input
        className={`date-picker-input ${invalidRange ? "is-invalid" : ""}`}
        value={toReadableValue(value, mode)}
        onFocus={openPicker}
        onClick={openPicker}
        onKeyDown={handleTriggerKeyDown}
        readOnly
        placeholder={placeholder}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={pickerId}
        aria-haspopup="dialog"
        disabled={disabled}
      />
      <button
        type="button"
        className="date-picker-toggle"
        aria-label="Open calendar"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
      >
        ▾
      </button>

      {open && !disabled ? (
        <div
          id={pickerId}
          className="date-picker-popover"
          role="dialog"
          aria-modal="false"
          aria-label="Date picker"
          ref={popoverRef}
          onKeyDown={trapFocus}
        >
          <div className="date-picker-header">
            <button type="button" onClick={() => setDisplayYear((prev) => prev - 12)} aria-label="Previous years">←</button>
            <button type="button" className="date-picker-year-btn" onClick={() => setView((prev) => (prev === "month" ? "year" : "month"))}>
              {displayYear}
            </button>
            <button type="button" onClick={() => setDisplayYear((prev) => prev + 12)} aria-label="Next years">→</button>
          </div>

          {view === "month" ? (
            <div className="date-picker-grid" role="grid" aria-label="Select month">
              {MONTH_LABELS.map((label, monthIndex) => {
                const candidate = formatMonthYear(monthIndex + 1, displayYear);
                const disabledForRange = isValueBeforeMin(candidate, minDate, "monthYear") || isValueAfterMax(candidate, maxDate, "monthYear");
                const active = selectedMonth === monthIndex + 1 && selectedYear === displayYear;
                const isCurrentMonth = now.getMonth() === monthIndex && now.getFullYear() === displayYear;
                return (
                  <button
                    key={`${label}-${displayYear}`}
                    type="button"
                    className={`date-picker-cell ${active ? "is-active" : ""} ${isCurrentMonth ? "is-current" : ""}`}
                    onClick={() => handleMonthPick(monthIndex)}
                    disabled={disabledForRange}
                    aria-pressed={active}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="date-picker-grid" role="grid" aria-label="Select year">
              {years.map((year) => {
                const active = selectedYear === year;
                return (
                  <button
                    key={year}
                    type="button"
                    className={`date-picker-cell ${active ? "is-active" : ""}`}
                    onClick={() => {
                      setDisplayYear(year);
                      setView("month");
                    }}
                    aria-pressed={active}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          )}

          {allowPresent ? (
            <button
              type="button"
              className={`date-picker-present ${value === "Present" ? "is-active" : ""}`}
              onClick={() => {
                onChange("Present");
                setOpen(false);
              }}
            >
              Present
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
