/// <reference path="../learn-modules.d.ts" />
import { LEARN_MODULES } from 'virtual:learn-modules';
import { useTranslations } from 'use-intl';
import { Link, Redirect, Route, Switch } from '../../../lib/navigation';
import { moduleBody } from '../lib/bodies';
import { BACK_LINK, CountryList, CountryRoute } from './country-library';
import { ModuleIndex } from './module-index';
import { ModuleView } from './module-view';

const PAGE = 'mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg';
// The index from inside the nest, absolute: `/` here would resolve to `/learn/`, with the trailing slash.
const INDEX = '~/learn';

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
      <ModuleView module={module} Body={Body} />
    </div>
  );
}

// Learn's routes, nested under `/learn` by the route table: the index, the country library ahead of the
// modules' `/:slug`, one module, and back to the index from anything else below it.
export function LearnScreen() {
  return (
    <Switch>
      <Route path="/">
        <div className={PAGE}>
          <ModuleIndex modules={LEARN_MODULES} />
        </div>
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
      <Route path="/:slug">{({ slug }) => <ModuleRoute slug={slug} />}</Route>
      <Route>
        <Redirect to={INDEX} replace />
      </Route>
    </Switch>
  );
}
