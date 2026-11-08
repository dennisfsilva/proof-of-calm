// The expected CSVs are read as text through Vite's `?raw` suffix: the core's tests import no Node built-in.
declare module '*.csv?raw' {
  const text: string;
  export default text;
}
