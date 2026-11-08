import { useSyncExternalStore } from 'react';

// Base UI's checkbox, radio and switch render a visually hidden <input> with an inline style
// attribute, and an open collapsible panel carries one too. The CSP blocks inline style attributes in
// server HTML (docs/SECURITY.md §4), so those parts wait for the client: there React sets styles
// through the CSSOM, which the policy allows. Base UI suggests the same ("render the affected
// components only on the client", its CSP Provider page). Collapsible, Checkbox, Switch and RadioCard
// are therefore for client-rendered app screens only: on the site pages prerendered with no script
// (ADR-0045) an open panel's content would be missing and the look-alikes would stay inert.

const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/** False while the server renders and while React hydrates that HTML; true on every render after. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, onClient, onServer);
}
