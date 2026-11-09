/// <reference path="../learn-modules.d.ts" />
import { LEARN_MODULES } from 'virtual:learn-modules';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { Link, Redirect, Route, Switch } from '../../../lib/navigation';
import { moduleBody } from '../lib/bodies';
import { BACK_LINK, CountryList, CountryRoute } from './country-library';
import { ModuleIndex } from './module-index';
import { ModuleView } from './module-view';
import { FALL_MODULE, ThisFallPage, useFallModel } from './this-fall-page';

const PAGE = 'mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg';
// The index from inside the nest, absolute: `/` here would resolve to `/learn/`, with the trailing slash.
const INDEX = '~/learn';

const fallLink = (chunks: ReactNode) => (
  <Link href="/fall-under-way" className="text-ink underline underline-offset-4 hover:text-ink-2">
    {chunks}
  </Link>
);

/** On the route of When the market drops alone, never in its sheet: a line to the fall page while a fall is under way. */
function FallUnderWayLine() {
  const t = useTranslations('learn.module');
  const model = useFallModel();
  if (model?.state !== 'episode') return null;
  return <p className="text-16">{t.rich('fallUnderWay', { page: fallLink })}</p>;
}

function ModuleRoute({ slug }: { slug: string }) {
  const t = useTranslations('learn');
  const module = LEARN_MODULES.find((known) => known.slug === slug);
  const Body = moduleBody(slug);
  if (module === undefined || Body === undefined) return <Redirect to={INDEX} replace />;
  return (
    <div className={PAGE}>
      <Link href={INDEX} className={BACK_LINK}>
        {t('module.back')}
      </Link>
      <ModuleView module={module} Body={Body} lead={slug === FALL_MODULE ? <FallUnderWayLine /> : undefined} />
    </div>
  );
}

/** The index, with the fall page's row while a fall of the held coins is under way on this device. */
function IndexRoute() {
  const model = useFallModel();
  return (
    <div className={PAGE}>
      <ModuleIndex modules={LEARN_MODULES} thisFall={model?.state === 'episode'} />
    </div>
  );
}

// Learn's routes, nested under `/learn` by the route table: the index, the country library and the fall page
// ahead of the modules' `/:slug`, one module, and back to the index from anything else below it.
export function LearnScreen() {
  return (
    <Switch>
      <Route path="/">
        <IndexRoute />
      </Route>
      <Route path="/countries">
        <div className={PAGE}>
          <CountryList />
        </div>
      </Route>
      <Route path="/countries/:code">
        {({ code }) => (
          <div className={PAGE}>
            <CountryRoute code={code} />
          </div>
        )}
      </Route>
      <Route path="/fall-under-way">
        <div className={PAGE}>
          <ThisFallPage />
        </div>
      </Route>
      <Route path="/:slug">{({ slug }) => <ModuleRoute slug={slug} />}</Route>
      <Route>
        <Redirect to={INDEX} replace />
      </Route>
    </Switch>
  );
}
