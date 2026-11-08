# @proofofcalm/app

The product itself, host-agnostic: feature folders (`features/`, the shell among them), the shell's
ports and adapters (`lib/`: ports, adapters (storage, api-client, prices, history, drafts, clock, ics, platform),
store, services (the composition the hosts call once), i18n, format, errors, brand, pwa, theme,
navigation; auth in M3) and the message files. `apps/web` and `apps/mobile` are thin hosts that render these screens. Boundaries:
`docs/ARCHITECTURE.md`; decision: ADR-0032. Created in milestone M0.
