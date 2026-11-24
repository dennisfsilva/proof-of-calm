/** The screen, by its loader alone (ADR-0045 §9). */
export const loadSettingsScreen = () =>
  import('./components/settings-screen').then((m) => ({ default: m.SettingsScreen }));
