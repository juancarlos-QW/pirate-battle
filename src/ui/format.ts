/** Formats seconds as `mm:ss`. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Splits a timestamp into the `08 SEP` / `19:36` parts used by the captain's log. */
export function formatPlayedAt(iso: string): { readonly date: string; readonly time: string } {
  const value = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${pad(value.getDate())} ${MONTHS[value.getMonth()] ?? ''}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
  };
}

/** `2.5` → `2.5`, `3` → `3`: spawn intervals without trailing zeros. */
export function formatSeconds(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
