import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { useLocale, useMessages } from 'use-intl';
import { I18nProvider, PREVIEW_LANGUAGES, type UiLanguage } from '../../../lib/i18n';
import { LanguageSection } from './language-section';

// Settings → Language as a preview deployment offers it (ADR-0023, Deviations of 2026-11-18): the preview's
// languages around the preview's own provider, so the language toolbar still sets the copy. The reload is a spy, so
// a choice does not reload Storybook. The test projects of vitest.config.ts render it at 360 and 1280 px, light and
// dark, with axe.

function PreviewLanguages({ children }: { children: ReactNode }) {
  const locale = useLocale() as UiLanguage;
  const messages = useMessages();
  return (
    <I18nProvider locale={locale} messages={messages} languages={PREVIEW_LANGUAGES}>
      {children}
    </I18nProvider>
  );
}

const meta = {
  title: 'Features/Settings/LanguageSection',
  component: LanguageSection,
  args: { reload: fn() },
  parameters: { path: '/settings' },
  decorators: [
    (Story) => (
      <PreviewLanguages>
        <Story />
      </PreviewLanguages>
    ),
  ],
} satisfies Meta<typeof LanguageSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Offered: Story = {};

export const ChoosesPortuguese: Story = {
  play: async ({ args, canvas, canvasElement }) => {
    // Base UI names the select a render after it shows; a click before that can land on a select still settling.
    await userEvent.click(await canvas.findByRole('combobox', { name: 'Language' }));
    const popup = within(canvasElement.ownerDocument.body);
    const options = await popup.findAllByRole('option');
    await expect(options.map((option) => option.getAttribute('lang'))).toEqual(['en', 'pt-PT', 'de']);
    await userEvent.click(await popup.findByRole('option', { name: 'Português (Portugal)' }));
    await waitFor(() => expect(args.reload).toHaveBeenCalledTimes(1));
    canvasElement.ownerDocument.defaultView?.localStorage.removeItem('poc.language');
  },
};
