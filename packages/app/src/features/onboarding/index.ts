export { CountryStep, type CountryStepProps } from './components/country-step';
export { Reacknowledge } from './components/reacknowledge';

/**
 * The screen, by its loader alone (as Plan's): Settings imports this file for the country step, and with the screen
 * exported here the route's `import()` of this file could hand Settings Onboarding's screen code (ADR-0045 §9).
 */
export const loadOnboardingScreen = () =>
  import('./components/onboarding-screen').then((m) => ({ default: m.OnboardingScreen }));
