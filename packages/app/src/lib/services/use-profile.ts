import { type CountryProfile, loadedProfile, loadProfile } from '@proofofcalm/content';
import { useEffect, useState } from 'react';

// The profile of a country where a card, a source link or the picker shows it (ADR-0049). The shell boots on
// the country's rules file, not on its profile, so the first render may have none: the profile a load has
// already read answers at once from the render, with no state and no second commit, else null until
// `loadProfile` resolves; an answer for a code that has moved on is dropped. A load elsewhere (another card,
// the picker) can finish between the render and the effect: the effect then takes what it finds instead of
// loading, through the same settled path, so the hook never stays null with no load pending and the state is
// set in a callback, never in the effect itself. A code with no profile (a plan on the generic rules) stays
// null.

type Loaded = { readonly code: string; readonly profile: CountryProfile };

export function useProfile(code: string | undefined): CountryProfile | null {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const known = code === undefined ? null : loadedProfile(code);
  useEffect(() => {
    if (code === undefined || known !== null) return;
    let current = true;
    const late = loadedProfile(code);
    void (late !== null ? Promise.resolve(late) : loadProfile(code)).then((profile) => {
      if (!current || profile === null) return;
      setLoaded((state) => (state?.code === code && state.profile === profile ? state : { code, profile }));
    });
    return () => {
      current = false;
    };
  }, [code, known]);
  if (code === undefined) return null;
  return known ?? (loaded !== null && loaded.code === code ? loaded.profile : null);
}
