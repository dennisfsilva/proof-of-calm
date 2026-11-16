// The environment for the real git a test or a test's helper runs: the caller's without its GIT_* variables.
// A git hook sets GIT_DIR and GIT_INDEX_FILE (a relative `.git` too), which aim every git below it at the
// hook's repository whatever folder it runs in, so each such git also gets an explicit cwd.

/** `env` without the variables whose name starts with GIT_, in any case (Windows names ignore case). */
export function withoutGitVariables(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
}

/** This process's environment without its GIT_* variables. */
export const GIT_FREE_ENV: NodeJS.ProcessEnv = withoutGitVariables(process.env);
