# ADR-0038: Payments: merchant of record (M5; constraints recorded now)

Status: Accepted; its CSV-import finding settled by ADR-0039 (all CSV import in the free core) · Date: 2026-10-16 · Deciders: planning session (research: `docs/research/legal-regime.md` §6)

## Context

ADR-0010 fixed: payments only in M5, through a merchant of record so EU VAT and invoicing are handled, with Lemon Squeezy or Paddle as the candidates. The research read each provider's current acceptable-use policy on 2026-10-16:

| Provider | Decisive clause (verbatim) | Verdict |
|---|---|---|
| Lemon Squeezy (Sold through Link, LLC; part of Stripe since 2024) | Prohibited: "NFT & Crypto related products." — "The entire crypto market is extremely volatile and Lemon Squeezy is not designed to support these types of products" | **Prohibited** |
| Polar (merchant of record; AUP of 2026-03-25) | Not accepted: "financial advice content or services related to tax guidance, wealth management, trading signals," investment strategies; "NFTs and Crypto assets" | **Prohibited** |
| Paddle (AUP of 2026-04-13) | Prohibited: "Investment or financial advice, including trading signals and strategies"; "Any product or service that is considered a regulated financial product or service in any jurisdiction"; Paddle "reserves the right to exercise judgment" | **Restricted in practice**: written pre-approval required |
| Stripe Payments (restricted-businesses list of 2026-09-22) | Prohibited only "Cryptocurrency mining and staking", "Initial coin offerings (ICOs)", "Secondary NFT sales"; restricted "Cryptocurrency exchanges and wallets", "Investment and brokerage services"; a Japan-only ban on "tools on how to profit through trading or investments in financial products or cryptocurrency" shows the sensitivity | **Allowed**, subject to Stripe's discretion; not a merchant of record |
| Stripe Managed Payments (merchant of record; "Sold through Link") | Portugal eligible; "Software" supported; 3.5 % on top of card fees; access "based on an eligibility review that considers factors such as business type and geography" | **Apply; likely allowed** |

## Decision

- Primary: **Stripe Managed Payments** as merchant of record, if its eligibility review passes; the application describes the product exactly: planning and record-keeping software, no custody, no execution, no advice, no signals, generic templates.
- Fallback 1: **Paddle** with written pre-approval from its risk team on the same description.
- Fallback 2 (always available): **Stripe Payments + Stripe Tax + the EU One-Stop Shop + Portuguese certified invoicing**, accepting the compliance workload.
- Lemon Squeezy and Polar are excluded.
- Tips stay out of the launch of Plus (at Lemon Squeezy they are prohibited, at Managed Payments out of scope; on Stripe Payments they are allowed; the tax treatment needs the accountant).
- Preconditions before the first charge (`docs/LEGAL.md` §7): legal entity and VAT status decided with a certified accountant; the provider's written approval; the invoicing path (one B2B invoice per payout to the merchant of record, or certified software); Terms with the paid-features section (price including VAT, renewal, cancellation, the 14-day withdrawal right and model form, the "start now" request at checkout, the change process under the Digital Content Directive); the Livro de Reclamações Eletrónico and the RAL information; the privacy notice naming the provider; a copy review of all paid-tier text.

## Consequences

- The store apps (M3) do not sell Plus in-app unless store rules force it; the web tier remains usable inside the wrapper (ADR-0002).
- Entitlements are a small module at the feature boundary; the core never knows about tiers.
- The product description used with providers is the same sentence as in the Terms and on the pricing page; nothing in marketing may call Proof of Calm a tool to profit.
- One finding is recorded for the owner without changing ADR-0010: every tracker in the market offers CSV import free, and most European brokers export CSV only; keeping single-file CSV import behind Plus may cost the onboarding of exactly the saver the product targets. A free single-file import with repeated or multi-venue imports in Plus is the alternative to consider at M4.

## Disagreement

None on the merchant-of-record decision itself; the named candidates changed because two of them forbid the product.
