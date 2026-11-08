import type { Meta, StoryObj } from '@storybook/react-vite';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { expect, waitFor } from 'storybook/test';
import { Checkbox } from '../components/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/collapsible';
import { RadioCard, RadioGroup } from '../components/radio-group';
import { Switch } from '../components/switch';

// Proves the server-to-client path of the controls that wait for the client (lib/hydrated.ts): their
// server HTML carries no style attribute (the CSP, docs/SECURITY.md §4), React hydrates it without a
// mismatch, and the real Base UI controls take over with the same state right after.
function Controls() {
  return (
    <div className="flex max-w-reading flex-col gap-stack-md">
      <label className="flex min-h-row items-center justify-between gap-stack-md text-16">
        Reduce motion
        <Switch defaultChecked />
      </label>
      <label className="flex items-center gap-1 text-16">
        <Checkbox />I understand that this is not advice.
      </label>
      <RadioGroup aria-label="Country" defaultValue="DE">
        <RadioCard value="PT" badge="PT" title="Portugal" />
        <RadioCard value="DE" badge="DE" title="Germany" />
      </RadioGroup>
      <Collapsible defaultOpen>
        <CollapsibleTrigger>More</CollapsibleTrigger>
        <CollapsibleContent>The venue of each buy.</CollapsibleContent>
      </Collapsible>
    </div>
  );
}

const meta = {
  title: 'Checks/Hydration',
  render: () => <div data-testid="host" />,
} satisfies Meta;

export default meta;

export const ServerThenClient: StoryObj<typeof meta> = {
  play: async ({ canvas }) => {
    const host = canvas.getByTestId('host');
    const html = renderToString(<Controls />);
    await expect(html).not.toMatch(/\sstyle="/);
    host.innerHTML = html;
    await expect(host.querySelector('[role="switch"]')).toBeNull();

    const errors: unknown[] = [];
    const root = hydrateRoot(host, <Controls />, { onRecoverableError: (error) => errors.push(error) });
    await waitFor(() => expect(host.querySelector('[role="switch"]')).not.toBeNull());
    await expect(host.querySelector('[role="switch"]')).toHaveAttribute('aria-checked', 'true');
    await expect(host.querySelector('[role="checkbox"]')).toHaveAttribute('aria-checked', 'false');
    await expect(host.querySelector('[role="radio"][aria-checked="true"]')).toHaveTextContent('Germany');
    await expect(host.querySelector('[data-slot="collapsible-content"]')).toHaveTextContent('The venue of each buy.');
    await expect(errors).toEqual([]);
    root.unmount();
  },
};
