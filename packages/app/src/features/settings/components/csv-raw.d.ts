// The tax-year export's expected CSVs (../fixtures) are read as text through Vite's `?raw` suffix (tax-year-export.test.tsx).
declare module '*.csv?raw' {
  const text: string;
  export default text;
}
