import type { LearnModuleMeta } from '@proofofcalm/content';
import { UNDO_WINDOW_MS } from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import { Component, lazy, type ReactNode, Suspense, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { loadNamespace } from '../../../lib/i18n';
import { usePlatform, useToasts } from '../../../lib/services';

export type WhyLinkProps = {
  readonly module: LearnModuleMeta['slug'];
  /** The id of the section the sheet opens on. */
  readonly section?: string;
  /** The accessible name, from the host's messages, starting with the visible word (WCAG 2.5.3). */
  readonly name: string;
  /** On a line of its own, not inside a sentence: the 44 px target (docs/DESIGN.md §6). */
  readonly standalone?: boolean;
};

// The sheet and its messages load on the first press, so a screen with a link carries no module text or
// metadata (ADR-0048 Deviations); declared at module level, as `lazy` requires.
const ModuleSheet = lazy(async () => {
  const [sheet] = await Promise.all([import('./module-sheet'), loadNamespace('learn')]);
  return { default: sheet.ModuleSheet };
});

type SheetBoundaryProps = {
  onFailure(): void;
  readonly children: ReactNode;
};

type SheetBoundaryState = { readonly failed: boolean };

/**
 * A sheet that cannot load, or cannot render, stops here: a "Why?" is optional reading and must not cost the
 * screen under it, as a sheet that carries the screen's main action may (`ScreenBoundary`, features/shell). React
 * keeps a rejected `lazy` until a new page, so the host unmounts this and the next press fails the same way.
 */
class SheetBoundary extends Component<SheetBoundaryProps, SheetBoundaryState> {
  override state: SheetBoundaryState = { failed: false };

  static getDerivedStateFromError(): SheetBoundaryState {
    return { failed: true };
  }

  override componentDidCatch() {
    this.props.onFailure();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * "Why?": a button, since nothing navigates, that opens a Learn module in a sheet over the screen it stands on
 * (docs/CONTENT-STYLE.md §3). The one Suspense boundary sits around the sheet and the body it suspends on, and
 * leaves the link in place; so does the error boundary around it, and a toast says what happened and offers the
 * reload, which an installed app has no browser button for. Nothing renders
 * until the first press; after that the sheet stays mounted, so closing animates. Closing names the link as the
 * place for the focus: Safari does not focus a button on press, so Base UI, which goes back to what held the
 * focus, would have nothing to go back to.
 */
export function WhyLink({ module, section, name, standalone = false }: WhyLinkProps) {
  const t = useTranslations('shell');
  const toasts = useToasts();
  const platform = usePlatform();
  const [open, setOpen] = useState<boolean | null>(null);
  const link = useRef<HTMLButtonElement>(null);
  const failed = () => {
    setOpen(null);
    toasts.add({
      title: t('why.failed'),
      timeout: UNDO_WINDOW_MS,
      actionProps: { children: t('screenError.reload'), onClick: () => platform.reload() },
    });
  };
  return (
    <>
      <Button
        ref={link}
        type="button"
        variant="link"
        size="inline"
        aria-label={name}
        {...(standalone ? { className: 'min-h-target min-w-target' } : {})}
        onClick={() => setOpen(true)}
      >
        {t('why.link')}
      </Button>
      {open !== null && (
        <SheetBoundary onFailure={failed}>
          <Suspense fallback={null}>
            <ModuleSheet
              slug={module}
              open={open}
              onOpenChange={setOpen}
              finalFocus={link}
              {...(section === undefined ? {} : { section })}
            />
          </Suspense>
        </SheetBoundary>
      )}
    </>
  );
}
