import { SiteFalls, StaticLearn, useSiteFormatters } from '@proofofcalm/app/features/learn/site';
import { BRAND } from '@proofofcalm/app/lib/brand';
import type { CalendarDate } from '@proofofcalm/core';
import type { ComponentProps, ReactNode } from 'react';
import { siteTranslator } from '../../lib/site-messages';
import { LegalPage, type LegalSection, LegalSections } from './legal';
import { type OfficialLink, RISK_LINKS } from './risk-links';

// The Risk disclosure at launch (docs/LEGAL.md §5): the lead with §4's warning, then §5's sections in order. It renders
// inside `StaticLearn`, whose formatters write the dates and whose Learn messages carry the falls' table and lines.

const SECTIONS: readonly LegalSection[] = [
  { id: 'dca', paragraphs: 2 },
  { id: 'falls', paragraphs: 1 },
  { id: 'custody', paragraphs: 2 },
  { id: 'status', paragraphs: 1 },
  { id: 'tax', paragraphs: 1 },
  { id: 'scams', paragraphs: 2 },
  { id: 'register', paragraphs: 0 },
  { id: 'adviser', paragraphs: 1 },
  { id: 'warnings', paragraphs: 1 },
];

const LINK = 'text-ink underline underline-offset-4 hover:text-ink-2';
const NOTE = 'text-13 text-ink-2';
// A warning's label pads half of what one line leaves of the touch target above and below it (docs/DESIGN.md §8): one
// line fills the target exactly, and a wrapped label keeps the same distance to its checked line.
const WARNING = `self-start py-[calc((var(--spacing-target)-1lh)/2)] ${LINK}`;

function OfficialAnchor({ link, className, children }: { link: OfficialLink; className: string; children: ReactNode }) {
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

type Falls = Pick<ComponentProps<typeof SiteFalls>, 'falls'>;
export type RiskPageProps = Falls & { today: CalendarDate };

/** The page inside `StaticLearn` at the build's day, the providers the public pages render in. */
export function RiskPage({ falls, today }: RiskPageProps) {
  return (
    <StaticLearn today={today}>
      <RiskBody falls={falls} />
    </StaticLearn>
  );
}

function RiskBody({ falls }: Falls) {
  const t = siteTranslator('legal');
  const f = useSiteFormatters();
  const checked = (link: OfficialLink) => t('risk.checked', { date: f.date(link.accessed) });
  const [register, ...warnings] = RISK_LINKS;
  if (register === undefined) throw new Error('the register link is missing');
  return (
    <LegalPage slug="risk">
      <LegalSections
        slug="risk"
        sections={SECTIONS}
        after={{
          falls: <SiteFalls falls={falls} />,
          register: (
            <>
              <p>
                {t.rich('risk.register.p1', {
                  product: BRAND.name,
                  label: t('risk.links.esma-register'),
                  link: (chunks) => (
                    <OfficialAnchor link={register} className={LINK}>
                      {chunks}
                    </OfficialAnchor>
                  ),
                })}
              </p>
              <p className={NOTE}>{checked(register)}</p>
            </>
          ),
          warnings: (
            <ul className="flex flex-col gap-stack-sm">
              {warnings.map((link) => (
                <li key={link.id} className="flex flex-col">
                  <OfficialAnchor link={link} className={WARNING}>
                    {t(`risk.links.${link.id}`)}
                  </OfficialAnchor>
                  <span className={NOTE}>{checked(link)}</span>
                </li>
              ))}
            </ul>
          ),
        }}
      />
    </LegalPage>
  );
}
