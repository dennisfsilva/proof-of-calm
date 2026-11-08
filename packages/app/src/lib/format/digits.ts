// The one numbering system for every number the app writes or reads: Western digits, whatever the locale.
// The generic profile formats in `und`, which Intl resolves to the device's locale, and the number field
// reads ASCII digits only (./number-input), so display and input must not differ (ar-EG would otherwise
// show ١٬٢٣٤٫٥ beside a field that writes 1,234.5). Every Intl formatter of this layer spreads it.
export const LATIN_DIGITS = { numberingSystem: 'latn' } as const;
