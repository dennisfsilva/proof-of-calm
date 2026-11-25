// The local Lighthouse run's configuration (`pnpm lighthouse`, `lhci autorun --config=lighthouse/local.cjs`):
// lighthouserc.json plus the one launch flag no deployment may get. The local server's certificate is
// self-signed (tools/serve/self-signed.ts), so Chrome ignores certificate errors here, or the service worker
// does not register. lighthouse-vercel.yml reads lighthouserc.json from the deployed commit and
// tools/lighthouse/vercel.ts from its own, which may predate any filter, so the flag stays out of
// lighthouserc.json; nothing on the deployment path reads this file. A JS rc because LHCI's autorun skips
// `extends` when it decides what to run, and the flag is appended because LHCI merges arrays by index.
const rc = require('../lighthouserc.json');

const { collect } = rc.ci;
const launch = collect.puppeteerLaunchOptions ?? {};

module.exports = {
  ...rc,
  ci: {
    ...rc.ci,
    collect: {
      ...collect,
      puppeteerLaunchOptions: { ...launch, args: [...(launch.args ?? []), '--ignore-certificate-errors'] },
    },
  },
};
