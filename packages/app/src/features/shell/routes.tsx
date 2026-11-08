import { acknowledgementDue } from '@proofofcalm/core';
import { lazy, Suspense } from 'react';
import { RISK_WORDING_VERSION } from '../../lib/brand';
import { lazyScreen, loadNamespace } from '../../lib/i18n';
import { Redirect, Route, Switch, usePathname } from '../../lib/navigation';
import { useSnapshot } from '../../lib/services';
import { loadLearnScreen } from '../learn';
import { TodayScreen } from '../today';
import { ScreenBoundary } from './screen-error';
import { ScreenPending } from './screen-frame';

// The app's route table (ADR-0045 §9). Today is in the entry chunk; every other screen is a chunk of
// its own, loaded with its messages on the first visit, and every unknown path lands on Today. The
// routes are flat: a screen with sub-routes adds `nest` to its own `Route` line and switches inside.
const PortfolioScreen = lazyScreen('portfolio', () =>
  import('../portfolio').then((m) => ({ default: m.PortfolioScreen })),
);
const LogScreen = lazyScreen('log', () => import('../log').then((m) => ({ default: m.LogScreen })));
const PlanScreen = lazyScreen('plan', () => import('../plan').then((m) => ({ default: m.PlanScreen })));
// Settings' Plan and Coins & split tabs are the plan feature's editors: their messages load with the screen.
const SettingsScreen = lazyScreen('settings', () =>
  Promise.all([import('../settings'), loadNamespace('plan')]).then(([m]) => ({ default: m.SettingsScreen })),
);
const LearnScreen = lazyScreen('learn', loadLearnScreen);
// Onboarding's numbers step shows the plan feature's early-window notice: its messages load with the screen.
const OnboardingScreen = lazyScreen('onboarding', () =>
  Promise.all([import('../onboarding'), loadNamespace('plan')]).then(([m]) => ({ default: m.OnboardingScreen })),
);
// `lazyScreen` takes screens without props: this one takes the version it records, so it spells the helper out.
const Reacknowledge = lazy(async () => {
  const [onboarding] = await Promise.all([import('../onboarding'), loadNamespace('onboarding')]);
  return { default: onboarding.Reacknowledge };
});

/** Today, or in its place the re-ask of the risk text while the plan is due (docs/DOMAIN.md §2.1). */
function TodayRoute({ riskWording }: { readonly riskWording: number }) {
  const due = useSnapshot(({ plan }) => plan !== null && acknowledgementDue(plan, riskWording));
  return due ? <Reacknowledge version={riskWording} /> : <TodayScreen />;
}

export function AppRoutes({ riskWording = RISK_WORDING_VERSION }: { readonly riskWording?: number }) {
  // One boundary around the screen area, so the header and the tab bar around `AppRoutes` stay
  // mounted; the fallback marks the shell's screen area busy and renders nothing, the empty area of §9
  // (no text: the chunk is one local read for an installed client). Around it the error boundary: a
  // screen that fails, as a chunk that cannot be loaded, shows the error state until the location changes.
  const pathname = usePathname();
  return (
    <ScreenBoundary resetKey={pathname}>
      <Suspense fallback={<ScreenPending />}>
        <Switch>
          <Route path="/today">
            <TodayRoute riskWording={riskWording} />
          </Route>
          <Route path="/portfolio">
            <PortfolioScreen />
          </Route>
          <Route path="/log">
            <LogScreen />
          </Route>
          <Route path="/plan">
            <PlanScreen />
          </Route>
          <Route path="/settings">
            <SettingsScreen />
          </Route>
          <Route path="/learn" nest>
            <LearnScreen />
          </Route>
          <Route path="/onboarding">
            <OnboardingScreen />
          </Route>
          <Route>
            <Redirect to="/today" replace />
          </Route>
        </Switch>
      </Suspense>
    </ScreenBoundary>
  );
}
