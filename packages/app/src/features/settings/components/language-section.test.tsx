// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from 'storybook/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY, PREVIEW_LANGUAGES, type UiLanguage } from '../../../lib/i18n';
import settings from '../../../messages/en/settings.json';
import { LanguageSection } from './language-section';

// Settings → Language (ADR-0023, Deviations of 2026-11-18): shown only when the build offers two languages; a choice
// stores `poc.language` and reloads the page, so every namespace on screen is in one language. Each option names its
// language in itself and carries its `lang`.

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function mount(languages?: readonly UiLanguage[], reload = vi.fn()) {
  render(
    <I18nProvider messages={{ settings }} {...(languages === undefined ? {} : { languages })}>
      <LanguageSection reload={reload} />
    </I18nProvider>,
  );
  return reload;
}

// Base UI names the select a render after it shows (the label registers its id in an effect).
const languageSelect = () => screen.findByRole('combobox', { name: 'Language' });

describe('LanguageSection', () => {
  it('renders nothing while the build offers one language', () => {
    mount();
    expect(screen.queryByRole('heading', { name: 'Language' })).toBeNull();
    mount(['en']);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('offers the preview languages, each named in itself with its lang, English chosen', async () => {
    mount(PREVIEW_LANGUAGES);
    expect(screen.getByRole('heading', { name: 'Language' })).toBeTruthy();
    expect(screen.getByText('The app reloads in the language you choose.')).toBeTruthy();
    const select = await languageSelect();
    expect(select.textContent).toContain('English');
    await userEvent.setup({ document }).click(select);
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => [option.textContent, option.getAttribute('lang')])).toEqual([
      ['English', 'en'],
      ['Português (Portugal)', 'pt-PT'],
    ]);
  });

  // The reload follows the pick at once, so the line that says so leads (CONTENT-STYLE §1.10), between the heading
  // and the select, as the Country section places its line, and the select's trigger is described by it.
  it('says the app reloads before the select, and describes the select with it', async () => {
    mount(PREVIEW_LANGUAGES);
    const line = screen.getByText('The app reloads in the language you choose.');
    const select = await languageSelect();
    expect(line.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line.id).not.toBe('');
    expect(select.getAttribute('aria-describedby')?.split(' ')).toContain(line.id);
  });

  it('stores pt-PT and reloads once when Português is chosen', async () => {
    const reload = mount(PREVIEW_LANGUAGES);
    const user = userEvent.setup({ document });
    await user.click(await languageSelect());
    await user.click(await screen.findByRole('option', { name: 'Português (Portugal)' }));
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('pt-PT');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('neither stores nor reloads when the current language is chosen again', async () => {
    const reload = mount(PREVIEW_LANGUAGES);
    const user = userEvent.setup({ document });
    await user.click(await languageSelect());
    await user.click(await screen.findByRole('option', { name: 'English' }));
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });
});
