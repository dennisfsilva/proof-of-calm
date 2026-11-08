import type { useTranslations } from 'use-intl';
import { describe, expect, it } from 'vitest';

// The keys are typed from the merged English messages through use-intl's AppConfig (app-config.d.ts):
// a namespace or key the messages lack does not compile. `pnpm typecheck` holds the marked lines to it.
type Namespace = NonNullable<Parameters<typeof useTranslations>[0]>;
type TodayKey = Parameters<ReturnType<typeof useTranslations<'today'>>>[0];

describe('the message keys (ADR-0023)', () => {
  it('are the namespaces and keys of the English messages', () => {
    const known: [Namespace, Namespace, TodayKey, TodayKey] = ['today', 'errors.action', 'title', 'empty.noPlan'];
    // @ts-expect-error: no namespace of that name
    const unknownNamespace: Namespace = 'nowhere';
    // @ts-expect-error: no key of that name in today
    const unknownKey: TodayKey = 'empty.nothing';
    expect([...known, unknownNamespace, unknownKey]).toHaveLength(6);
  });
});
