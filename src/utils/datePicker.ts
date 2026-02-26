export const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type DatePickerMode = "monthYear" | "fullDate";

export type ParsedMonthYear = {
  month: number;
  year: number;
};

const MONTH_YEAR_RE = /^(0[1-9]|1[0-2])\/(\d{4})$/;
const FULL_DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function parseMonthYear(value: string): ParsedMonthYear | null {
  const match = MONTH_YEAR_RE.exec(value.trim());
  if (!match) return null;
  return { month: Number(match[1]), year: Number(match[2]) };
}

export function formatMonthYear(month: number, year: number): string {
  const paddedMonth = String(month).padStart(2, "0");
  return `${paddedMonth}/${year}`;
}

export function parseDateValue(value: string, mode: DatePickerMode): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (mode === "monthYear") {
    const parsed = parseMonthYear(trimmed);
    if (!parsed) return null;
    return new Date(parsed.year, parsed.month - 1, 1);
  }

  const fullDateMatch = FULL_DATE_RE.exec(trimmed);
  if (!fullDateMatch) return null;
  const date = new Date(Number(fullDateMatch[1]), Number(fullDateMatch[2]) - 1, Number(fullDateMatch[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function compareDateValues(a: string, b: string, mode: DatePickerMode): number {
  const dateA = parseDateValue(a, mode);
  const dateB = parseDateValue(b, mode);
  if (!dateA || !dateB) return 0;
  return dateA.getTime() - dateB.getTime();
}

export function isValueBeforeMin(value: string, minValue: string | undefined, mode: DatePickerMode): boolean {
  if (!minValue) return false;
  return compareDateValues(value, minValue, mode) < 0;
}

export function isValueAfterMax(value: string, maxValue: string | undefined, mode: DatePickerMode): boolean {
  if (!maxValue) return false;
  return compareDateValues(value, maxValue, mode) > 0;
}

export function normalizeDateValue(value: string, mode: DatePickerMode): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (mode === "monthYear") {
    const parsed = parseMonthYear(trimmed);
    if (parsed) return formatMonthYear(parsed.month, parsed.year);
    return "";
  }

  return FULL_DATE_RE.test(trimmed) ? trimmed : "";
}

export function toMonthLabel(monthNumber: number): string {
  return MONTH_LABELS[monthNumber - 1] ?? "";
}

export function toReadableValue(value: string, mode: DatePickerMode): string {
  if (!value) return "";
  if (value === "Present") return value;

  if (mode === "monthYear") {
    const parsed = parseMonthYear(value);
    if (!parsed) return value;
    return `${toMonthLabel(parsed.month)} ${parsed.year}`;
  }

  const date = parseDateValue(value, mode);
  if (!date) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function getYearPage(anchorYear: number, pageSize = 12): number[] {
  const start = anchorYear - (anchorYear % pageSize);
  return Array.from({ length: pageSize }, (_, index) => start + index);
}
