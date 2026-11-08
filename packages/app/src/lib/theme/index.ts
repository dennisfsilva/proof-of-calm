// No `.tsx` and no JSON behind this surface: the switch's Node scripts import it with plain `node`.
export { applyAppearance } from './apply.ts';
export {
  APPEARANCE_STORAGE_KEY,
  type AppearanceMirror,
  AppearanceMirrorSchema,
  THEME_BEFORE_PAINT,
  THEME_BEFORE_PAINT_SHA256,
  writeAppearanceMirror,
} from './before-paint.ts';
