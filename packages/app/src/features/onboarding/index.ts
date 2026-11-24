export { CountryStep, type CountryStepProps } from './components/country-step';

/**
 * The screen, by its loader alone (as Plan's): Settings imports this file for the country step, and with the screen
 * exported here the route's `import()` of this file could hand Settings Onboarding's screen code (ADR-0045 §9).
 */
export const loadOnboardingScreen = () =>
  import('./components/onboarding-screen').then((m) => ({ default: m.OnboardingScreen }));

/**
 * The re-ask Today's route shows, by a loader too: the routes import this file statically, so it sits in Today's
 * chunk, and an `import()` of it there would make that chunk import the re-ask's chunk back (`noChunkCycles`).
 */
export const loadReacknowledge = () => import('./components/reacknowledge').then((m) => ({ default: m.Reacknowledge }));
