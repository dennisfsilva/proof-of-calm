/// <reference path="../learn-modules.d.ts" />
import { LEARN_MODULES } from 'virtual:learn-modules';
import type { LearnModuleMeta } from '@proofofcalm/content';
import { Button } from '@proofofcalm/ui/components/button';
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@proofofcalm/ui/components/sheet';
import { XIcon } from 'lucide-react';
import { type ComponentProps, useRef } from 'react';
import { useTranslations } from 'use-intl';
import { useFormatters } from '../../../lib/services';
import { moduleBody } from '../lib/bodies';
import { pageJoiner, withJoiner } from '../lib/body-elements';
import { ModuleView } from './module-view';

export type ModuleSheetProps = {
  readonly slug: LearnModuleMeta['slug'];
  /** The id of a section (`headingId`), where the focus lands and the browser scrolls to. */
  readonly section?: string;
  readonly open: boolean;
  onOpenChange(open: boolean): void;
  /** The control that opened the sheet: it has no trigger, so Base UI cannot know it (docs/DESIGN.md §6). */
  readonly finalFocus?: ComponentProps<typeof SheetContent>['finalFocus'];
};

/**
 * One Learn module in a sheet (docs/CONTENT-STYLE.md §3): the same view as the route's, its title the module's
 * idea, so the dialog is named by what it says; a module with a chart joins its `N %` there as the view does its
 * title, caveat and body (docs/CONTENT-STYLE.md §4). With a section, the focus moves to that heading inside the
 * popup: the browser scrolls it into view, and the keyboard and a screen reader land on it, with no scroll code.
 * Without one, or for a section the module does not have, Base UI's default stands: the first tab stop, which is
 * `Close` (docs/DESIGN.md §6 and §8). The closing focus goes to the host's `finalFocus`. The body suspends under
 * the host's boundary, so the popup commits with the heading in it.
 *
 * A module has no foot to hold a Save or a Cancel, so `Close` stays in view as it scrolls, and the title does not
 * (docs/DESIGN.md §8). It must be the popup's first child, since a last child cannot stick to the top of its
 * scroller, so it comes first in the tab order on this sheet only. Its row has no height and takes back the popup's
 * `gap-stack-md`, so the module starts where it would. Browsers stick the row to the popup's content edge, inside
 * its padding (Chromium and WebKit, measured on 2026-11-03), so the 16 px the button hangs out of the row put it
 * 8 px from the corner both at rest and stuck, where `SheetContent`'s own button sits. The popup keeps every sheet's
 * scroll padding: more would stand over `Close`, which the browser would then scroll to reveal on each focus, and
 * being sticky it does not move, so only the reader's place would. Every element of the module takes a scroll margin
 * instead, that place and the button's height, so whatever takes the focus there (a section heading, the Risk link,
 * anything a module adds) stops clear of it. A margin applies to its target alone, and `Close` stands outside the
 * module, so it takes none (docs/DESIGN.md §8). The module keeps a column of the button's width clear on its right,
 * as `SheetHeader` does for a title, so the text that scrolls past `Close` (the caveat's box was the first, at 125 %
 * text zoom) passes beside it, never under it; the title takes that column from the module, not a second one.
 */
export function ModuleSheet({ slug, section, open, onOpenChange, finalFocus }: ModuleSheetProps) {
  const t = useTranslations('learn');
  const f = useFormatters();
  const popup = useRef<HTMLDivElement>(null);
  const module = LEARN_MODULES.find((known) => known.slug === slug);
  const Body = moduleBody(slug);
  if (module === undefined || Body === undefined) return null;
  const joiner = module.chart === 'none' ? undefined : pageJoiner(f);
  const heading = () =>
    (section !== undefined && popup.current?.querySelector<HTMLElement>(`[id="${section}"]`)) || true;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={popup}
        className="[&_article_*]:scroll-mt-[calc(var(--space-unit)*2+var(--target))] [&>article]:pr-target"
        initialFocus={heading}
        finalFocus={finalFocus}
      >
        <div className="sticky top-0 z-10 -mb-stack-md flex h-0 items-start justify-end">
          <div className="-mt-4 -mr-4 rounded-md bg-overlay">
            <SheetClose aria-label={t('sheet.close')} render={<Button variant="ghost" size="icon" />}>
              <XIcon aria-hidden />
            </SheetClose>
          </div>
        </div>
        <ModuleView
          module={module}
          Body={Body}
          heading={<SheetTitle>{withJoiner(module.idea, joiner)}</SheetTitle>}
        />
      </SheetContent>
    </Sheet>
  );
}
