import { type CountryProfile, loadedProfile, loadProfile } from '@proofofcalm/content';
import { useEffect, useState } from 'react';

// The profile of a country where a card, a source link or the picker shows it (ADR-0049). The shell boots on
// the country's rules file, not on its profile, so the first render may have none: the profile a load has
// already read answers at once from the render, with no state and no second commit, else null until
// `loadProfile` resolves; an answer for a code that has moved on is dropped. A load elsewhere (another card,
// the picker) can finish between the render and the effect: the effect then takes what it finds instead of
// loading, through the same settled path, so the hook never stays null with no load pending and the state is
// set in a callback, never in the effect itself. A code with no profile (a plan on the generic rules) stays
// null; `useProfileLoad` also says whether the load has settled, so a caller can tell a profile still loading
// from one the device does not have (a load that throws settles with none).

type Loaded = { readonly code: string; readonly profile: CountryProfile | null };

/** The profile of `code` and whether its load has settled: false only while a load for that code runs. */
export function useProfileLoad(code: string | undefined): {
  readonly profile: CountryProfile | null;
  readonly settled: boolean;
} {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const known = code === undefined ? null : loadedProfile(code);
  useEffect(() => {
    if (code === undefined || known !== null) return;
    let current = true;
    const late = loadedProfile(code);
    void (late !== null ? Promise.resolve(late) : loadProfile(code))
      .catch(() => null)
      .then((profile) => {
        if (!current) return;
        setLoaded((state) => (state?.code === code && state.profile === profile ? state : { code, profile }));
      });
    return () => {
      current = false;
    };
  }, [code, known]);
  if (code === undefined) return { profile: null, settled: true };
  if (known !== null) return { profile: known, settled: true };
  const mine = loaded !== null && loaded.code === code ? loaded : null;
  return { profile: mine?.profile ?? null, settled: mine !== null };
}

export function useProfile(code: string | undefined): CountryProfile | null {
  return useProfileLoad(code).profile;
}
