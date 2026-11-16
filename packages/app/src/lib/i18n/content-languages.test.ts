import { CONTENT_LANGUAGES } from '@proofofcalm/content';
import { expect, it } from 'vitest';
import { UI_LANGUAGES } from './locale';

// The services pass the boot language to the content loaders (ADR-0057), so each UI language is a content language.
it('UI_LANGUAGES equals CONTENT_LANGUAGES', () => {
  expect([...UI_LANGUAGES]).toEqual([...CONTENT_LANGUAGES]);
});
