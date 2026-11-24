/** The screen, by its loader alone (ADR-0045 §9). */
export const loadPortfolioScreen = () =>
  import('./components/portfolio-screen').then((m) => ({ default: m.PortfolioScreen }));
