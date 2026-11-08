import { Tabs, TabsContent, TabsList, TabsTrigger } from '@proofofcalm/ui/components/tabs';
import { useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { useSnapshot } from '../../../lib/services';
import { AboutSection } from './about-section';
import { CoinsTab } from './coins-tab';
import { CountrySection } from './country-section';
import { DataSection } from './data-section';
import { HoldSellTab } from './hold-sell-tab';
import { PlanTab } from './plan-tab';

// The Settings screen: four tabs over packages/ui's Tabs (docs/DESIGN.md §8), Plan, Coins & split, Hold & sell
// and Currency & data, which holds the country change above the data section (docs/ARCHITECTURE.md "Inside
// packages/app"). The shell mounts it once the store is ready, so the tab it opens on is read once: Plan with a plan,
// Currency & data without one, where a backup can be imported. The tab is held here, not in the URL: the empty
// state's "import a file" on the plan tabs would lead to /settings, already showing, so it opens
// Currency & data with the focus on its tab instead. About closes the screen below the tabs, on every tab.
export function SettingsScreen() {
  const t = useTranslations('settings');
  const hasPlan = useSnapshot((snapshot) => snapshot.plan !== null);
  const [tab, setTab] = useState<string>(hasPlan ? 'plan' : 'data');
  const data = useRef<HTMLButtonElement>(null);
  const openData = () => {
    setTab('data');
    data.current?.focus();
  };
  return (
    <div className="mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg">
      <h1 className="text-28">{t('title')}</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label={t('title')}>
          <TabsTrigger value="plan">{t('tabs.plan')}</TabsTrigger>
          <TabsTrigger value="coins">{t('tabs.coins')}</TabsTrigger>
          <TabsTrigger value="hold">{t('tabs.hold')}</TabsTrigger>
          <TabsTrigger value="data" ref={data}>
            {t('tabs.data')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="plan">
          <PlanTab onImport={openData} />
        </TabsContent>
        <TabsContent value="coins">
          <CoinsTab onImport={openData} />
        </TabsContent>
        <TabsContent value="hold">
          <HoldSellTab onImport={openData} />
        </TabsContent>
        <TabsContent value="data" className="flex flex-col gap-stack-lg">
          <CountrySection />
          <DataSection />
        </TabsContent>
      </Tabs>
      <AboutSection />
    </div>
  );
}
