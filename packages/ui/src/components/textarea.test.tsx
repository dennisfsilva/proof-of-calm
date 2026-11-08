import type { ChangeEvent } from 'react';
import { describe, expectTypeOf, it } from 'vitest';
import type { TextareaProps } from './textarea';

// The Textarea renders a <textarea>, so its props are a textarea's: handlers see HTMLTextAreaElement,
// textarea attributes are accepted and an input's are not. Checked by `pnpm typecheck`.
describe('TextareaProps', () => {
  it('types its events and attributes from the element it renders', () => {
    expectTypeOf<Parameters<NonNullable<TextareaProps['onChange']>>[0]>().toEqualTypeOf<
      ChangeEvent<HTMLTextAreaElement>
    >();
    expectTypeOf<TextareaProps>().toHaveProperty('cols');
    expectTypeOf<TextareaProps>().toHaveProperty('wrap');
    expectTypeOf<TextareaProps>().toHaveProperty('onValueChange');
    expectTypeOf<TextareaProps>().not.toHaveProperty('accept');
    expectTypeOf<TextareaProps>().not.toHaveProperty('step');
  });
});
