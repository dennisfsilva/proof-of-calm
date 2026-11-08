/** `months` months before `today`, as YYYY-MM-DD (the day clamped is irrelevant at this precision). */
export function monthsBefore(today: string, months: number): string {
  const [year = 0, month = 1] = today.split('-').map(Number);
  const total = year * 12 + (month - 1) - months;
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}${today.slice(7)}`;
}
