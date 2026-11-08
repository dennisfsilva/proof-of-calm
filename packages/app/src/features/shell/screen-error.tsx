import { Button } from '@proofofcalm/ui/components/button';
import { Component, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { usePlatform } from '../../lib/services';

// A screen that cannot render, most often because its lazy chunk could not be loaded while this build is
// still deployed (offline, or a failed request; a build that is gone reloads by itself, ADR-0045 §3 and its
// deviation of 2026-10-22). The boundary sits around the screen area's Suspense, inside the shell, so
// the header and the tab bar stay mounted and another destination still opens: a new location clears it.
// React keeps a failed lazy component's error, so the screen itself comes back only with a new page.

export type ScreenBoundaryProps = {
  /** The location: a new one clears the error state. */
  readonly resetKey: string;
  readonly children: ReactNode;
};

type ScreenBoundaryState = { readonly failed: boolean; readonly key: string };

export class ScreenBoundary extends Component<ScreenBoundaryProps, ScreenBoundaryState> {
  override state: ScreenBoundaryState = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError(): Partial<ScreenBoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: ScreenBoundaryProps, state: ScreenBoundaryState): ScreenBoundaryState | null {
    return props.resetKey === state.key ? null : { failed: false, key: props.resetKey };
  }

  override render() {
    return this.state.failed ? <ScreenError /> : this.props.children;
  }
}

/**
 * The error state of the screen area: a heading the shell focuses after a route change (DESIGN §6), one
 * line that names the fix, and Reload.
 */
export function ScreenError() {
  const t = useTranslations('shell.screenError');
  const platform = usePlatform();
  return (
    <div className="mx-auto flex w-full max-w-reading flex-1 flex-col gap-stack-lg px-gutter py-stack-lg">
      <h1 tabIndex={-1} className="text-28">
        {t('title')}
      </h1>
      <p className="text-16 text-ink-2">{t('line')}</p>
      <div>
        <Button onClick={() => platform.reload()}>{t('reload')}</Button>
      </div>
    </div>
  );
}
