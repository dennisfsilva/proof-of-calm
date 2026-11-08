import { type ClassValue, clsx } from 'clsx';

/**
 * Joins class names, leaving falsy ones out. It does not resolve conflicts: tailwind-merge was 10 kB of
 * the Today page's script as Vercel serves it, so two utilities for one property on an element count as
 * a bug, which the story tests and the e2e matrix report (`lib/class-conflicts.ts`, ADR-0043).
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
