// The boot script of ADR-0045 §3: the built document's one module entry becomes this inline classic
// script, whose text never changes, with the hashed entry URL in its `data-entry` attribute. A CSP
// hash covers the text, not the attributes, so the hash below is the same on every build and the
// committed policy can hold it. It creates the module script element instead of calling `import()`,
// which Chromium blocked from an inline hashed module in the prototype.

/** The fixed text; change it only with the hash below and the CSP that carries it. */
export const BOOT_SCRIPT =
  "(function(){var c=document.currentScript,s=document.createElement('script');s.type='module';s.src=c.dataset.entry;document.head.append(s)})()";

/** The SHA-256 of `BOOT_SCRIPT` as the CSP carries it; `boot.test.ts` recomputes it. */
export const BOOT_SCRIPT_HASH = 'sha256-92ZM1ZTIuAg5GfBEfzDubSanWvwzhnqTfPEc/OMTuSI=';
