// No `.tsx` and no JSON behind this surface: the host registers the worker after the load event, in the
// first idle period.
export { whenIdle } from './idle.ts';
export { type RegisterOptions, registerServiceWorker, type UpdatePrompt } from './register.ts';
export { type UpdateToastLabels, updateToast } from './update-toast.ts';
