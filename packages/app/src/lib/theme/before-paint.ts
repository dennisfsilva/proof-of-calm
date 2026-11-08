// The theme before the first paint (ADR-0045 §3). Preferences live in IndexedDB, which a synchronous
// script cannot read, so the appearance is mirrored to one localStorage key as JSON; the first element
// of app.html's head is THEME_BEFORE_PAINT, an inline script with fixed text whose SHA-256 the CSP names
// (the switch's build puts THEME_BEFORE_PAINT_SHA256 into `script-src`; a test recomputes it). The
// writer of the mirror is the Settings action that changes the theme or the motion setting, after the
// store; the app shell rewrites it from the store after hydration, so the store wins. This module imports
// no component and no JSON: the build's Node scripts import it with plain `node`.
import * as z from 'zod/mini';

/** The one localStorage key, a non-secret UI preference (docs/SECURITY.md). */
export const APPEARANCE_STORAGE_KEY = 'poc.appearance';

export const AppearanceMirrorSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  motion: z.enum(['system', 'reduce']),
});
export type AppearanceMirror = z.infer<typeof AppearanceMirrorSchema>;

/**
 * The script's text, one line and fixed: it reads the key in a try, sets `data-theme` only for light or
 * dark and `data-motion="reduce"` only for reduce, and otherwise leaves the system preference in charge.
 * Any change here changes THEME_BEFORE_PAINT_SHA256 (the test says so) and so the committed policy.
 */
export const THEME_BEFORE_PAINT =
  `(function(){try{var p=JSON.parse(localStorage.getItem("${APPEARANCE_STORAGE_KEY}")),d=document.documentElement;` +
  'if(p.theme==="light"||p.theme==="dark")d.setAttribute("data-theme",p.theme);' +
  'if(p.motion==="reduce")d.setAttribute("data-motion","reduce")}catch(e){}})()';

/** The base64 SHA-256 of THEME_BEFORE_PAINT, as `'sha256-<this>'` in the CSP's `script-src`. */
export const THEME_BEFORE_PAINT_SHA256 = 'wnpGXoSKl24mPBrgSxtQGoZPqPfH8I2hrV5IqSq/q18=';

/** Mirrors the appearance for the next visit's script; a storage that throws leaves the store to win. */
export function writeAppearanceMirror(storage: Storage, value: AppearanceMirror): void {
  try {
    storage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Blocked or full localStorage: the shell rewrites the mirror from the store on the next visit.
  }
}
