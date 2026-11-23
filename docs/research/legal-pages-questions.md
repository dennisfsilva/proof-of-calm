# The legal pages' two questions, 2026-11-19

The drafts of the legal pages (#255) left two questions for `docs/LEGAL.md` §9. Does a web app
established in Portugal that charges nothing already owe the consumer-dispute (RAL) information and
the electronic complaints book? And may the browser keep the outbox copy, written for a sync the app
does not offer yet, without consent? An agent read the texts on 2026-11-19, on the owner's
delegation of 2026-11-18. This is a record of what the texts say, not a legal opinion, and no lawyer
has read it.

## Sources

Every page was read on 2026-11-19.

- The Portuguese laws, in the consolidated texts of the Procuradoria-Geral Regional de Lisboa, a
  public prosecutor's database and not the official journal, whose own site renders by script: Lei
  144/2015 (https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=2425&tabela=leis); DL
  156/2005 in its 12th version, last amended by DL 102/2026 of 22 May 2026
  (https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=737&tabela=leis); the RJCE, DL 9/2021
  (https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=3420&tabela=leis); Lei 41/2004 in its
  3rd version (https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=707&tabela=leis).
- Portaria 201-A/2017, as the journal's PDF of 2017 hosted by a professional order
  (https://www.omd.pt/content/uploads/2017/12/portaria-201A2017-30-06.pdf).
- EU acts on EUR-Lex: Directive (EU) 2025/2647
  (https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202502647); Directive 2002/58/EC as
  consolidated on 2009-12-19
  (https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02002L0058-20091219); Regulation
  (EU) 2016/679 (https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679);
  Regulation (EU) 2024/3228
  (https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202403228).
- The Article 29 Working Party's Opinion 04/2012, WP 194, adopted 7 June 2012
  (https://ec.europa.eu/justice/article-29/documentation/opinion-recommendation/files/2012/wp194_en.pdf),
  and the EDPB's Guidelines 2/2023, version 2.0, adopted 7 October 2024
  (https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf).
- The complaints-book platform's FAQ, as the Internet Archive's capture of 2021-10-26
  (http://web.archive.org/web/20211026181205/https://www.livroreclamacoes.pt/apoio-utilizador), and
  its operator manual of 2018
  (https://www.amt-autoridade.pt/media/2054/manual_utilizador_operador-economico_registo_plataforma_lre.pdf).
- Vercel's documentation of runtime logs, last updated 2026-08-28
  (https://vercel.com/docs/logs/runtime), and its privacy notice, last updated 2026-06-01
  (https://vercel.com/legal/privacy-policy).

## Question 1: the RAL information and the complaints book

1. **Lei 144/2015 art. 18.** Paragraph 1 puts the duty to inform on suppliers and service providers
   established in Portugal, about the RAL entities they are bound to, by adhesion or by necessary
   arbitration, with those entities' websites. Paragraph 2 places the information on the website, if
   there is one, and in written or adhesion contracts. No sentence of art. 18 mentions payment.
2. **Lei 144/2015 art. 2(1) and art. 3 g).** The law applies to RAL procedures about obligations
   from sale or service contracts, and a service contract is one under which the consumer pays or
   undertakes to pay.
3. **Directive (EU) 2025/2647.** It says Directive 2013/11/EU "currently applies only to contracts
   for which the consumer pays or undertakes to pay a price", and extends it to digital services
   supplied against personal data. Member States transpose it by 20 March 2028 and apply it from 20
   September 2028.
4. **The sanction for art. 18.** A light economic offence, supervised by ASAE: EUR 150 to 500 for a
   natural person and EUR 250 to 1,500 for a micro-enterprise (RJCE art. 18). RJCE art. 56 lets the
   authority give a warning with a deadline instead, for a light offence with no conviction or
   warning in the last three years.
5. **DL 156/2005 art. 2(2).** The electronic complaints book binds all suppliers of goods and
   service providers, in an establishment or through digital means. The articles read (1 to 5-C, 8
   to 13-A and the annex) hold no condition that the service be paid and no definition of a service
   provider.
6. **DL 156/2005 art. 5-B.** The provider holds the electronic book, shows the access to the
   platform on its website visibly and prominently, and answers each complaint within 15 working
   days. Portaria 201-A/2017 art. 11(3) names the entry page; neither text says every page.
7. **The sanction for art. 5-B, and the 90-day warning.** A breach of art. 5-B(1) to (3) is a
   serious economic offence: EUR 650 to 1,500 for a natural person and EUR 1,700 to 3,000 for a
   micro-enterprise. Art. 9-A requires a warning with 90 consecutive days to comply before any
   proceeding is opened, and the file is closed if the trader complies.
8. **The annex of DL 156/2005.** Point 15 names crypto-asset service providers and point 13 the
   issuers of asset-referenced and e-money tokens. A planner is in none of its points; the annex
   opens with "designadamente" (namely), so it is not a closed list.
9. **The platform's FAQ of 2021.** It reads the duty widely for websites, says nothing about
   services that are free, and tells an operator whose sector or activity code is not on its
   regulator's list not to register and to ask the regulator. Registration is by regulator and
   activity code. That registration presupposes an opened activity is an inference from the 2018
   manual and the 2021 FAQ, not verified on today's platform.
10. **The EU's ODR platform.** Regulation (EU) 2024/3228 repealed Regulation (EU) No 524/2013 from
    20 July 2025 and stopped complaint submission on 20 March 2025. No article tells traders to
    remove the link; the duty to link ended with the repeal. Lei 144/2015 art. 20(2) still names the
    ODR contact point.

## Question 2: the outbox copy

1. **What the app writes.** Every plan and entry row written is also put in the IndexedDB store
   `outbox` for M3's push (`packages/app/src/lib/adapters/idb-store.ts`, ADR-0019). Nothing reads it
   before the sync exists.
2. **Directive 2002/58/EC art. 5(3).** Storing information on the user's device needs consent,
   except technical storage solely to carry out a transmission, or storage strictly necessary to
   provide an information society service the user explicitly requested.
3. **Lei 41/2004.** Art. 5 transposes it in the same terms. Art. 14(1)(e) makes a breach an offence
   fined EUR 1,500 to 25,000 for a natural person and EUR 5,000 to 5,000,000 for a legal person.
4. **Opinion 04/2012.** The exemption has two tests: the user explicitly requested the
   functionality, and the storage is strictly needed for it. A service is the sum of the
   functionalities the user requested, necessity is judged from the user's side, and an item kept
   for several purposes is exempt only if each purpose is.
5. **The EDPB's Guidelines 2/2023.** Storage done by instructing software on the device counts as
   storage, whatever its amount or duration (paragraphs 36 and 37). The guidelines do not analyse
   the exemptions (paragraphs 4 and 40).
6. **The CNPD.** It has published no guideline on cookies or device storage; its note of 2021-06-25
   only announced one.

## Retention

- **Vercel's runtime logs, by plan.** Hobby 1 hour; Pro 1 day; Pro with Observability Plus 30 days;
  Enterprise 3 days, and 30 days with Observability Plus. Runtime logs are the logs of function
  invocations; a static request appears only when served from cache.
- **Beyond that table.** Vercel's privacy notice gives no period: it says the company collects the
  IP addresses of a customer's visitors and keeps information "for the minimum necessary period".
  The figures above are the documented period of stored runtime logs, not a statement that every
  trace of a request is gone by then.
- **The GDPR's storage limitation.** Art. 5(1)(e) allows keeping identifiable data "no longer than
  is necessary for the purposes"; recital 39 asks the controller to set time limits for erasure or
  periodic review; art. 13(2)(a) requires the notice to state the period or its criteria. No text
  and no regulator's figure for support mail was found: the 24 months are the repository's own.

## What was not read or verified

- The Direção-Geral do Consumidor's pages, which render by script. A search summary says it reads
  art. 18 as covering every supplier to consumers; that reading is not verified.
- Today's complaints-book FAQ, registration form and price: the platform was rebuilt and renders by
  script.
- The official journal's own pages, and any amendment of Portaria 201-A/2017 after 2017.
- The EUR 5,000 threshold for necessary arbitration (Lei 24/96 art. 14), seen only in a search
  summary.
- Whether a planner's activity code is on any regulator's list on the platform, and whether the
  owner has an opened activity: the owner's circumstances, not looked up.

The decision is in `docs/LEGAL.md` §9.
