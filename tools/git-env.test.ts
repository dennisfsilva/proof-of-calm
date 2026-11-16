import { expect, it } from 'vitest';
import { withoutGitVariables } from './git-env.ts';

it('drops every GIT_* variable in any case and keeps the rest', () => {
  const env = { GIT_DIR: '.git', git_index_file: 'i', Git_Exec_Path: 'x', PATH: '/bin', DIGIT_GIT_: 'kept' };
  expect(withoutGitVariables(env)).toEqual({ PATH: '/bin', DIGIT_GIT_: 'kept' });
});
