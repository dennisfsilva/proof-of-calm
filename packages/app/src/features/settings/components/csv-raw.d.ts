// The e2e spec's expected CSVs are read as text through Vite's `?raw` suffix (tax-year-export.test.tsx).
declare module '*.csv?raw' {
  const text: string;
  export default text;
}
