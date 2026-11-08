import { Select as SelectPrimitive } from '@base-ui/react/select';
import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import type { CalendarDate, Ratio } from '@proofofcalm/core';
import { BookOpenIcon, ChartPieIcon, CircleDotIcon, ListIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AllocationBar } from '../charts/allocation-bar';
import { CoinChart } from '../charts/coin-chart';
import { LineChart } from '../charts/line-chart';
import { ProgressStrip } from '../charts/progress-strip';
import { Sparkline } from '../charts/sparkline';
import { Timeline } from '../charts/timeline';
import { AppHeader } from '../components/app-header';
import { Banner, BannerContent, BannerTitle } from '../components/banner';
import { Button } from '../components/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/card';
import { Checkbox } from '../components/checkbox';
import { CircleToggle } from '../components/circle-toggle';
import { CoinChip } from '../components/coin-chip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/collapsible';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '../components/dialog';
import { Empty, EmptyHeader, EmptyTitle } from '../components/empty';
import { Field, FieldDescription, FieldError, FieldLabel } from '../components/field';
import { DateInput, Input, NumericInput } from '../components/input';
import { TabBar, TopNav } from '../components/navigation';
import { RadioCard, RadioGroup } from '../components/radio-group';
import { SegmentedControl } from '../components/segmented-control';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '../components/sheet';
import { Switch } from '../components/switch';
import { Table, TableBody, TableCell, TableExpandableRow, TableGroupHeader } from '../components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/tabs';
import { Textarea } from '../components/textarea';
import { createToastManager, Toaster } from '../components/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/tooltip';

// docs/SECURITY.md §4: the CSP allows no inline style attribute, and the browser blocks one in server
// HTML (React sets client-side styles through the CSSOM, which the policy allows). So no component may
// put a style attribute into what the server renders: a page that did would report a violation in the
// e2e suite and lose the style. Base UI's checkbox, radio and switch would (their hidden input), which
// is why they render a look-alike until hydration (lib/hydrated.ts); these tests hold that line.

const STYLE = /\sstyle="/;
const html = (node: ReactNode) => renderToString(node);

const items = [
  { href: '/today', label: 'Today', icon: CircleDotIcon, current: true },
  { href: '/portfolio', label: 'Portfolio', icon: ChartPieIcon },
  { href: '/log', label: 'Log', icon: ListIcon },
  { href: '/learn', label: 'Learn', icon: BookOpenIcon },
];
const table = { summary: 'Show as a table', columns: ['Date', 'Price'], rows: [['17 Oct 2026', '61 640 €']] };
const axis = { top: '64 000 €', bottom: '52 000 €', start: 'Nov 2025', end: 'Oct 2026' };

const components: [string, ReactNode][] = [
  [
    'AppHeader',
    <AppHeader
      key="header"
      brand={{ href: '/today', label: 'Proof of Calm' }}
      navigation={{ label: 'Main', items }}
      settings={{ href: '/settings', label: 'Settings' }}
    />,
  ],
  ['TopNav', <TopNav key="top" label="Main" items={items} />],
  ['TabBar', <TabBar key="tabs" label="Main" items={items} />],
  ['Switch, off', <Switch key="off" aria-label="Reduce motion" />],
  ['Switch, on and disabled', <Switch key="on" aria-label="Reduce motion" defaultChecked disabled />],
  ['Checkbox, ticked', <Checkbox key="ticked" aria-label="I understand" defaultChecked />],
  ['Checkbox, mixed', <Checkbox key="mixed" aria-label="Some coins" indeterminate />],
  [
    'RadioGroup with cards',
    <RadioGroup key="radio" aria-label="Country" defaultValue="PT">
      <RadioCard value="PT" badge="PT" title="Portugal" line="365 days" />
      <RadioCard value="DE" badge="DE" title="Germany" />
    </RadioGroup>,
  ],
  ['CircleToggle', <CircleToggle key="circle" aria-label="Part 1 sold" defaultPressed />],
  [
    'Textarea in a Field',
    <Field key="textarea">
      <FieldLabel>Why</FieldLabel>
      <Textarea defaultValue="To hold through 2030." />
    </Field>,
  ],
  [
    'Collapsible, closed',
    <Collapsible key="closed">
      <CollapsibleTrigger>More</CollapsibleTrigger>
      <CollapsibleContent>Venue</CollapsibleContent>
    </Collapsible>,
  ],
  [
    'Collapsible, open',
    <Collapsible key="open" defaultOpen>
      <CollapsibleTrigger>More</CollapsibleTrigger>
      <CollapsibleContent>Venue</CollapsibleContent>
    </Collapsible>,
  ],
  [
    'Tooltip',
    <Tooltip key="tooltip" defaultOpen>
      <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Add" />} />
      <TooltipContent>Add</TooltipContent>
    </Tooltip>,
  ],
  [
    'Timeline',
    <Timeline
      key="timeline"
      phases={[
        { kind: 'buy', label: 'Buy', detail: '2026 to 2028', from: 0, to: 0.5 },
        { kind: 'sell', label: 'Sell', detail: '2030', from: 0.7, to: 0.9, marks: [{ at: 0.7, done: true }] },
      ]}
      today={0.2}
      elapsed={0.2}
      todayLabel="Today, 17 October 2026"
      axis={{ start: 'Jan 2026', end: 'Jun 2031' }}
      milestones={[{ id: 'today', date: '17 Oct 2026', label: 'Today', when: 'today' }]}
      label="Plan"
      description="Buy until 2028, sell in 2030."
      references={[{ id: 'peak', label: 'Expected peak', detail: '2030', from: 0.7, to: 0.8 }]}
      table={{ summary: 'Show as a table', columns: ['Date', 'Milestone'], rows: [['17 Oct 2026', 'Today']] }}
    />,
  ],
  [
    'CoinChart',
    <CoinChart
      key="coin"
      viewBox={{ width: 300, height: 100 }}
      colour="btc"
      path="M0 50L300 40"
      markers={[{ id: 'b', kind: 'buy', x: 100, y: 45 }]}
      average={{ y: 48, label: 'Average 58 000 €' }}
      axis={axis}
      legend={{ price: 'BTC price', buy: 'Buy', sell: 'Sale', average: 'Average cost' }}
      points={[{ x: 0, y: 50, label: '1 Nov: 52 000 €' }]}
      label="BTC price"
      table={table}
    />,
  ],
  [
    'LineChart',
    <LineChart
      key="line"
      viewBox={{ width: 300, height: 100 }}
      series={[{ id: 'v', label: 'Value', colour: 'btc', path: 'M0 50L300 40' }]}
      axis={axis}
      label="Value"
      table={table}
    />,
  ],
  ['Input', <NumericInput key="numeric" aria-label="Amount" defaultValue="250" />],
  ['Input, text', <Input key="text" aria-label="Note" />],
  [
    'SegmentedControl',
    <SegmentedControl
      key="segments"
      aria-label="Range"
      options={[
        { value: '30d', label: '30D' },
        { value: '1y', label: '1Y' },
      ]}
    />,
  ],
  [
    'Tabs',
    <Tabs key="settings" defaultValue="plan">
      <TabsList aria-label="Settings">
        <TabsTrigger value="plan">Plan</TabsTrigger>
        <TabsTrigger value="data">Data</TabsTrigger>
      </TabsList>
      <TabsContent value="plan">Plan</TabsContent>
      <TabsContent value="data">Data</TabsContent>
    </Tabs>,
  ],
];

const ratio = (value: string) => value as Ratio;

/** The rest of the inventory, so that no component, old or new, slips a style attribute in. */
const inventory: [string, ReactNode][] = [
  [
    'Banner',
    <Banner key="banner">
      <BannerContent>
        <BannerTitle>Back up your data</BannerTitle>
      </BannerContent>
    </Banner>,
  ],
  [
    'Card',
    <Card key="card">
      <CardHeader>
        <CardTitle>Buy for October</CardTitle>
      </CardHeader>
      <CardContent>
        <CoinChip coin="BTC" colour="btc" amount="175 €" />
      </CardContent>
    </Card>,
  ],
  [
    'Dialog and Sheet, closed',
    <div key="overlays">
      <Dialog>
        <DialogTrigger>End buying</DialogTrigger>
        <DialogContent closeLabel="Close">
          <DialogTitle>End buying now?</DialogTitle>
        </DialogContent>
      </Dialog>
      <Sheet>
        <SheetTrigger>Why?</SheetTrigger>
        <SheetContent closeLabel="Close">
          <SheetTitle>Why hold for a year</SheetTitle>
        </SheetContent>
      </Sheet>
    </div>,
  ],
  [
    'Empty',
    <Empty key="empty">
      <EmptyHeader>
        <EmptyTitle>No plan yet</EmptyTitle>
      </EmptyHeader>
    </Empty>,
  ],
  [
    'Field with a date, a description and an error',
    <Field key="date" invalid>
      <FieldLabel>First buy</FieldLabel>
      <DateInput defaultValue="2026-11-01" />
      <FieldDescription>The day of the first purchase.</FieldDescription>
      <FieldError>Choose a date after today.</FieldError>
    </Field>,
  ],
  [
    'Table with an open row and a month header',
    <Table key="table">
      <TableBody>
        <TableGroupHeader colSpan={2}>October 2026</TableGroupHeader>
        <TableExpandableRow summary="BTC" colSpan={2} detail="0.0371 BTC" defaultOpen>
          <TableCell numeric>2 412,50 €</TableCell>
        </TableExpandableRow>
      </TableBody>
    </Table>,
  ],
  ['Toaster', <Toaster key="toaster" closeLabel="Dismiss" toastManager={createToastManager()} />],
  [
    'ProgressStrip',
    <ProgressStrip
      key="strip"
      strip={{
        start: '2026-01-05' as CalendarDate,
        end: '2028-12-05' as CalendarDate,
        segments: [{ kind: 'buy', from: ratio('0'), to: ratio('1'), openEnded: false }],
        peak: null,
        today: ratio('0.2'),
        elapsed: ratio('0.2'),
      }}
      phases={[{ kind: 'buy', label: 'Buy', range: '2026 to 2028' }]}
      label="Plan"
      table={table}
    />,
  ],
  [
    'Sparkline and AllocationBar',
    <div key="small-charts">
      <Sparkline viewBox={{ width: 100, height: 30 }} path="M0 20L100 10" colour="eth" label="ETH" table={table} />
      <AllocationBar
        segments={[{ id: 'BTC', label: 'BTC', colour: 'btc', start: 0, end: 1, share: '100 %' }]}
        label="Allocation"
        table={table}
      />
    </div>,
  ],
];

describe('server HTML carries no style attribute (docs/SECURITY.md §4)', () => {
  it('notices one where there is one', () => {
    expect(html(<span style={{ color: 'currentcolor' }} />)).toMatch(STYLE);
  });

  it.each([...components, ...inventory])('%s', (_name, node) => {
    expect(html(node)).not.toMatch(STYLE);
  });

  it('keeps the look-alikes in the state the client will have', () => {
    expect(html(<Switch aria-label="On" defaultChecked />)).toContain('data-checked=""');
    expect(html(<Checkbox aria-label="Mixed" indeterminate />)).toContain('data-indeterminate=""');
    const cards = html(
      <RadioGroup aria-label="Country" defaultValue="DE">
        <RadioCard value="PT" title="Portugal" />
        <RadioCard value="DE" title="Germany" />
      </RadioGroup>,
    );
    expect(cards.match(/data-checked=""/g)).toHaveLength(1);
    expect(cards.indexOf('data-checked=""')).toBeGreaterThan(cards.indexOf('Portugal'));
  });

  // Why the look-alikes exist, and the one component still to solve: Base UI's own switch carries an
  // inline style in server HTML, and so does Select, whose hidden input sits beside parts the caller
  // composes. A Select must render on the client (after the store has hydrated, as the screens do).
  it('records where Base UI itself puts one: the switch and the select', () => {
    expect(html(<SwitchPrimitive.Root aria-label="Raw" />)).toMatch(STYLE);
    expect(html(<SelectPrimitive.Root defaultValue="EUR" />)).toMatch(STYLE);
  });
});
