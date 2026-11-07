import { loadRules } from '@proofofcalm/content';
import type { Plan } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import type { Snapshot } from '../../../lib/ports';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, recordingPlatform } from '../../../lib/services/testing';
import { TaxYearExport } from './tax-year-export';

// The tax-year export under Your data over the fixture plan in Portugal (the running 2026 chosen), the same plan
// in the United Kingdom (its years across two calendar years), a device that saves no file, a plan with no
// entries and a device without the country's rules; the test projects of vitest.config.ts render each at 360
// and 1280 px, light and dark, with axe.

const nowMs = fixtureNowMs('buy');
const fixture = fixtureSnapshot();
const withPlan = (patch: Partial<Plan>, entries = fixture.entries): Snapshot => ({
  ...fixture,
  plan: { ...(fixture.plan as Plan), ...patch },
  entries,
});
const at = (snapshot: Snapshot, options: Parameters<typeof createTestServices>[0] = {}) => ({
  services: () => createTestServices({ snapshot, nowMs, rules: loadRules, ...options }),
});

const meta = {
  title: 'Features/Settings/TaxYearExport',
  component: TaxYearExport,
  parameters: { path: '/settings', ...at(fixture) },
} satisfies Meta<typeof TaxYearExport>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Portugal: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByLabelText('Tax year')).toHaveValue('2026');
    await expect(canvas.getByRole('option', { name: '2026 (still running)' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Export tax-year CSV' })).toBeVisible();
  },
};

export const UnitedKingdom: Story = {
  parameters: at(withPlan({ country: 'GB' as Plan['country'], payCurrency: 'GBP', displayCurrency: 'GBP' })),
  play: async ({ canvas }) => {
    await canvas.findByLabelText('Tax year');
    const options = canvas.getAllByRole('option').map((option) => option.textContent);
    await expect(options).toEqual(['2026 to 2027 (still running)', '2025 to 2026']);
  },
};

export const NotSaved: Story = {
  parameters: at(fixture, { platform: { ...recordingPlatform(), download: async () => false } }),
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Export tax-year CSV' }));
    await waitFor(() =>
      expect(canvas.getByRole('alert')).toHaveTextContent('The file was not saved. Export again to keep a copy.'),
    );
  },
};

export const NoEntries: Story = {
  parameters: at(withPlan({}, [])),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('No entries yet, so there is no tax year to export.')).toBeVisible();
    await expect(canvas.queryByRole('button')).toBeNull();
  },
};

export const RulesNotLoaded: Story = {
  parameters: at(fixture, { rules: async () => null }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/^Your country's rules are not loaded on this device\./u)).toBeVisible();
    await expect(canvas.queryByRole('combobox')).toBeNull();
  },
};
