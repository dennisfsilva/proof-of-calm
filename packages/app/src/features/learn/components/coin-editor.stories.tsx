import type { Coin, CoinId, Plan } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent } from 'storybook/test';
import { createNumberInput } from '../../../lib/format';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { type CoinSplitValue, coinSplit, readShares } from '../lib/split';
import { CoinEditor, type CoinEditorProps } from './coin-editor';

// The coin editor held as a host holds it, with the issues of coinSplit in en-GB: the fixture's split,
// a split off 100, a single coin, a host with no plan and a note; the test projects render each at
// 360 and 1280 px, light and dark, with axe.

const plan = fixtureSnapshot().plan as Plan;
const [BTC, ETH] = plan.coins as [Coin, Coin];
const catalogue = [
  BTC,
  ETH,
  { id: 'SOL', name: 'Solana', geckoId: 'solana', decimals: 4 },
  { id: 'LINK', name: 'Chainlink', geckoId: 'chainlink', decimals: 4 },
] as Coin[];
const english = createNumberInput('en-GB');
const shares = (entries: Record<string, string>) => entries as Record<CoinId, string>;

function Host({ initial, notes }: { initial: CoinSplitValue; notes?: CoinEditorProps['notes'] }) {
  const [value, setValue] = useState(initial);
  const result = coinSplit(plan, value, english);
  return (
    <CoinEditor
      value={value}
      catalogue={catalogue}
      issues={result.ok ? [] : result.error}
      onChange={setValue}
      notes={notes}
    />
  );
}

const meta = {
  title: 'Features/Plan/CoinEditor',
  component: Host,
  args: { initial: { coins: [BTC, ETH], shares: shares({ BTC: '70', ETH: '30' }) } },
} satisfies Meta<typeof Host>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Split: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('group', { name: 'Coins & split' })).toBeVisible();
    await expect(canvas.queryByText('Make the shares add up to 100 %.')).toBeNull();
  },
};

export const OffHundred: Story = {
  args: { initial: { coins: [BTC, ETH], shares: shares({ BTC: '70', ETH: '20' }) } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Make the shares add up to 100 %.')).toBeVisible();
  },
};

// Names of three lengths: each label runs across the row, and under it every share field has one width
// and one left edge, with Remove after it, whatever the length of the Remove label.
export const ThreeCoins: Story = {
  args: {
    initial: {
      coins: [BTC, ETH, catalogue[3] as Coin],
      shares: shares({ BTC: '50', ETH: '30', LINK: '20' }),
    },
  },
  play: async ({ canvas }) => {
    const fields = canvas.getAllByRole('textbox');
    await expect(fields).toHaveLength(3);
    const boxes = fields.map((field) => field.getBoundingClientRect());
    for (const box of boxes) {
      await expect(box.width).toBe(boxes[0]?.width);
      await expect(box.left).toBe(boxes[0]?.left);
    }
    for (const name of ['Bitcoin', 'Ethereum', 'Chainlink']) {
      const field = canvas.getByRole('textbox', { name: `${name} share (%)` });
      const label = canvas.getByText(`${name} share (%)`);
      const remove = canvas.getByRole('button', { name: `Remove ${name}` });
      const own = field.getBoundingClientRect();
      // The label sits above the field and the button, not beside them.
      await expect(label.getBoundingClientRect().bottom).toBeLessThanOrEqual(own.top);
      await expect(remove.getBoundingClientRect().left).toBeGreaterThan(own.right);
      await expect(remove.getBoundingClientRect().top).toBeGreaterThanOrEqual(own.top);
    }
    // Wide enough for the largest share in the numeral style.
    const first = fields[0] as HTMLInputElement;
    await userEvent.clear(first);
    await userEvent.type(first, '100');
    await expect(first.scrollWidth).toBeLessThanOrEqual(first.clientWidth);
  },
};

export const OneCoin: Story = {
  args: { initial: { coins: [BTC], shares: shares({ BTC: '100' }) } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button', { name: 'Remove Bitcoin' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Add Ethereum' }));
    await expect(canvas.getByRole('textbox', { name: 'Ethereum share (%)' })).toHaveFocus();
  },
};

// A host with no plan, as the simulator: its issues from readShares, and the sole coin can go too.
function NoPlanHost({ initial }: { initial: CoinSplitValue }) {
  const [value, setValue] = useState(initial);
  const result = readShares(value, english);
  return (
    <CoinEditor
      value={value}
      catalogue={catalogue}
      issues={result.ok ? [] : result.error}
      onChange={setValue}
      allowEmpty
    />
  );
}

export const EmptyAllowed: Story = {
  args: { initial: { coins: [BTC], shares: shares({ BTC: '100' }) } },
  render: (args) => <NoPlanHost initial={args.initial} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Remove Bitcoin' }));
    await expect(canvas.queryAllByRole('textbox')).toHaveLength(0);
    await expect(canvas.getByText('Make the shares add up to 100 %.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Add Bitcoin' })).toHaveFocus();
  },
};

// A host's line under one coin's row, as the simulator's on a coin with no closes; it describes that share.
export const WithNote: Story = {
  args: {
    initial: { coins: [BTC, catalogue[2] as Coin], shares: shares({ BTC: '70', SOL: '30' }) },
    notes: { ['SOL' as CoinId]: 'No reference closes for Solana yet. Set its share to 0 to simulate the other coins.' },
  },
  play: async ({ canvas }) => {
    const note = canvas.getByText('No reference closes for Solana yet. Set its share to 0 to simulate the other coins.');
    await expect(note).toBeVisible();
    const field = canvas.getByRole('textbox', { name: 'Solana share (%)' });
    await expect(field.getAttribute('aria-describedby')?.split(' ')).toContain(note.id);
  },
};
