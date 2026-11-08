import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { Button } from '../components/button';

// Proves the React Compiler runs over this package in Storybook, as it does in the hosts (ADR-0045 §12):
// the compiler keeps an element whose props never change, so React skips that child when its parent
// renders again. Without the compiler the child renders, and runs its effect, every time. The stories
// and the components pass through the same plugin, so this module stands for both.
const parentCommitted = fn();
const childCommitted = fn();

function Child() {
  useEffect(() => {
    childCommitted();
  });
  return <p>This child takes no props.</p>;
}

function Parent() {
  const [renders, setRenders] = useState(0);
  useEffect(() => {
    parentCommitted();
  });
  return (
    <div className="flex flex-col items-start gap-stack-md">
      <Button onClick={() => setRenders(renders + 1)}>Render the parent again</Button>
      <Child />
    </div>
  );
}

const meta = {
  title: 'Checks/React Compiler',
  render: () => <Parent />,
} satisfies Meta;

export default meta;

export const UnchangedChildIsSkipped: StoryObj<typeof meta> = {
  play: async ({ canvas }) => {
    await waitFor(() => expect(parentCommitted).toHaveBeenCalled());
    parentCommitted.mockClear();
    childCommitted.mockClear();

    await userEvent.click(canvas.getByRole('button', { name: 'Render the parent again' }));
    // A commit runs the child's effects before the parent's, so once the parent's has run, a child that
    // rendered again would have been counted.
    await waitFor(() => expect(parentCommitted).toHaveBeenCalledTimes(1));
    await expect(childCommitted).not.toHaveBeenCalled();
  },
};
