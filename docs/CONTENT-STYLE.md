# Content style: voice, microcopy, banned words, the copy review

How Proof of Calm talks. Short, specific, never patronising; no filler, no emoji, no exclamation marks,
no "crypto bro" register; numbers get a unit and a date; nothing that reads like advice. The rules
below are enforced by the banned-words lint on message files, content, templates and emails, and by
the human copy review before release. Sources for the rules: GOV.UK style guide, the 18F content
guide, Monzo's tone of voice, Mailchimp's content style guide, Apple's HIG writing guidance, Stripe's
documentation conventions (`docs/research/brand-content-education.md` §5). The legal half of the
banned list and the regulator phrasings: `docs/LEGAL.md` §4 and §6. Number typography:
`docs/DESIGN.md` §5.

## 1. Ten rules

1. **Every number is a numeral with its unit, and every date has a day, month and year.** `€100 on
   16 Oct 2026`, never "a hundred euros last month". Any number that can change (a price, a balance,
   a rule) carries its date.
2. **Say what it is, not what it means for the brand.** No storytelling, no grandiose claims, no
   "we believe".
3. **No filler, metaphors or idioms.** Banned helper words: deliver, empower, leverage, key, robust,
   streamline, seamless, powerful, journey, unlock, boost.
4. **Short sentences, one idea each, active voice.** Check any sentence over 25 words. Paragraphs of
   at most five sentences. The passive only to avoid blame in an error.
5. **Never patronise, never make light of money.** Serious is not formal; no jokes; no wit in
   operational messages, ever.
6. **No exclamation marks, no interjections, no "please", no "oops".**
7. **Buttons are verbs; labels say what happens.** `Bought as planned`, `Skip October`, `Export CSV log`;
   never "Click here", "Let's go", "Got it".
8. **Errors sit next to the problem, name the fix, and do not say "we".** `Choose a date on or after
   the first buy`, not "Oops, we couldn't save that".
9. **Sentence case everywhere; "cannot", not "can't"; other contractions allowed; serial comma.**
   English lists take it in every English UI locale, en-GB's included (`BTC, ETH, and SOL`), since
   `lib/format` builds English lists with the `en-US` rule; other languages keep their own.
10. **Write for the stressed reader and the skimmer.** Lead with the point; the fall page is for
    someone whose portfolio fell 30 % this week.

Register: a careful friend who happens to be an accountant and a developer. We are precise, calm,
and on the user's side; we are not cheerful, urgent, clever or reassuring. We never tell anyone what
to buy, when to buy or where to buy.

## 2. Advice-shaped language: the ban list

Banned in UI strings, content, templates, emails and marketing. The table names the English words;
the lint holds each language's own rows (the Portuguese rows below) and runs them together over every
text, so a pattern refuses its word in any language: the Portuguese `garant` row refuses the German
`Keine Garantie für Kursgewinne`, as the guarantee row bans in every language. A per-phrase
allow-list holds proper names of taxes such as "imposta di bollo" or "box 3":

| Banned | Why | Write instead |
|---|---|---|
| recommend, recommended, recommendation | advice | `default`, `a starting point`, state the choice and its consequence |
| you should, should buy/hold/sell, must buy, we suggest, our pick, tip | advice | `you can`, `if you want X, do Y`, `the default is`, `one option is` |
| safe, safer, secure investment | nothing here is | describe the risk; for custody `in your control`, `harder to lose` |
| guaranteed, guarantee | false | the number, its date, and `so far` |
| wealth, build wealth, get rich | aspirational register | `savings`, `money`, `holdings` |
| returns, profits, gains, yield, passive income, earn (as promises) | implies expectation | `outcome`, `value today against cost`, dated past tense: `ended at 1.89× cost` |
| expected return, target price, projected, will rise, will go up, will recover, bound to | forecast | `has risen` with dates; in education `may`, with the stated reason and its caveat |
| best coin, top coins, winners, smart money | ranking, hype | `the coins in your plan`; comparisons only with numbers and dates |
| moon, to the moon, HODL, bullish, bearish, pump, dip, buy the dip, stack sats | hype, forecast register | `rose 48 % between 1 Apr and 6 Oct 2025`, `hold`, `keep`, `down 35 % from the 90-day high` |
| opportunity, don't miss, now is the time, last chance, hot, trending, breaking, alert | urgency | `the buy day is 1 November` |
| easy, just, simply, effortless | patronising; hides effort | delete the word; list the steps |
| inflation hedge, digital gold, store of value (as fact) | contested claims | attribute or omit |
| cheap, undervalued, discount, free (as a lure) | advice, hype | plain statements with a number and a date |
| outperform, beat the market, beat inflation, comparisons with savings accounts or pensions | advice-shaped | omit |
| congratulations, streak, badge, level up, crush, win | gamification | omit (ADR-0013) |
| any second-person imperative about buying or holding | advice | the user's rule in their words: `your rule: €100 on the 1st` |
| regulated, licensed, authorised, MiCA-compliant, approved by (any claim of status) | raises demand and false confidence (`docs/BENCHMARK.md` §3) | nothing; the Risk page's negative statement is the only one (`docs/LEGAL.md` §5) |

The patterns of the lint (EN, DE and PT), the filler words of §1 in English, German and Portuguese, the
regulators a status claim names and the allow-list with a reason per phrase live in
`packages/content/style/banned.json`. The lint also flags any `%` next to a gain word, and, in
English, a sentence with an asset name that opens with a buying, selling or holding verb on its
list: `Buy Bitcoin every month`; `Buy day` is the plan's noun and passes. The placeholders that item 1 of the imperative rule below lists count as asset names here
too, so `Sell {units} now` fails. The lint does not count `{sold}`, `{fee}`, `{log}` and `{file}`
as asset names, as in the imperative rule's item 1; the copy review (§8) checks them by hand. A
`{date:<field>}` placeholder counts as one word, as it does there. Only a verb that opens the
sentence is read. The lint reads the first words of every `plural`, `select` or `selectordinal`
branch, nested ones included, as a sentence start, and a verb on the list there fails with or
without an asset name. `{count, plural, one {Sell it} other {Sell them}}` fails, and so does
`{coins, select, one {} other {Hold}} the amounts on {date}.` A quoted brace (`'{'`) opens no
branch, and a `#` or a `{date:<field>}` placeholder that opens a branch is its first word. A verb
after a dot inside a branch opens a new sentence and is read as any sentence is. German and
Portuguese: below. Template names need a human sign-off.

The German line rule below also reads English text, as every row reads every text, and it refuses
more than English needs on purpose: in a line that names an asset, the English words spelled like
one of its forms fail, `spare`, `spar`, `halt`, `hole` and `staple`, in lower case anywhere and
with a capital where a clause opens. So `Keep a spare copy of your Bitcoin plan` fails; English copy
avoids those words beside an asset name (`a second copy`, `pause`), and `money you can spare` passes
in a line that names none.

The Portuguese rows (decided 2026-11-15; the voice is §9):

- Every row above has its Portuguese form, except the words of the next bullet: `recomendamos`;
  every form of `dever` the list holds (`deve`, `devem`, `deves`, `devemos`, `devo`, `devia`,
  `deviam`, `devias`, `devíamos`, `deveria`, `deveriam`, `deverias`, `deveríamos`, `deverá`,
  `deverão`, `deveremos`, `devam`, `devesse`, `devessem`), with or without `-se` and with at most one
  of `não`, `nunca`, `sempre`, `também`, `já`, `só` or `apenas` between, before `comprar`, `vender`,
  `manter`, `deter`, `investir`, `acumular`, `reforçar`, `adquirir` or `apostar`, bare or with `-lo`,
  `-la`, `-los` or `-las` (`Deve comprá-las`), but not before `guardar` (`Deve guardar a chave
  privada`); `aconselho`, `aconselhamos`, `aconselha-se`, a form of `aconselhar` with a pronoun after
  its hyphen (`aconselho-o`), `aconselhável`, `sugiro`; `tem de`, `tem que`, `têm de`, `têm que`,
  `precisa de`, `precisam de`, `vale a pena`, `convém`, `é melhor` and `é preferível` right before
  the same nine infinitives with the same pronouns, or before `guardar`, which the earlier rule
  refused there (`Convém reforçar a posição`, `É melhor manter as suas bitcoins`, `Precisa de
  guardar as moedas`); `sugerimos`,
  `a nossa escolha`, `dica`, `seguro`, `garantia`, `garanta`, `riqueza`, `ficar rico`,
  `rendimento passivo`, `ganhe dinheiro`, `retorno esperado`, `preço-alvo`, `projetado`, `projeção`,
  `vai subir`, `recuperará`, `há de subir`, `vai voltar a subir`, `deverá subir`,
  `de certeza que vai`, `disparar` in every form (`disparou`, `dispararam`, `disparado`,
  `disparando`; `disparidade` passes), `melhores moedas`, `rumo à lua`, `compre na queda`,
  `aproveitar as quedas`, `acumule sats`, `tendência de alta`, `não perca esta oportunidade`,
  `não deixe passar`, `não fique de fora`, `a não perder`, `imperdível`, `última hora`,
  `agora é a altura`, `é altura de`, `é hora de`, `está na altura de` and `está na hora de` before
  `comprar`, `vender` or `manter` (`O preço da bitcoin caiu. É altura de comprar.`), every word that
  begins `arrepend` (`Se mantiver as suas bitcoins até 2030, não se vai arrepender`), `oportunidade`, `simplesmente`, `sem esforço`, `ouro digital`,
  `proteção contra a inflação`, `reserva de valor`, `subvalorizada`, `bater o mercado`,
  `vencer a inflação`, `parabéns`, `crachá`, `emblema`, `medalha`, `subir de nível`, `regulado`,
  `licenciado`, `autorizado`, `supervisionado`, `aprovado por`, `em conformidade com o MiCA`,
  `cumpre o MiCA`; `registado`, `registrado`, `inscrito` or `supervisionado`, in any gender and
  number, then `no`, `na`, `pelo`, `pela`, `por`, `junto do`, `perante o` or `com o` (or their
  plurals) and a regulator of the list's `regulators`, by its initials or its full name, or
  `regulador` (`Registada na CMVM`, `Inscrita junto do Banco de Portugal`); `alertas de preço` and
  `sem alertas`. Portuguese adds rows the English list has no word for: praise (`muito bem`,
  `bom trabalho`, `continue assim`), reassurance, which §1's register rules out (`não se preocupe`,
  `fique descansado`, `paz de espírito`, `bom caminho`), and the pronoun `você` (§9). The filler
  words: `jornada`, `poderoso`, `desbloquear`, `potenciar`, `alavancar`, `robusto`, `pontos-chave`
  and their kin, `por favor` and `lamentamos` (§1.6, §1.8).
- Words with an everyday sense the copy needs stay off the list, as their English counterparts do:
  `apenas`, `só`, `basta`, `fácil`, `grátis`, `barato`, `desconto`, `alerta`, `queda`, `sequência`,
  `vencedores`, `chave` alone (`chave privada`, `chaves de API`), `entregar`, `simplificar`,
  `previsto` (the plan's dates), `aconselhamento` («não constitui aconselhamento»). `Não perca`
  fails only before an opportunity word, so `Não perca a sua chave privada` passes. `autorizado`
  fails in every use, `não autorizado` too, since the negation lifts no status ban: write
  `sem a sua autorização` or `que não autorizou`. `registada` passes unless a regulator of the list
  follows (`Compra registada no Registo`). Smart money, hot, crush and win have no
  Portuguese word with only the banned sense. The copy review (§8) catches their banned use.
- The gain words `retorno`, `ganho`, `lucro`, `rendimento`, `rentabilidade`, `rendibilidade` (the
  CMVM's word for return) and `mais-valia`, singular or plural, and the verbs `ganhe`, `ganhar`,
  `ganha` and `ganham` fail next to a percentage. A noun may take up to two of `anual`, `mensal`,
  `médio`, `total`, `potencial` and `esperado` after it, then `de`, `é de`, `cerca de`, `até`,
  `mais de`, `superior a` or `acima de` before the figure; a verb takes the same connectors without
  `de`; a figure first takes nothing or `de`. These fail: `uma rentabilidade de 8%`,
  `um retorno potencial de 300%`, `um rendimento de cerca de 8%`, `lucro superior a 10%`,
  `um rendimento médio anual de 8%`, `ganhe 8% ao ano`, `Ganhe até 8% ao ano`,
  `Pode ganhar cerca de 8% ao ano`, `Ganhe mais de 8% por ano`, `o rendimento é de 8% ao ano`,
  `8% de retorno`. Any other word between them is tax prose and passes, and so does a gain word
  after `sobre` (with or without `a`, `as`, `o` or `os`), `das` or `dos`:
  `As mais-valias são tributadas à taxa especial de 28%`, `A taxa sobre as mais-valias é de 28%`,
  `Imposto sobre mais-valias de 28%`, `28% das mais-valias`, `taxa de 28% sobre as mais-valias`,
  `Mais-valias: 28%`. The lint reads
  `28%` and `28 %` alike; a Portuguese page prints `28%` (§4). English joins them with nothing or
  `of`.
- The imperative rule (`packages/content/src/style/directive-pt.ts`). Spelling cannot tell the
  formal imperative from the present subjunctive, the verb `venda` from the noun, or a command
  infinitive from a noun infinitive. The frames that carry advice («É melhor que», «Convém»,
  «desde que») are an open class, so the rule reads the forms themselves:
  1. A sentence that names an asset fails when it holds, anywhere, a form of `comprar`, `vender`,
     `manter`, `deter`, `guardar`, `investir`, `acumular`, `reforçar`, `adquirir`, `apostar`,
     `aproveitar` or `segurar`: the formal imperative or present subjunctive, singular, plural or
     `nós` (`compre`, `comprem`, `compremos`, `venda`, `mantenha`, `invista`); the infinitive, bare or
     with `-lo`, `-la`, `-los` or `-las` (`comprá-las`); or the imperfect subjunctive (`comprasse`,
     `vendesse`, `mantivesse`). So do `continue a comprar` (`investir`, `acumular`) and `troque`,
     `converta`, `liquide` and `diversifique`. This covers `desde que as mantenha` and `se vender`.
     The asset names, in any case: `bitcoin`, `bitcoins`, `ether`, `ethers`, `ethereum`, `solana`,
     `chainlink`, `crypto`, `cripto`, `criptomoeda`, `criptomoedas`, `criptoativo`, `cripto-ativo`
     and `criptoactivo`, singular or plural; `moeda` and `moedas`; every word that ends in `coin` or
     `coins`; `token` and `tokens`; the names of `packages/content/coins.json` as written and its
     26 tickers in capitals, as `packages/content/src/style/banned.ts` takes them (`BTC`, `ETH`,
     `SOL` and `LINK` among them). The German rows below add theirs, and every language reads the
     one list.
     A sentence ends at `!`, `?`, a line end or a dot that no digit follows, so
     `Compre 1.000 € de BTC` is one sentence; the text is read with its accents composed. A
     `{date:<field>}` placeholder counts as one word. Its dots end no sentence, and a ticker in its
     path names no asset: `Mantenha até {date:sellWindow.opens} as suas bitcoins` is one sentence
     and fails. The placeholders the app fills with a coin count as asset names: `{coin}`, `{coins}`
     and `{names}`. So do the placeholders the app fills with units and their ticker (`0.5 BTC`):
     `{units}`, `{held}`, `{heldUnits}`, `{sent}`, `{excess}`, `{short}` and `{outside}`. A new
     placeholder the app fills with units joins this list in `packages/content/src/style/banned.ts`.
     So `Compre {coin} todos os meses` and `Venda {units} agora` fail. In some messages the app
     fills `{sold}`, `{fee}`, `{log}` and `{file}` with units too. Other messages fill the same names
     with money, a link or a currency, so the lint does not count them as asset names. The copy
     review (§8) checks them by hand. The lint reads every other brace's words, an ICU branch's
     included: `{count, plural, one {Mantenha} other {Mantenham}} as suas bitcoins` fails.
  2. `venda` passes as the noun after the words the lint lists (`uma`, `cada`, `de`, `da`, `na`,
     `à`, `pela`, `após`, `sua`, `última` and their kin), after `compra e` or `compras e`, or after
     an `a` that opens the sentence or a clause (not after a comma) or follows a preposition, `e` or
     `ou` (`Após a venda de ETH`).
  3. In a sentence that names an asset (item 1's names and placeholders), where the sentence or a
     clause opens (after a comma, colon, semicolon, bracket, quote, dash or
     bullet), with only `já`, `agora`, `hoje`, `também`, `sempre`, `só`, `apenas`, `então`, `depois` or
     `primeiro` before it, the informal imperative
     fails: `compra`, `vende`, `mantém`, `detém`, `guarda`, `investe`, `acumula`, `reforça`,
     `adquire`, `aposta`, `aproveita`. So does the informal second person after `não`, `nunca`,
     `jamais`, `nem` or `que` (`não vendas`, `que compres`), and `faça`, `efetue`, `realize`,
     `concretize`, `execute`, `antecipe`, `adie`, `proceda` or `dê` up to three words before
     `compra`, `venda`, `investimento`, `reforço` or `aquisição` (`Faça já a sua compra de BTC`).
  4. Write instead `se as mantiver` or `se as detiver`; a participle (`compradas`, `detidas`,
     `se forem vendidas`); `uma venda`, `cada venda` or `as vendas`; or the plan as the subject
     (`O plano prevê uma compra de BTC por mês`). The table below holds the commonest cases.
  5. `disparar` fails in every form: every word that begins `dispar` and then `a`, `á`, `e` or `o`,
     except those that begin `disparat` or `disparag`; so `disparate`, `disparidade` and `díspar`
     pass, and `disparador` fails.
  6. A claim of registration or inscription fails with a regulator of the list's `regulators`, by its
     initials or its full name, or with `regulador` (the status bullet above).
  7. `should buy`, `should hold` and `should sell` cover every form of `dever` the list holds, before
     the infinitives of the first bullet, `guardar` excluded.

  | Refused | Write instead |
  |---|---|
  | `As mais-valias das bitcoins compradas hoje ficam excluídas de tributação desde que as mantenha durante pelo menos 365 dias` | `As mais-valias das bitcoins compradas hoje ficam excluídas de tributação se as mantiver durante pelo menos 365 dias` |
  | `Uma transferência de bitcoins não autorizada por si não pode ser anulada` | `Uma transferência de bitcoins que não autorizou não pode ser anulada` |
  | `Acesso não autorizado por terceiros` | `Acesso de terceiros sem a sua autorização` |
  | `Caso venda BTC antes de 2 de março de 2027, a mais-valia é tributada` | `Numa venda de BTC antes de 2 de março de 2027, a mais-valia é tributada` |
  | `Vender BTC antes de 2 de março de 2027 torna a mais-valia tributável` | `Uma venda de BTC antes de 2 de março de 2027 torna a mais-valia tributável` |
  | `Nesta data, a venda de BTC é tributada` | `Nesta data, a mais-valia de uma venda de BTC é tributada` |
  | `Venda de 0,1 BTC registada` | `Registada uma venda de 0,1 BTC` |
  | `Compra mensal de BTC` | `Montante da compra mensal de BTC` |
  | `O plano é comprar BTC todos os meses` | `O plano prevê uma compra de BTC por mês` |
  | `Comprar BTC` | `Registar compra` |

  The rule misses, and leaves to counsel and the native reader: `Todos os meses compra
  BTC` and `Porque não compra BTC agora?` (spelled like a statement in the third person); the verbs
  it does not list (`largue`, `entre`, `saia`, `fique`, `desfaça`); `realize` and its kin of item 3
  without a purchase or sale noun after them (`Realize os seus ganhos em BTC`); an asset named in
  another sentence (`Tem bitcoins? Não as venda.`); a dot of an abbreviation, which ends the
  sentence (`16 de out. de 2026`); and `junto ao` before a regulator.
- The Risk page's statement on status (`docs/LEGAL.md` §5) passes in Portuguese with no allow-list
  entry, as the Impressum's line does, and the lint's tests hold it: «não está registada junto de
  nenhum supervisor financeiro nem sujeita a qualquer supervisão financeira, e nenhum sistema de indemnização dos
  investidores ou de proteção de depósitos cobre os criptoativos».
- The tax authority's proper names need no allow-list entry, since none puts a gain word right
  beside a percentage: `Imposto sobre o Rendimento das Pessoas Singulares`,
  `rendimentos de capitais` and `Mais-valias e outros incrementos patrimoniais` pass in a profile's
  sentences (`A taxa é de 28% sobre os rendimentos de capitais`). An entry goes on the list only when
  a string needs it, with that string in the lint's tests.
- The lint reports early, on the forms these rows list; it is not the gate. A form it does not list,
  another verb, connector or spelling with the banned sense, belongs to counsel's read of each
  translation in the copy review (§8).

The German rows (decided 2026-11-23; the voice is §10):

- Every row above has its German form:
  - every word that holds `empfehl`, `empfohl`, `empfiehl` or `empfahl` (`Kaufempfehlung`);
    `ratsam`, `Ratschlag` and `wir raten Ihnen`;
  - `Sie sollten`, `sollten Sie` and `man sollte` and their kin, which German's verb-final order
    never puts beside the infinitive (`Sie sollten BTC kaufen`); `wir schlagen vor`, `unser Tipp`,
    `unsere Wahl` and every word that ends in `Tipp`; `lohnt sich` and `lohnenswert`;
  - every form of `sicher` (`sicherem`, `sicherste`), `risikolos`, `risikofrei` and `ohne Risiko`;
    every word that holds `garant` (`Renditegarantie`);
  - `Vermögen` alone and `Vermögensaufbau`, `reich werden`, `Reichtum`, `Wohlstand` and
    `finanzielle Freiheit`; `passives Einkommen`, `Geld verdienen` and `Gewinne mitnehmen`;
  - `erwartete Rendite`, `Kursziel`, `Preisziel`, `Kursprognose`, `prognostiziert`, `projiziert`,
    `wird steigen` and `wird sich erholen`; every word that begins `explodier` or `bereu`; `zum Mond`;
  - `beste Coins` and `Top-Coins`; `HODL`, `Sats`, `Aufwärtstrend`, `bullisch`, `bärisch` and
    `Rücksetzer`;
  - `Chance` and every word that ends in `Gelegenheit`, `nicht verpassen`, `jetzt oder nie`,
    `der richtige Zeitpunkt`, `nur heute`, `Eilmeldung`, `Kursalarm`, `Preiswarnung` and
    `keine Alarme`;
  - uninflected `einfach`, `kinderleicht`, `mühelos` and `im Handumdrehen`;
  - `Inflationsschutz`, `vor Inflation`, `gegen die Inflation`, `digitales Gold` and `Wertspeicher`;
  - `unterbewertet`, `Schnäppchen` and `Ausverkauf`;
  - `den Markt schlagen`, `Tagesgeld`, `Festgeld` and `Sparbuch`;
  - `Glückwunsch`, `Abzeichen`, `Badge`, `Medaille`, `Streak` and `Level-up`;
  - the status words `reguliert`, `lizenziert`, `zugelassen`, `beaufsichtigt`, `genehmigt`,
    `autorisiert`, every word that begins `Erlaubnis`, `MiCA-konform` and `Kaufsignal`;
  - a registration claim with the participle last or first. Its regulator is one of the list's
    `regulators`, `Finanzaufsicht`, or `Aufsichtsbehörde`. Its preposition is `bei` or `von` (with
    or without `der`, `dem`, or `den`) or `durch` (with or without `die`, `den`, or `das`). Last:
    the preposition and the regulator, then at most three other words, each of letters, digits,
    and inner hyphens (`-` or the no-break hyphen U+2011), then `registriert`, `eingetragen`,
    `gemeldet`, or `beaufsichtigt`, or a longer word that begins with one of them
    (`registrierter`). First: `registriert`, `eingetragen`, or `gemeldet`, or a longer word that
    begins with one of them, then the preposition and the regulator; a bare `beaufsichtigt` first
    fails as a status word. Or `Aufsicht` with `der`, `des`, or `durch die`, then a regulator
    (`bei der BaFin registriert`, `registriert bei der BaFin`, `durch die BaFin registriert`,
    `bei der BaFin als Krypto-Dienstleister registriert`, `bei der BaFin seit 2024 registriert`).

  German adds praise and reassurance (`gut gemacht`, `weiter so`, `super`, `toll`, `keine Sorge`,
  `keine Panik`, `bleiben Sie ruhig`, `Seelenfrieden`, `auf dem richtigen Weg`,
  `investiert bleiben`). The filler words are `befähigen`, `Hebel`, `Schlüsselfaktor` and its kin,
  `robust`, `optimieren`, `nahtlos`, `leistungsstark`, `mächtig`, `Reise`, `freischalten` and `boosten`, plus
  `bitte`, `leider`, `danke`, `entschuldigen`, `bedauern` and `tut uns leid` (§1.6, §1.8).
- Words with an everyday sense the copy needs stay off the list: `nur`, `bloß`, `leicht`,
  `günstig`, `billig`, `Rabatt`, `kostenlos`, `Warnung` and `Alarm` alone (the Risk page links
  official warnings), `Rückgang`, `Serie`, `Gewinner`, `Schlüssel` alone (`privater Schlüssel`,
  `API-Schlüssel`), `liefern`, `vereinfachen`, `entsperren`, `voraussichtlich`, `Anlageberatung`
  (`keine Anlageberatung`), `Plus` (Proof of Calm Plus; `Plus von` before a percentage fails),
  `Prognose` (the cycle plan names its forecast), `Rendite`, `Gewinn`, `Ertrag` and `Anlage` alone,
  `Kurs`, `Trend`, `Ziel`, `bleiben`, `Sicherheit`, `Zulassung`, and the inflected `einfache`.
  - `sicher` and `zugelassen` fail in every sense: write `Im Zweifel` and `Wirklich alles löschen?`.
  - The Impressum's line takes DDG § 5 Abs. 1 Nr. 3's word: `Keine Tätigkeit, die der behördlichen
    Zulassung bedarf; keine Aufsichtsbehörde.`
  - Smart money, hot, crush and win have no German word with only the banned sense; the copy review
    (§8) catches their banned use.
- The gain words, any word that ends in `Rendite`, `Gewinn`, `Ertrag` or `Erträge`, `Zins`,
  `Verzinsung`, `Profit`, `Rentabilität`, `Wertzuwachs`, `Wertsteigerung`, `Wertentwicklung`, or
  `Performance` (`Jahresrendite`, `Kapitalerträge`), and the verbs `gewinnen`, `verdienen`,
  `erzielen`, `erwirtschaften`, `einbringen`, and `abwerfen`, fail next to a percentage.
  `Kapitalertragsteuer`, `Gewinner`, `Vertrag`, `Übertrag`, and their compounds pass
  (`Laut Vertrag 2 % Gebühr`, `Sparvertrag mit 3 %`).
  - A noun may take `pro Jahr`, `im Jahr`, `p. a.`, or `im Schnitt`; then a colon, `von`,
    `in Höhe von`, or a form of `betragen`, `liegen bei`, or `sein`; then `bis zu`, `über`,
    `mehr als`, `rund`, `etwa`, `ca.`, `ungefähr`, `um (die)`, `durchschnittlich`, `jährlich`, or
    `monatlich`.
  - A figure first takes up to two of `jährlich`, `monatlich`, `durchschnittlich`, `erwartet`,
    `möglich`, `potenziell`, `zusätzlich`, `garantiert`, or `realistisch` with the ending `e`,
    `en`, `er`, `es`, or `em` or none (`jährliche`), `mehr`, or `an`, or a hyphen (`-` or the
    no-break hyphen U+2011).
  - These fail: `Eine Rendite von 8 % pro Jahr`, `Rendite: 8 %`, `Bis zu 12 % Rendite im Jahr`,
    `Kursgewinne von über 300 %`, `Tagesgeld bringt 3 % Zinsen`, `Verdienen Sie bis zu 8 %`,
    `ein Plus von 48 %`, `wirft 5 % im Jahr ab`.
  - Any other word between noun and figure is tax prose and passes:
    `Kapitalerträge werden mit 25 % besteuert`, `25 % Abgeltungsteuer auf Kapitalerträge`.
  - German has no counterpart of `sobre`: a gain word after `auf`, `für`, `aus` or `des` fails like
    any other (`Freuen Sie sich auf Gewinne von 25 %`), so `Die Steuer auf Kapitalerträge beträgt
    25 %` is written `Kapitalerträge werden mit 25 % besteuert`.
  - `Prozent` reads as `%`.
- The imperative rule (`packages/content/src/style/directive-de.ts`). Spelling cannot tell the
  Sie-imperative from the infinitive or the present, the ihr-imperative from the 3rd person or the
  participle (`verkauft`, `investiert`), or the du-imperative from the noun (`Kauf`, `Tausch`), and
  an infinitive is itself a command (`Jetzt Bitcoin kaufen`). So the rule reads forms, over whole
  lines:
  1. A line that names an asset fails when it holds a form of one of these verbs: `kaufen`,
     `verkaufen`, `halten`, `behalten`, `investieren`, `reinvestieren`, `erwerben`, `veräußern`,
     `akkumulieren`, `sparen`, `besparen`, `tauschen`, `wechseln`, `liquidieren`, `diversifizieren`,
     `realisieren`, `sichern`, `verwahren`, `wetten`, `spekulieren`, `nutzen`, `streuen`, `stapeln`,
     `sammeln` and `holen`, and the separable `nachkaufen`, `zukaufen`, `dazukaufen`, `einkaufen`,
     `ankaufen`, `aufkaufen`, `anlegen`, `nachlegen`, `zulegen`, `ansparen`, `aufstocken`,
     `ansammeln`, `einsammeln`, `aufbauen`, `anschaffen`, `umtauschen`, `eintauschen`, `umwechseln`,
     `umschichten`, `abstoßen`, `einsteigen`, `aussteigen`, `zugreifen`, `zuschlagen`, `mitnehmen`,
     `festhalten`, `durchhalten`, `beibehalten`, `ausnutzen`, `absichern`, `aufbewahren` and
     `glattstellen`. The forms that count:
     - the infinitive and the zu-infinitive, in lower case or with a capital and anywhere (`zum
       Verkaufen`, `das Halten`);
     - the present and imperative of `du`, `ihr` and `Sie`, and the past forms that address the
       reader (present and imperative: `kaufst`, `kauft`, `kauf`; past: `verkauften`, `hieltest`),
       so every participle spelled like them fails too (`verkauft`, `investiert`, `behalten`);
     - a separable verb's base with its particle closing the clause (`Legen Sie Ihr Geld in Bitcoin
       an`); every occurrence of a base is read, so a noun spelled like one before it hides nothing
       (`Nach dem Kauf von BTC legen Sie den Rest in ETH an`);
     - `setzen` with a later `auf`;
     - `durchführen`, `ausführen`, `vornehmen`, `abschließen` and `tätigen` when the line holds a
       purchase noun.

     A form in lower case or capitals counts anywhere. With a capital initial, a finite form counts
     only where a clause opens: the line's start; after any dot, an ordinal's and an abbreviation's
     included, `!`, `?`, `:`, `;`, `,`, an opening quote or bracket, a dash or a bullet; or after
     `und`, `oder`, `aber`, `sondern` or `denn`; with only `jetzt`, `heute`, `sofort`, `auch`, `dann`,
     `nicht` and their kin between. Elsewhere a capital marks a noun, so `der Kauf`, `Erster Kauf`,
     `Kauftag` and `Haltefrist` pass, and so do `hält`, `kaufte` and the `ge-` participles
     (`gekauft`, `gehalten`).
  2. A line is the unit, and dots, `!` and `?` end no line, though each still opens a clause for
     item 1's capital test. A sentence that ends in an ordinal takes no
     second dot (Duden D 154, `Wir treffen uns am 15.`), so no cut tells them apart, and an
     abbreviation list never closes. So `Kaufen Sie am 1. November BTC` and `Haben Sie Bitcoins? Dann
     verkaufen Sie sie nicht.` fail. A Learn module's German lines are read three times: first
     as the source stands, for the English and Portuguese imperatives alone, the German line rule
     left out; then joined, where a paragraph is one line and a source wrap neither ends a line nor
     opens a clause; and as the page sets them, one line per paragraph, heading, list item, quote paragraph or code block, where a
     hard break, each code line and a `<PastPerformance />` beside words open a clause inside the
     line, and so does an item number other than 1 or a line of `=` that may go on with the
     paragraph. The text is read with soft hyphens and zero-width characters taken out.
  3. The asset names, for every language: those of the Portuguese item 1; every word that begins
     `bitcoin` or `crypto`, holds `krypto` or ends in `coin` or `coins`; `Münze`, `Token`, `moeda`,
     `moedas`; the names of `packages/content/coins.json` as written, with a genitive `s`; and their
     tickers in capitals. So `Halten Sie Ihre Coins bis 2029`, `Hold your coins until 2029` and
     `Compre Cardano todos os meses` fail.
  4. A form of `müssen` or `sollen`, or `am besten`, `besser`, `lieber`, `sinnvoll`, `lohnt` or
     `lohnenswert`, fails with an infinitive of item 1 anywhere in the line, with or without an
     asset (`Sie müssen jetzt verkaufen`, `Kaufen sollten Sie jetzt nicht`).
  5. A form of item 1 that opens an ICU branch fails in lower case or with a capital, with or
     without an asset name (`{kind, select, sell {Verkauf eintragen} …}`); a branch that opens with
     `#` or a placeholder passes, so `{count, plural, one {# Kauf} other {# Käufe}}` and the German
     plurals' `{count, plural, one {{figure} Kauf} other {{figure} Käufe}}` pass alike.
  6. Write instead a noun after a determiner (`ein Verkauf von {coin}`), `Bestand` for "what you
     hold", the plan with a noun (`Der Plan sieht jeden Monat einen Kauf von BTC vor`), a `ge-`
     participle, or a line that names no asset. The table below holds the commonest cases.

  | Refused (German) | Write instead |
  |---|---|
  | `Proof of Calm verwahrt nie Ihr Geld oder Ihre Coins. Sie kaufen und verwahren Coins bei einem Anbieter Ihrer Wahl oder in einer eigenen Wallet.` | `Proof of Calm hat nie Ihr Geld oder Ihre Coins in Verwahrung. Für den Kauf und die Aufbewahrung wählen Sie einen Anbieter oder eine eigene Wallet.` |
  | `Wenn Sie Coins selbst verwahren und die Seed-Phrase verlieren, kann niemand sie wiederherstellen.` | `Ist bei Coins in eigener Verwahrung die Seed-Phrase verloren, kann niemand die Coins wiederherstellen.` |
  | `Eingetragen: {amount} {coin} am {date} verkauft.` | `Eingetragen: ein Verkauf von {amount} {coin} am {date}.` |
  | `Dieser Verkauf ist {excess} mehr, als Sie halten ({held} am {date}).` | `Dieser Verkauf übersteigt Ihren Bestand ({held} am {date}) um {excess}.` |
  | `Ein Rückgang der Coins, die Sie halten, ist im Gange.` | `Ein Rückgang der Coins in Ihrem Bestand ist im Gange.` |
  | `Deutschland: Kryptowerte, die Sie länger als ein Jahr halten, sind beim Verkauf steuerfrei.` | `Deutschland: Ein Verkauf von Kryptowerten mehr als ein Jahr nach dem Kauf ist steuerfrei.` |
  | `Der Plan kauft am 1. jedes Monats Bitcoin.` | `Der Plan sieht am 1. jedes Monats einen Kauf von Bitcoin vor.` |
  | `Kauf von 0,01 BTC erfasst.` | `Eingetragen: ein Kauf von 0,01 BTC.` |
  | `{count, plural, one {Kauf} other {Käufe}} von BTC eingetragen.` | `{count, plural, one {# Kauf} other {# Käufe}} von BTC eingetragen.` |
  | `Der 1. Kauf von BTC ist am {date}.` | `Der erste Kauf von BTC ist am {date}.` |
  | `Legen Sie einen Plan für BTC an.` | `Richten Sie einen Plan ein.` |
  | `Halten Sie jeden Kauf von BTC fest.` | `Tragen Sie jeden Kauf ein.` |
  | `Sie müssen nichts verkaufen.` | `Der Plan verlangt keinen Verkauf.` |
  | `Prüfen Sie den Anbieter, bevor Sie Kryptowerte kaufen.` | `Prüfen Sie jeden Anbieter vor dem ersten Kauf von Kryptowerten.` |
  | `Bitcoin wurde 2021 von vielen verkauft.` | `2021 gab es viele Verkäufe von Bitcoin.` |

  The rule misses, and leaves to counsel and the native reader: passive and participle commands
  (`Jetzt wird BTC gekauft`); verbless ones (`Rein in Bitcoin`); unlisted verbs (`bleiben`,
  `loswerden`, `umsteigen`); 3rd-person statements (`Wer BTC länger als ein Jahr hält, …`); a
  particle after the clause (`Steigen Sie ein bei Bitcoin`); an asset named in another message; and
  a directive with no asset (`Jetzt kaufen`, as `Buy now` passes).
- The Risk page's statement on status passes with no allow-list entry when it writes
  `unterliegt keiner Finanzaufsicht`, as Portuguese writes `nem sujeita a qualquer supervisão financeira`.
- The quoted label „Investiert“ and the Portuguese tab «Regra e venda» are on the allow-list, each
  with its reason, and so is the Portuguese text of `docs/LEGAL.md` §5's fixed scams sentence
  (`legal.risk.scams.p1`).

A negation does not lift a ban; say what the app does instead. "No alerts" is still `alert`: write
`no price notifications`, then what the app shows in their place (one line on Today, once per fall).

Allowed vocabulary: template, starting point, a rule some people follow, the plan you set, your rule,
data not advice, historically / in the 2013–2022 cycles (dated), what happened, drawdown, volatility,
you decide, you can change this, record, log, schedule, the asset you chose.

## 3. Microcopy library

Sentence case, no exclamation marks, numbers with a unit and a date, verbs on buttons.

| Moment | Copy |
|---|---|
| Buy day, the one tap | Button `Bought as planned`. Toast (8 s): `Recorded: €100.00 of BTC on 16 Oct 2026.` with `Edit`. If the Log's messages cannot load after the save (offline, another language's message files outside the precache): toast (8 s, no action) `Purchase recorded.` Secondary: `Bought a different amount` · `Skip October`. Another browser tab changed the amount or the split since the card showed them: nothing is recorded, toast (8 s, no action) `Your plan changed in another browser tab, so this purchase was not recorded. Check the amounts shown, then record it again.` A tap that would take the plan past 10,000 entries: nothing is recorded, toast (8 s, no action) `Recording this would take the plan past 10,000 entries, the most a plan holds. Delete entries in the Log to make room.` |
| Late month (buy day 1 Oct, today 16 Oct) | Heading `October is still open`. Body `Buy day was 1 October, 15 days ago. Record it or skip the month.` Buttons `Bought as planned` · `Skip October`. The month keeps the accent marker; no red, no amber. On Today: heading `October 2026 is still open` (the year until `lib/format` has a month name), body `Buy day was 1 Oct 2026, 15 days ago. Record it or skip the month.`, then the buttons `Bought as planned` · `Bought a different amount` · `Skip October 2026` |
| Today, the primary action | Due: `Today is the October 2026 buy day`. Upcoming: `Next buy day: 5 Nov 2026` (only a buy day still ahead). In the buy phase with none ahead (a plan with only a starting amount, or buying ended before the month's buy day): `No buy days left`, with `The sell window opens on 1 Sept 2029.` and no link. Starting amount: `Starting amount: due 1 Oct 2026`; late, body `It was due on 1 Oct 2026, 19 days ago.` One coin chip per planned part; then, due or late, `Bought as planned` · `Bought a different amount` (the entry sheet, prefilled), and otherwise `Record a purchase` (to the Log) |
| Today, the month handled | `October 2026 is recorded` · `October 2026 is skipped` · `October 2026 is paused` (its pause has ended, or buying ended in it; before the first buy day, the first month ahead), each with `Next buy day: 5 Nov 2026.` while a buy day is ahead, otherwise no line, and `Record a purchase`; while the pause lasts: `Paused until 31 Dec 2026` (with no end, `Paused since 16 Oct 2026`, the day it began), the button `Resume`, no link; after Resume the focus moves to the heading |
| Today, past buying (before a handled month, no `Record a purchase` link; in the hold phase `Why?`, on the body's line, or on its own line with no sell window) | `In the hold phase` / `The sell window opens on 1 Sept 2029.` · `In the sell window` / `It closes on 31 Aug 2030.` · `The sell window has closed` / `The plan ends on 31 Dec 2030.` · `The plan ended on 31 Dec 2030` |
| Today, the rest | `Also open`, one line per other open month: `November 2026: due 5 Nov 2026`; `Portfolio value` with the prices line Portfolio shows under its value (`Prices as of 14:05, 20 Oct 2026 · Price data by CoinGecko`, or its Stale prices and Offline forms), or `Invested` without prices; the strip under the link `Your plan`. With a sell window, `Why?` stands beside the link `Your plan`, named `Why? The sell window`. |
| Skip a month | Sheet `Skip October`; field `Note (optional)` with placeholder `e.g. car repair`; button `Skip October`; history line (M2) `October 2026 · skipped · car repair`; in the Log, under the month header `October 2026`, the line drops the month: `Skipped · car repair` (or `Skipped`). Toast (8 s): `October 2026 skipped.` with `Undo`. The app writes the month with its year until `lib/format` has a month name: sheet and button `Skip October 2026`, on Today and in the sheet of a new monthly buy. A note over 200 characters (pasted; the field stops at 200): `Use at most 200 characters in the note.` A month skipped meanwhile (in another browser tab): `October 2026 is already skipped.` under the note; a month recorded meanwhile: `October 2026 is already recorded. Edit or delete that entry in the Log.`; after either, the button stays focusable with `aria-disabled`, since a second press can only be refused again |
| Pause | On Plan while buying lasts: heading `Pause the plan` (End buying and `Edit plan` follow under `Change the plan`, "End buying" row); body `Buy days in the pause are marked paused, not missed. Your entries stay. A calendar file you added keeps its events. When you resume, the next buy day and the last buy keep their dates.` (M1: the calendar file is not rewritten); button `Pause from today`, a pause from today until resumed. Paused: the heading, the status `Paused since 16 Oct 2026` (a polite live region) and the button `Resume`. Pause from today and Resume are one button whose words follow the plan's state, so the focus stays on it through every swap, whichever tab brings it; a press on a plan another tab already paused or resumed shows no refusal; a refusal shows under the button until the plan is paused or resumed, and does not come back (`The plan was not paused, because a pause still to come would overlap a pause from today.` for a pause still to come, imported) |
| End buying | On Plan, in the section `Change the plan` (shown while a plan exists, with `Edit plan` and then `Review the plan` under the end-buying control), while buying lasts, paused or not: button `End buying`, which opens the dialog `End buying` with body `No buy days after today, 3 Oct 2026. Your 14 entries and your sell window stay. A calendar file you added keeps its events.` (without a sell window `Your 14 entries stay.`, `Your 1 entry stays.`; with no entries `Your sell window stays.` or no second sentence; every form ends with the calendar sentence, the Pause body's own; the count grouped in the country's number format, `1,234` or `1.234`, §4) and the buttons `Keep the plan as it is` (first, focused) · `End buying today`. Ended: toast (8 s) `Buying ended on 3 Oct 2026.` with `Undo`, and on Plan the line `Buying ended on 3 Oct 2026.` in place of the button, under `Change the plan`, and no Pause section; a calendar file added earlier keeps its events, and Settings' calendar row says so ("Calendar reminder (Settings)" row). The focus goes to that line after an end, also when another tab ended first; `Keep the plan as it is` gives it back to `End buying`, or, when the button is gone, to the ended line, else the Plan heading; an Undo that restored buying moves it to `End buying` unless the person moved it meanwhile. While the end runs the dialog stays open (`docs/DESIGN.md` §8, "Dialog footer"). An Undo refused (another tab, a later last buy and a second end, a replace or Delete everything since the end): toast (8 s) `Your plan changed after you ended buying, so the earlier last buy was not put back.` A refusal shows in the dialog with the words of `errors.action.before-first-buy` and `errors.action.buying-over` |
| Log month header | `March 2026 · bought €50.00 · sold €500.00`; a total of zero is left out; after a middle dot the next part starts lowercase |
| Log, more than 12 transactions | button `Show all 13 entries` |
| Log, a move | the row `Coins moved` opens to `0.05 BTC moved from Kraken to Ledger` (from no venue: `0.05 BTC with no venue moved to Ledger`) and, when units were lost on the way, `Network fee 0.0002 BTC`, in the Log's unit format; for a move the Log finds short outside its destination (`docs/DOMAIN.md` §3.7), `The Log shows 0.02215 BTC outside Ledger on this day, 0.02785 BTC fewer than this move sends. Check this move's date and venues against the entries before it.`; then `Edit entry` · `Delete entry`. Its Amount cell shows the units sent, `0.05 BTC` in the Log's unit format, never `Cost unknown` |
| Log coins you moved | the secondary button `Log coins you moved` under `Add coins you already have`, shown while any coin is held, opens the sheet `Log coins you moved`; a move row's `Edit entry` opens it as `Edit the move`, on the move's values. The move form: the choice `Coin` only while the Log has held more than one coin, chosen for the person when one coin is held on opening; `Date`, blank for a new move (an edit opens on the move's date), hint `The day the coins left, as the withdrawal record shows it.`; once dated, the choice `Venue the coins left`, one card per venue holding the coin on that day with its units (`With no venue` for units with none), chosen for the person only when one card is offered; `Venue the coins went to`, at most 40 characters, hint `The exchange's or wallet's name, as your other entries write it, never its address.` (ADR-0039); `Units sent` with the secondary button `Fill in all units` (the chosen venue's units on the date); `Units received`, which follows the units sent until typed; when fewer arrive, `Network fee 0.0002 BTC`, as the Log's row writes it; then, above `Note (optional)`, three lines that never block `Save`: under per-venue lots (under global lots only when the Log holds fewer units than sent outside Ledger and the move's network fee is then taken at Ledger or by no units), a venue short on the date, `The Log shows 0.03 BTC at Kraken on 20 Feb 2026. The Log looks for the other 0.01 BTC in the units you held outside Ledger on that day.` (`with no venue` for none; which units count: `docs/DOMAIN.md` §6, "Record a move"), its second sentence in place of the other when the Log holds fewer units than sent outside Ledger (the units held at every venue but Ledger at the move's place, as the cards show them), `The Log shows 0.03 BTC at Kraken on 20 Feb 2026. Outside Ledger, the Log shows 0.035 BTC in all on that day, 0.005 BTC fewer than this move sends.` (0.04 BTC sent); an identical move already in the Log, `The Log already has this move on 20 Feb 2026. Save it only if you moved these coins twice.`; a stored move this one leaves short outside its destination, `After this move, your move to Ledger on 14 Oct 2026 sends 0.02785 BTC more than the Log shows outside Ledger that day. If both record the same withdrawal, leave only one of them in the Log. If not, check the units that move sends.`; `Note (optional)`; button `Save`. Under the field, and the focus moves to the first one named: `Choose the coin you moved.` · `Choose a full date: day, month, and year.` · `Choose the venue the coins left.` · `Enter the venue the coins went to.` · `Enter more than 0 units sent.` · `Enter more than 0 units received.` · `Choose a venue other than the one the coins left.` · `Enter no more units received than units sent.` · `This move sends 0.05 BTC, more than you hold (0.03 BTC on 1 Mar 2026). Check the units and the date, or log the missing purchases first.`; a fee that leaves a sale short, under `Units received`: `This move's network fee leaves your BTC sale on 1 May 2026 without the units it sells. Check the units received against the deposit record, or change that sale first.`; a fee that leaves a later move's fee beyond the units held, under `Units received`: `This move's network fee leaves your BTC move on 1 Mar 2026 without the units its network fee takes. Check the units received against the deposit record.`; a fee that no unit is left for, by date or in total, once the other entries took theirs (a sale imported short can take them), under `Units received`: `This move's network fee takes more units than your other BTC entries leave for it. Check the units received against the deposit record.` A move being edited that another browser tab deleted meanwhile: nothing is saved, toast (8 s) `This move was deleted in another browser tab, so the change was not saved.` What was typed stays for the session when the sheet closes, as the entry form's does. Toast (8 s) after a new move: `Recorded: 0.05 BTC moved from Kraken to Ledger on 3 Nov 2026.` (`Recorded: 0.05 BTC with no venue moved to Ledger on 3 Nov 2026.`); after an edit, `Entry saved.` |
| Record on the Log | each row names its kind: `Monthly buy` · `Starting amount` · `Extra buy` · `Sale` · `Coins added`; button `Record a purchase`, and under it the secondary buttons `Add coins you already have` ("Add coins you already have" below) and, while any coin is held, `Log coins you moved` ("Log coins you moved" above); its sheet opens on the open action, `Log the monthly buy` or `Log the starting amount`, else `Log an extra buy`; for a new transaction it offers the choice `Type of transaction`: the kind it opened on, chosen, then `Extra buy`, then `Sale` while any coin is held (`Monthly buy` · `Extra buy` · `Sale`, `Starting amount` · `Extra buy` · `Sale`, or with nothing open `Extra buy` · `Sale`), and no choice when only one kind is left to offer; a choice gives the sheet that kind's title and fields, each kind keeps what was typed in it for the session, each opening starts on the kind it opened on, and `Skip October 2026` shows only beside `Monthly buy`; Today's buttons open their form with no choice; fields `BTC cost before fees (EUR)` · `BTC received (units)` · `BTC price (EUR)` (a coin quantity is `units` in every label and error, `BTC: enter both the amount and the units.`; `coin` names the asset, as in `Coins & split`), hint `Type 2 of the 3; the form fills the third.`; button `Save`. Toast (8 s): `Recorded: €100.00 of BTC on 20 Oct 2026.`, or `Recorded: €100.00 on 20 Oct 2026.` for several coins. A venue over 40 characters or a note over 500 characters (a restored draft; the fields stop there), under the field, with `Venue and note` opened (`Add a note` where the venue shows above it): `Use at most 40 characters in the venue.` · `Use at most 500 characters in the note.` A plan another browser tab deleted meanwhile, by `Save`: `The plan was deleted in another browser tab, so this entry was not saved.` A save that would take the plan past 10,000 entries, by `Save`: `Recording this would take the plan past 10,000 entries, the most a plan holds. Delete entries in the Log to make room.` A save that leaves a stored move short outside its destination, above `Save`, never blocking it: `After this change, your move to Ledger on 15 Oct 2026 sends 1 BTC more than the Log shows outside Ledger that day. Check that move's date and venues in the Log after you save.` |
| Record a sale | `Sale` in the choice of `Record a purchase` ("Record on the Log" above), offered while any coin is held and only for a new transaction, gives the sheet `Log a sale`, fields `BTC sold (units)` · `BTC sold for, before fees (EUR)` · `BTC price (EUR)`, and the hint, fee, venue and note of a purchase; whether it is offered is read once per opening, so a sale being typed stays a sale when another browser tab sells the last units. A sale row has `Edit entry` like a purchase. Toast (8 s): `Recorded: sold €500.00 of BTC on 20 Oct 2026.`, or `Recorded: sold €500.00 on 20 Oct 2026.` for several coins. The two sale messages below: the excess under the form, which saves nothing; the holding warning above the fee as the sale is typed, which never blocks `Save` |
| Add coins you already have | the secondary button under `Record a purchase`, shown whenever a plan exists, for coins bought before the plan, moved in from outside the Log's venues or received (a move between venues the Log holds is `Log coins you moved`): the sheet `Log coins you already have`, with no choice of kinds and no date, venue or fee to start with; fields `Date`, described `The day you bought or received them. If you are not sure, the latest possible day never starts a holding rule too early. The value chart counts the coins from that day.`, whose middle sentence shows only where the plan's country has a holding rule (its rules' `holdingRule` is not `none`, and the rules are loaded; `docs/JURISDICTIONS.md` §1), `BTC received (units)` · `BTC cost (EUR, if known)` · `BTC price (EUR)` in that order, the units first since only they are required, hint `Leave it empty if you do not know the cost: Invested, the average cost, and the P/L then leave these units out. Type 0 if you paid nothing.`; no fee field; `Venue (optional)` above `Add a note`, since a venue is where the coins sit, and never carried over from coins added, to their form or to a purchase. An empty cost is unknown, never €0: the row reads `Cost unknown`, a cost of 0 reads `€0.00`. Toast (8 s): `Recorded: 0.5 BTC added on 15 Mar 2024.`, `Recorded: 0.5 BTC added for €0.00 on 15 Mar 2024.` with a cost, or `Recorded: 0.5 BTC and 2 ETH added on 15 Mar 2024.` for several coins. A fee on coins added (an old draft or an import), under the field: `Leave the fee empty for coins added; include any fee you paid in the cost.` A refused `Save` moves the focus to the first field it names, on every kind of the form |
| Entry form, date cleared or incomplete | under `Date`: `Choose a full date: day, month, and year.`; nothing is saved |
| Entry form, an earlier date | under the rows, while a new purchase is dated before the day the form opened and the price the form filled in is empty: `The price the form filled in does not apply to an earlier date. Type the cost before fees and the units received, as your exchange's confirmation shows them.`; a cleared or incomplete date hides it too |
| Edit an entry | row button `Edit entry`; sheet `Edit the entry`; toast `Entry saved.` (8 s); a one-tap item in the open row reads `0.00094 BTC (estimated) for €70.00` until a save changes its units (ADR-0003, `docs/DOMAIN.md` §2.2), and the sheet opened on such a row adds under the form's hint `Bought as planned filled in these units from the day's price. Any fee or venue it copied came from your latest purchase or sale that recorded one. Type the units from your exchange's confirmation.`, which names no consequence of saving; a grouped edit whose items were at different venues opens its Venue field empty and adds under the form's hint `Venues on these entries: Bitvavo and Ledger. Each keeps its own unless you type a venue for all of them.`, with `1 entry has none.` (`2 entries have none.`, the count a figure, §4) after the list when some named none, and `Venue on these entries: Bitvavo.` when one venue is named; an entry another browser tab deleted meanwhile: toast `This entry was deleted in another browser tab, so the change was not saved.`; an edit that would leave another sale uncovered, under the form: `This change leaves your BTC sale on 10 Oct 2026 without the units it sells. Check that sale in the Log.` (the sale named by its own date, earlier or later than the entry); one that would leave a later move's network fee beyond the units held, under the form: `This change leaves your BTC move on 1 Mar 2026 without the units its network fee takes (0 BTC held before it). Check that move and the entries before it in the Log.`; an edit that leaves a stored move short outside its destination shows the line of Record on the Log above `Save`. |
| Delete an entry | toast `Entry deleted.` with `Undo` (8 s), and after a delete of a row of several entries `2 entries deleted.`; an Undo refused because the month changed since the delete: toast (8 s) `October 2026 was skipped after you deleted this entry, so it stays deleted.` or `October 2026 was recorded after you deleted this entry, so it stays deleted.`, and after a delete of a row of several entries `October 2026 was skipped after you deleted these 2 entries, so they stay deleted.` (`was recorded`); an Undo refused because a backup replaced the plan since the delete: toast (8 s) `A backup replaced your plan after you deleted this entry, so it stays deleted.` (`A backup replaced your plan after you deleted these 2 entries, so they stay deleted.`); an Undo of a sale refused because too few units are held for it: toast (8 s) `Restoring this sale would leave it without the units it sells, so it stays deleted.` (`Restoring these 2 entries would leave the BTC sale among them without the units it sells, so they stay deleted.`); an Undo refused because it would leave another sale short: toast (8 s) `Restoring this entry would leave your BTC sale on 1 Mar 2026 without the units it sells, so it stays deleted.` (`Restoring these 2 entries would leave your BTC sale on 1 Mar 2026 without the units it sells, so they stay deleted.`); an Undo refused because restoring would take the plan past 10,000 entries: toast (8 s) `Restoring this entry would take the plan past the 10,000 entries a plan holds, so it stays deleted.` (`Restoring these 2 entries would take the plan past the 10,000 entries a plan holds, so they stay deleted.`); an Undo refused because the plan's pay currency changed since the delete (a change of country or Currency & data's `Change to GBP`): toast (8 s) `Your plan's currency changed from EUR to GBP after the delete, so this entry stays deleted. It was recorded in EUR; log it again only if you paid it in GBP.`, and after a delete of a row of several entries `Your plan's currency changed from EUR to GBP after the delete, so these 2 entries stay deleted. They were recorded in EUR; log them again only if you paid them in GBP.`; a delete of a purchase that covers a sale, refused: toast (8 s) `Deleting this purchase would leave your BTC sale on 1 Mar 2026 without the units it sells, so the purchase stays. Check that sale in the Log.`, and of a Coins added row `Deleting this Coins added entry would leave your BTC sale on 1 Mar 2026 without the units it sells, so the entry stays. Check that sale in the Log.` (`Deleting these 2 Coins added entries would leave your BTC sale on 1 Mar 2026 without the units it sells, so the entries stay. Check that sale in the Log.`); the sale named may be dated before the purchase; a delete of a purchase that covers a move's network fee, refused: toast (8 s) `Deleting this purchase would leave your BTC move on 1 Mar 2026 without the units its network fee takes, so the purchase stays. Check that move in the Log.`, and of a Coins added row `Deleting this Coins added entry would leave your BTC move on 1 Mar 2026 without the units its network fee takes, so the entry stays. Check that move in the Log.` (`Deleting these 2 Coins added entries would leave your BTC move on 1 Mar 2026 without the units its network fee takes, so the entries stay. Check that move in the Log.`); the move named is the first one the delete leaves worse covered on its own date, else the first one worse covered in total; an Undo refused because it would leave a move's network fee without units: toast (8 s) `Restoring this entry would leave your BTC move on 1 Mar 2026 without the units its network fee takes, so it stays deleted.`, and after a delete of a row of several entries `Restoring these 2 entries would leave your BTC move on 1 Mar 2026 without the units its network fee takes, so they stay deleted.`; when the move left short is the one restored: toast (8 s) `Restoring this move would leave it without the units its network fee takes, so it stays deleted.` |
| Delete the plan | Settings' data section, below the export line: button `Delete everything`; dialog `Delete this plan and its 23 entries?`; (`Delete this plan?` with no entries); body `Export a copy first if you want to keep them.` (`… keep it.` with no entries); no export line of its own, since the button sits right below the section's (`docs/LEGAL.md` §4); buttons `Keep this plan` · `Export a copy first` (the JSON backup, as in the replace dialog: the CSV log cannot be imported back) · `Delete everything` (destructive; the wipe clears every store, not only the plan); toast `Plan deleted.` with `Undo` (8 s); an Undo refused because another browser tab started or imported a plan since: toast (8 s) `Another browser tab started or imported a plan after you deleted this one, so it stays deleted.` |
| Red-day banner (M2) | At Today's foot, the market as the subject, dated and figured by the episode's last Red day (`lastRed.date`, which is the last complete close only while the fall still fires): `Bitcoin fell 16% in the 7 days to 6 Nov 2026.`, or when only the 90-day high fired, `On 6 Nov 2026 Bitcoin was 33% below its 90-day high.`; several coins held, named in the portfolio's order as one list (serial comma from three) and the figure combined: `Bitcoin and Ethereum, in the amounts you hold, fell 14% in the 7 days to 6 Nov 2026.` and `On 6 Nov 2026 Bitcoin and Ethereum, in the amounts you hold, were 33% below their combined 90-day high.`; each coin by its name from the red-day model, never its id; whole percents; then `See the fall under way` (secondary, one line at 360 px, to `/learn/fall-under-way`) · `Dismiss` (ghost). No disclosure, colour, icon of its own or motion; a dismissal that could not be stored says `The notice could not be dismissed on this device, so it may show again.` in a toast |
| Backup needed | `Your data lives only on this device. Last export 12 Sept 2026. Export a copy.` Never exported: `Your data lives only on this device. Export a copy.` The link is `Export a copy.` alone (to Settings), never the date |
| Durability line (local mode, M1) | In a browser tab: `Your data lives only in this browser. Install the app or export a copy to keep it.` (M3 adds `or add an email`). In the installed app (standalone display mode, or `navigator.standalone` on iOS), which has no browser to name and is already installed: `Your data lives only on this device. Export a copy to keep it.` At the foot of Today once live entries exist (counted as `backupNeeded` counts them, `docs/DOMAIN.md` §3.11), a quiet line with no dismiss; while the Backup needed banner shows, the banner stands in its place, so the two never stack (the placement: `docs/DESIGN.md` §8) |
| Onboarding (every step) | title `Set up a plan`; buttons `Back` · `Continue` unless the step's row names others; with a plan already stored, in place of the steps: `A plan is already set up on this device.` and the link `Open the plan` |
| Country step (onboarding) | `Where do you live?`, then by the suggestion's state: high or medium, `This device suggests Portugal.` with Portugal preselected, so one tap on `Continue with Portugal` confirms it; low, `This device suggests Portugal.` with Portugal listed first and not preselected; none, no suggestion line and `Other country` first in the list. In any of them, when the device's language points to a served country the step does not name, `Residence, not language, decides tax.`; select `Country`, placeholder `Choose a country` until a country is chosen; button `Continue with Portugal` once one is (`docs/JURISDICTIONS.md` §3) |
| Starting-point step (onboarding) | `Choose a starting point`; the templates in alphabetical order of their names, each led by its risk label, then its name, its `oneLine`, its split line (`BTC 70% and ETH 30%`, §4) and its dated band, then `Your own coins` (see Coins & split); under them, for a picked template only, the closed control `Show how it works and what can go wrong` over its explanation (§6), then the template line of `docs/LEGAL.md` §4 and the link `Risk disclosure` |
| Numbers step (onboarding, template path) | `Amounts and dates`; `Monthly amount (EUR)`, `Starting amount (EUR)` with `Bought once on the first buy day and split across your coins like each monthly buy. Enter 0 for none. For coins you already have, choose Add coins you already have on the Log after setup.` (the last sentence names the Log's button, "Add coins you already have" above), `First buy`, and `Last buy` only when the template's dates cannot be used; refusals as in Amounts and dates below |
| Reminder step (M1) | after the sentence on both onboarding paths: `Where should the monthly reminder go?` with `Back` · `Add to calendar` · `Later`. Add to calendar saves the plan's calendar file, one monthly event on the buy day, `Your buy day`, worded as the reminder email below (no coin, no amount, no market), and goes on to the summary; a file the device did not save keeps the step with `The calendar file was not saved. Add it again, or choose Later.` With no buy day left, the heading `Monthly reminder` and the line `No buy days left, so there is no reminder to add.`, then `Back` · `Continue`, where `Continue` goes on as `Later` does and records no reminder. (M3) `Where should we send the monthly reminder?` field `Email`, helper `One email on each buy day. Nothing else.`, buttons `Send reminders` · `Not now` |
| Calendar reminder (Settings) | on the Plan tab under `Save changes`, with a plan: heading `Calendar reminder`, the line, at body size (`docs/DESIGN.md` §5), `One event on each buy day left in your plan. Add it if you chose Later, or again after you change the buy day. Your calendar may keep the earlier event; delete it there.` and the button `Add to calendar`, which saves the same calendar file as the reminder step from the plan as stored (never said to replace the earlier event: calendars treat a file added again differently); a file the device saved: `Calendar file saved.` under the button (a polite live region; onboarding's summary words); a file the device did not save: `The calendar file was not saved. Add it again.`; while the buy days left fall in a pause, `The buy days left are paused, so there is no reminder to add. After you resume the plan, you can add it here.` and no button; after an end, paused or not, `Buying ended on 3 Oct 2026, so there is no reminder to add. If you added the calendar file, your calendar keeps its events after that day; delete them there.` and no button; otherwise with no buy day left, `No buy days left, so there is no reminder to add.` and no button |
| Why sentence (onboarding) | after the amounts and dates on both paths: the heading `In one sentence, why are you doing this?` labels the field, `You will see it on the days the market falls.` sits under it, placeholder `I buy on the 1st and I do not check the price on other days.`; optional, at most 280 characters, kept trimmed; `Back` · `Continue` |
| Summary (onboarding) | the last step of both paths: `Check your plan`, then one row per choice, each a term over its value: `Country`, `Holding rule` (the rule named by its country and in words, `Germany's rule. 1 year, then tax-free.`, `The general profile's rule.` followed by the generic profile's own holding-rule text, and under it the country's date line, `docs/LEGAL.md` §4; a card under review, `docs/JURISDICTIONS.md` §1, shows the rule by name alone, with the under-review date line and no `Sources`), `Starting point` (the template's name or `Your own coins`), `Coins & split` (`BTC 70%, ETH 30%` in Portugal, `BTC 70 %, ETH 30 %` in Germany), `Monthly amount`, `Starting amount` (only above 0), `First buy`, `Buy day` (`Day 5 of each month`), `Last buy`, `Sell window` (`1 Sept 2029 to 31 Aug 2030`, only with one; `1 Sept 2029 to 31 Aug 2030, opening before the last buy passes the holding rule, as you accepted` for an early window the person accepted), `Your sentence` (only with one), `Reminder` (`Calendar file saved` or `No reminder set`); no holding-status date. Then the acknowledged disclosure and `Back` · `Accept and start the plan` in a row that wraps at large text |
| Risk line (plan creation) | see `docs/LEGAL.md` §4: the one acknowledged text, 40 to 50 words with the dated figures; when it is asked again (`docs/DOMAIN.md` §2.1), the heading `The risk text has changed`, the same text and its link, and the button `Accept and open Today` |
| Holding status | `Tax-free from 2 Mar 2027` (Portugal, Germany) · `Long-term rate from 2 Mar 2027` (US) · nothing where no rule exists · on an opened Log row, right after the date and never beside a money figure, `Why?` on the 44 px target (accessible name `Why? The tax-free date`, or `Why? The long-term rate date` under a lower-rate rule), which opens Taxes where you live on the plan's country's card · beside the first such date on a screen, once per jurisdiction: `Computed from your dates, not tax advice` (`docs/LEGAL.md` §4; the German wording is pending, `docs/BENCHMARK.md` §4), and under it, on every surface `docs/LEGAL.md` §4 names, the profile's first condition, `Show 3 more conditions` (`Show 1 more condition`) while it has others, and the date line (the sentences are the profile's, `docs/JURISDICTIONS.md` §2) |
| Plan totals | before the sell window: `€1,700.00 of €2,100.00 invested so far (81%). Buys left: 6.`; from the sell window on: `€1,700.00 of €2,100.00 invested (81%).`; with a plan total of zero: `€1,700.00 invested so far.`; after End buying, in any phase: `€1,700.00 invested. Buying ended on 15 Oct 2026.` The money total is `Invested` on every screen, Today's and Portfolio's included. `Bought` stays the verb of an entry (the Log month header, Today's buttons, Portfolio's chart tooltip and table, `Not bought yet`). The Plan's figure leaves out extra buys dated before the first buy day (`docs/DOMAIN.md` §3.10), and the line under it says so while there is one, in every phase: `1 extra buy dated before the first buy day, 5 Apr 2026, is not in the amount invested above. Portfolio's Invested counts it.`; for more than one, with the count as a figure (§4): `2 extra buys dated before the first buy day, 5 Apr 2026, are not in the amount invested above. Portfolio's Invested counts them.` It also names the entries of coins added with a recorded cost, which the Plan's figure leaves out whatever their date: `1 entry of coins added with a recorded cost is not in the amount invested above. Portfolio's Invested counts it.`; for more than one: `2 entries of coins added with a recorded cost are not in the amount invested above. Portfolio's Invested counts them.` With both, one paragraph of three sentences names the extra buys first and says the close once: `2 extra buys dated before the first buy day, 5 Apr 2026, are not in the amount invested above. 1 entry of coins added with a recorded cost is not in it either. Portfolio's Invested counts all of them.`; for more than one entry: `2 entries of coins added with a recorded cost are not in it either.` Coins added with no cost are in neither figure, so the line leaves them out. The percentage is a share of the plan's total, never a % beside the value or a return word (`docs/LEGAL.md` §6) |
| Plan timeline, below 48rem | the drawing hidden, its sentence shown as text: `Plan from 1 Jan 2025 to 31 Dec 2030. Today, 29 Oct 2026, is in the buy phase.` (`in the hold phase` · `in the sell window` · `after the sell window closed`); the text and the drawing's name are one string |
| Plan timeline, holding milestone | the date in its own column, once; the label `Last buy tax-free` or `Last buy at the long-term rate`; the hold segment keeps the holding status words (`Tax-free from 4 Mar 2028`); a date never breaks across lines, a range may break around `to` |
| Sellable now (sell phase) | `0.1234 BTC sellable now · 0.0100 BTC from 12 Mar 2030` |
| Offline | `Prices from 14:05, 16 Oct 2026 · offline · Price data by CoinGecko` under CoinGecko's prices, `Prices from 14:05, 16 Oct 2026 · offline` under prices from any other source (none yet: prices typed by hand keep their `Prices as of` line offline), as one `ink-2` line under the value on Today and Portfolio alike; no banner |
| Stale prices | `Prices as of 12:40, 20 Oct 2026 · delayed · Price data by CoinGecko` under CoinGecko's prices, `Prices as of 12:40, 20 Oct 2026 · delayed` under prices from any other source (none yet: prices typed by hand keep their `Prices as of` line however old), with the time the prices describe, when the server answers with its last good copy or the prices have aged past live; the same `ink-2` line on Today and Portfolio |
| The fall page (`/learn/fall-under-way`) | Heading `The fall under way and your plan` (Learn's row has the same title and `The coins you hold against their 90-day high, and each coin's earlier falls.` (no next buy day: the page leaves it out with none ahead)), the back link `Back to Today`. One coin: `Bitcoin is 33% below its 90-day high and fell 16% in the 7 days to 8 Nov 2026.` in Portugal (`33 %` and `16 %` in Germany; both figures truncated toward zero to whole percents); after a rise, `Bitcoin is 33% below its 90-day high and rose 2% in the 7 days to 8 Nov 2026.`; with no 7-day figure (or one under 1%), `Bitcoin is 33% below its 90-day high (8 Nov 2026).`; under a short history, `Bitcoin is 33% below its highest close since 2 Jun 2026 and fell 16% in the 7 days to 8 Nov 2026.`; several, each coin once by its name, as one list (serial comma from three), as the red-day banner names them: `Bitcoin and Ethereum, in the amounts you hold, are 31% below their 90-day high. They fell 14% in the 7 days to 8 Nov 2026.` (2 sentences, the second `They rose …` after a rise; with no 7-day figure one, `… below their 90-day high (8 Nov 2026).`; `below their highest close since 2 Jun 2026` under a short history). The figure ends with `Why?` (accessible name `Why? The fall under way`), which opens When the market drops in the sheet. Each coin with no price history, by its name: `Kaspa is not in these figures: Proof of Calm has no price history for it.` The data line at 14 px or larger (ADR-0050): `Daily closes in EUR, 10 Nov 2025 to 8 Nov 2026 · Price data by CoinGecko`. The past-performance sentence with `Risk disclosure`, once, and only under a historic figure: the current one or an earlier fall (`docs/LEGAL.md` §4). Per held coin (units above 0, a coin outside the plan included), oldest first, under the coin's name: `Earlier falls of Bitcoin, computed by Proof of Calm from each source's intraday highs and lows in US dollars:` with rows `−84% from 17 Dec 2017 to 15 Dec 2018 · Bitstamp` (the source as unlinked text), or `Proof of Calm has no dated earlier fall for Dogecoin.` Then `Your next buy day is 1 Dec 2026. Today is not a buy day unless you decided that earlier.` (on the day: `Today, 1 Dec 2026, is your buy day.`; none ahead: left out), and `Your note to yourself` with `12 Dec 2025: “<the note>”` (no note: left out; no `Edit`). A history that cannot be loaded: `The price history could not be loaded, so today's figures are not shown. Open this page again to retry.` in the figure's place, no data line; earlier falls that cannot be loaded: `The earlier falls could not be loaded. Open this page again to retry.` Never on the page: Red day, red, drop, crash, dip, alert, opportunity, now, stay calm, don't worry, any promise that prices recover, a frequency or the 118-plan figure (the module's, `docs/EDUCATION.md` §6), any control but the figure's `Why?`. With no fall under way, the page's path opens When the market drops in its place |
| Rule change notice (M2) | the date, then the profile's sentence: `16 Oct 2026: Portugal updated its rule for 2027. Review your plan.`; with no sentence, `16 Oct 2026: the rules for Portugal changed. Review your plan.`, and under the generic profile (`XX`) `16 Oct 2026: the general profile changed. Review your plan.`; with `Review` · `Dismiss`; a dismissal that could not be stored says `The notice could not be dismissed. Try again.` in a toast |
| Annual review (M2) | `You set up this plan on 5 Apr 2026.` or, after a review, `You last reviewed this plan on 11 Nov 2027.`, then `Is it still right? Have the rules changed?`, with `Review the plan` · `Later`; the day says how long it has been, so no wording says a year has passed. A failed `Later`: `The review could not be postponed. Try again.` |
| Annual review page (M2) | `/plan/review`, opened from Plan's `Review the plan` (under `Change the plan`, after `Edit plan`): heading `Review the plan`, with `Back to Plan`; first sentence `You set up this plan on 5 Apr 2026.`, or, from the last review on, `You last reviewed this plan on 11 Nov 2027.` (the later of the two days the next review counts from, §3.12 of `docs/DOMAIN.md`; a prototype import counts from its import day), which keeps its words until the page opens again, so after `Mark as reviewed` only the result line names the review's day; section `Is it still right?` with the plan in the Plan screen's own words (`Your plan buys until 1 Apr 2029, then holds with no sell window.` and `€100 a month on day 1: BTC 70%, ETH 30%.`), then, when the plan has a note, `Your note to yourself` with `5 Apr 2026: “For the long run.”` (the plan's creation day, as the fall page quotes it), then `Edit plan` (Plan's label for the same Settings link); section `Have the rules changed?` with, first while one is pending, the dated sentence of the Rule change notice row, without its `Review your plan.` and its buttons (`16 Oct 2026: Portugal updated its rule for 2027.`), then `Your plan's country: Portugal.` (left out under the general profile, whose date line names it) and the country's date line in its `docs/LEGAL.md` §4 form (`Reviewed on 5 Nov 2026 · general information, not advice · Sources` once the profile is read, the plain form until then, and its general-profile and `Not reviewed since` forms), and `See the card for Portugal` (under the general profile, `See the countries`); no rule text, and never a line that says nothing changed. Section `Where your coins are`: `At the end of 20 Oct 2026, after the sales and moves dated on or before it, the Log shows these units at each venue.`, then for each coin held that day, in Portfolio's coin order, the coin and one line per venue, the venue as the Log writes it (`With no venue` for units with none) and its units at the coin's decimals (`Kraken 0.01000000 BTC`; how they are counted: `docs/DOMAIN.md` §3.7, `venueUnits`); under a coin whose entries dated on or before that day include one-tap estimates, `Bought as planned estimated the units of 14 BTC entries from the day's price. Your exchange's confirmations have the exact units.` (`1 BTC entry`, `Your exchange's confirmation has`; the count a figure, §4); with no coin held, `The Log shows no coins held at the end of 20 Oct 2026.` in place of the intro and the list; then, in every state, `Where your exchange or wallet shows other units, log the missing purchase, sale, move, or coins received, or correct an entry's units, venue, or date.` and `Open the Log`. Nothing in it is typed or stored, and it links no exchange or wallet (ADR-0039). Button `Mark as reviewed`; once recorded, the line `You reviewed this plan on 20 Oct 2026. Next review from 20 Oct 2027.` in its place; a review that could not be recorded keeps the button and says `The review could not be recorded. Try again.` in a toast. With no plan, the No plan state under the heading |
| Empty: no entries, plan exists | `No entries yet. Your first buy day is 1 Nov 2026.` |
| Empty: no entries, first buy day past | `No entries yet. Your first buy day was 5 Apr 2026.` (the skipped months stay listed under it) |
| Empty: no plan (Today, Plan, Portfolio, Settings' Plan, Coins & split and Hold & sell tabs) | Title `No plan yet`; `Set up a plan or import a file.` with both phrases as links (onboarding, Settings); on Settings' tabs, `import a file` opens `Currency & data` |
| Empty: no plan (Log) | `No entries yet. Set up a plan or import a file.` |
| Empty: nothing to export (Settings, no plan) | `Nothing to export yet. Set up a plan or import a file.` in place of the export buttons |
| Empty: no sales (M2) | `No sales yet. When you sell, record the sale here so Portfolio and the tax-year export include it.` |
| Import not recognised | `This file is not in a format Proof of Calm can read. Choose a Proof of Calm backup, an export from the DCA plan page, Kraken's Ledgers export, or Trade Republic's transaction export.` (`Trade Republic's transaction export` added 2026-11-14, since the alert lists every format the import reads and Trade Republic's file is one; named only as a file format, unlinked, under ADR-0056's naming and `docs/LEGAL.md` §6 Q4; the comma before `or` added 2026-11-14, since an English list of three or more takes the serial comma, §1 rule 9); for a pasted text, `This text is not in a format Proof of Calm can read. Copy the whole export again, then paste it.` |
| Export date not stored | `The backup file was saved, but this device could not record the export date. Export again to record it.` as an alert under the export buttons |
| Export not saved | `The file was not saved. Export again to keep a copy.` as an alert under the export buttons and inside the replace dialog, until a later export saves the file |
| Tax-year export (Settings, M2) | under the export buttons and their line (`docs/LEGAL.md` §4 covers it), the select `Tax year`, its years newest first with the latest ended one chosen: `2026`, a year across two calendar years as the UK card writes it, `2026 to 2027`, and the running one `2026 (still running)`; button `Export tax-year CSV`; a file the device did not save: the "Export not saved" alert under it. With no entries, in its place: `No entries yet, so there is no tax year to export.`; once their load has ended without the country's rules or profile on the device: `Your country's rules are not loaded on this device. Reload the page when you are online to export a tax year.`, and nothing while they load; the same for every country, France's cessions file and the Netherlands' snapshot file included (`docs/DOMAIN.md` §3.13) |
| Tax-year file header | one line per cell; the app's own lines hold no `;` (a spreadsheet set to the de or pt locale splits there), while the profile's text (the lot note and the holding conditions) is copied as written, so a cell of it can still hold one (the US conditions do); ISO dates, in `docs/DOMAIN.md` §3.13's order: `Proof of Calm tax-year file · Portugal · 2026-01-01 to 2026-12-31`; the sentence of `docs/JURISDICTIONS.md` §4; `Amounts are as you logged them and are not converted. Your pay currency is EUR.` (another pay currency: `Amounts are as you logged them and are not converted to EUR. Your pay currency is USD.`); `Portugal rules reviewed on 2026-11-05 · general information, not advice · Sources: <the lot and holding rules' URLs>` (with no source, the line ends after `not advice`; the generic profile: `Reviewed on 2026-11-05: the general profile, not a rule for your country · general information, not advice`; under review: `Portugal rules not reviewed since 2026-11-05 · general information, not advice`); `Each sale is matched to purchases of the same coin, first in, first out.` (`last in, first out`), or for the raw listing `Sales are not matched to purchases in this file. The pooling or matching is for your accountant.`; the profile's `lotRuleNote`; with a holding rule `eligible_from: the first day past the Portugal holding rule (365 days). past_holding_rule: whether that day had come by the sale, or by 2026-10-20 for units still held. Computed from your dates, not tax advice.` (the raw listing: up to `(365 days).`, then the last sentence), the profile's conditions, and `Your plan uses its own holding rule. This file uses the Portugal rule.` when they differ; per venue `Sales are matched per venue as named in the Log. Entries with no venue are one group.` and `In 2 rows, the sale took units bought at another venue. sale_venue shows where those sales were made.`; the per-lot file `held_at: where the units were when sold, paid as a network fee, or at the year end. It is empty for no venue and on rows with no acquired date. moved_on: the date a Coins moved entry took them there, empty if none did.` and, with a fee piece, `A row with disposed_on but no proceeds holds the units a Coins moved entry paid as its network fee, and leaves past_holding_rule empty. This file does not say whether your country treats that fee as a disposal.`, then, when a move paid its fee from units already at its destination (ADR-0055), `In 1 row, the Log took a Coins moved entry's network fee from units already at the venue the coins went to. On that date the Log shows too few units outside that venue for what the entry sent. Check that Coins moved entry in the Log.` (`In 2 rows, the Log took a Coins moved entry's network fee from units already at the venue the coins went to. On each row's disposed_on date the Log shows too few units outside its held_at venue for what its Coins moved entry sent. Check the Coins moved entry of each of those rows in the Log.`, whether the rows come from one entry or from several); the raw listing, with a move, `A move row lists units sent from venue to to_venue. units_received is what arrived. units less units_received is the network fee, paid in the coin.` and, when a move dated in the tax year paid a fee (`units` above `units_received`), `This file does not say whether your country treats that fee as a disposal.`; the raw listing `For a coin sold, or paid as a network fee, in the tax year, every entry to 2027-04-05 is listed.`, under a pooled rule `For a coin sold, or paid as a network fee, in the tax year, every entry to 2027-04-05 is listed for the pool. Its purchases to 2027-05-05 are listed for the 30-day rule.` and, while that window is open, `Made on 2026-10-20: purchases after that day are not in this file.`; `Dates are YYYY-MM-DD. Amounts and units use a decimal point.`; when they apply, `On a held row, an empty cost_basis means no cost was recorded, not a cost of zero. Rows with no acquired date leave cost_basis empty.` (the raw listing ends `Sale rows leave cost_basis empty.`), `units_estimated yes: Proof of Calm's Bought as planned button filled in the units from the day's price, not from your exchange's confirmation. Any fee or venue it copied came from your latest purchase or sale that recorded one.` (after the entry form's hint, "Edit an entry" above), `A row with no acquired date holds units sold, or paid as a network fee, that no logged purchase covered.` and `The tax year ends on 2026-12-31. This file shows your log as of 2026-10-20.`. Counts are plain figures, as the file's other numbers |
| Tax-year file header, France and the Netherlands | the first four lines as above (title, the §4 sentence, the currency line, the review line with the profile's sources); no matching, lot note, holding, venue or listing line, no form line number, no EUR 305 test, and for the Netherlands no box, rate, allowance or deadline. France: `Each block is one sale from your log: a holding row for each coin held just before it, then the sale row. Purchases have no rows here: the CSV log lists every entry. The calculation from these figures is left to you or your accountant.`; `On holding rows, the coin sold is valued at its own sale price. The other coins carry no market price in this file. estimated_portfolio_value is filled only when the coin sold was the only coin held and your log holds the units sold.`; `purchase_costs_to_date sums the amounts of the purchases and the recorded costs of the Coins added entries logged before each sale, and purchase_fees_to_date their fees. Neither is reduced by earlier sales. Amounts are as you logged them, whether or not they include a fee.`; `sale_price is each sale's amount as you logged it, whether or not a fee was deducted from it, and sale_fee its fee.`; the format line; when they apply `held_without_cost_to_date: how many Coins added entries before the sale have no recorded cost. purchase_costs_to_date leaves them out.`, `units_estimated yes: the sale or a holding row in its block counts units that Proof of Calm's Bought as planned button filled in from the day's price, not from your exchange's confirmation. Any fee or venue it copied came from your latest purchase or sale that recorded one.` (the per-lot files keep the line above) and the year-end line. The Netherlands: `units_on_01-01 is your log at the start of 2026-01-01, which is the end of 2025-12-31. units_on_12-31 stays empty until the year has ended.` (an ended year: `units_on_12-31 is your log at the end of 2025-12-31.`); `This file holds units and logged amounts but no market prices, so the value_on_01-01 and value_on_12-31 cells are empty, except 0.00 where you held none.`; `fee_units: units the year's Coins moved entries paid as network fees, in the coin.`; the format line; when they apply `held_units counts the units of Coins added entries dated in this year. If you had those coins before 2026-01-01, units_on_01-01 leaves them out.`, `An empty held_cost means a Coins added entry has no recorded cost, not a cost of zero.`, `Some units come from Proof of Calm's Bought as planned button, filled in from the day's price, not from your exchange's confirmation. Any fee it copied came from your latest purchase or sale that recorded one.` (the file has no units_estimated column) and the year-end line |
| Screen not loaded | a screen whose code could not be loaded, in the screen area with the header and the tab bar around it: heading `This screen could not be loaded.`, line `Check your connection, then reload the page.`, button `Reload` |
| Newer version | rows a newer version of Proof of Calm wrote, left unread (an old browser tab still open, or a version rolled back; ADR-0019 Readings, "Row shape"). A newer plan, in the screen area with the header and the tab bar around it: heading `Your plan was saved by a newer version of Proof of Calm.`, line `This version cannot open it, so it stays as it was saved. Reload the page to open it in the newer version.`, line `If this screen comes back after the reload, your plan stays on this device, unread; a newer version of Proof of Calm can open it.` (a rolled-back version loads itself again), button `Reload`. Newer entries alone: one line above Today, `2 entries were saved by a newer version of Proof of Calm, so they are not shown here. Reload the page to see them.` (`1 entry was saved by a newer version of Proof of Calm, so it is not shown here. Reload the page to see it.`), the count in the country's number format (§4). Under Settings' export buttons, while newer entries exist: `Exports leave out 2 entries saved by a newer version of Proof of Calm. Reload the page, then export to include them.` (`Exports leave out 1 entry saved by a newer version of Proof of Calm. Reload the page, then export to include it.`), the same count |
| Import a file | heading `Import a file` and the button `Choose a file` (the file input's label as well), for a backup, a file from the DCA plan page or an exchange's export; with a plan, under the button, `Exchange exports Proof of Calm reads, as CSV or ZIP: Kraken (Ledgers), Trade Republic (Transaction export).` (names ZIP since the import opens an export's ZIP, decided 2026-11-13; Trade Republic added when its import shipped, named only as a file format, unlinked, ADR-0056, decided 2026-11-13; `(Transaction export)` is the label Trade Republic's app gives the export, under Profile, Statements, Transaction export, as `(Ledgers)` is Kraken's: #16's evidence comment, sources F2, F3, F4, F7, F8 and P3, recorded 2026-11-14) (`docs/LEGAL.md` §6 Q4); for a backup, file line `backup.json, exported on 16 Oct 2026. Entries in this backup: 23.`; buttons `Replace everything` · `Add missing entries only`; over a plan, dialog `Replace this plan and its 23 entries?`, body `The backup's plan and entries take their place; export a copy first if you want to keep this plan.`, buttons `Keep this plan` · `Export a copy first` · `Replace everything` (destructive); result `Plan replaced. Entries now: 2.` (`Plan imported. Entries now: 2.` on a device with no plan) or `Entries added: 2. Already in this plan, not added: 21.`, followed by `Deleted earlier on this device, not added: 1.` only when the backup holds an entry deleted earlier on this device, then `Month already recorded or skipped on this device, not added: 1.` only when the backup holds a monthly buy for a month already recorded or skipped here; `Add missing entries only` from a file whose purchases are in another currency than this plan's adds nothing (`docs/DOMAIN.md` §3.13), and the alert, which takes the focus, says `The purchases in this file are in USD, and this plan's are in EUR, so nothing was added. Amounts are never converted. If you want the file's plan and its currency in place of this one, choose the file again, then Replace everything.`; an import that would leave more entries than a plan holds (`docs/DOMAIN.md` §3.13) adds nothing, and the alert, which takes the focus, says `Adding these entries would leave 12,000 entries in this plan, more than the 10,000 a plan holds, so nothing was added. Delete entries in the Log, then import again. To keep only the file's entries, import again with Replace everything.`, or for a file from the DCA plan page that holds more on its own `This export from the DCA plan page holds 10,001 purchases, more than the 10,000 entries a plan holds, so nothing was imported. Delete purchases there, export again, then import the new file.`; a file over the byte cap: `This file is larger than 50 MB, so it was not read. If it is an exchange's export, export a shorter period there, then choose the new file.`; rows from a newer version on this device, a deleted entry's included (`docs/DOMAIN.md` §3.13), refuse either file, and the alert, which takes the focus, says `A newer version of Proof of Calm saved or deleted entries on this device, so nothing was imported. Reload the page, then import again.`; entries an import would store that do not read as entries (`invalid-entries`, `docs/DOMAIN.md` §3.13) refuse it, and the alert, which takes the focus, says `1 entry in this import cannot be stored, so nothing was imported. Export a new backup from Proof of Calm on the device that made it, then import the new file.` (`2 entries` for more) |
| Import with no plan | under the file line one secondary button `Import this backup` in place of the two (both modes take the file's plan, `docs/DOMAIN.md` §3.13); no dialog; result `Plan imported. Entries now: 2.` |
| Import from the DCA plan page | file line `DCA-Plan.json, exported from the DCA plan page. Purchases in this file: 18.`; over a plan the two buttons, the dialog and the result lines of `Import a file`, the dialog's body `The plan and purchases in this file take their place, with the file's holding rule; export a copy first if you want to keep this plan.`; with no plan, in place of `Import this backup`, the line `Files from the DCA plan page have no country. Choose the country you live in; the plan keeps the file's holding rule and currencies, which you can change in Hold & sell and Currency & data.` above onboarding's country step, whose one button confirms the country and imports (ADR-0014) and stays focusable with `aria-disabled` while the import writes, result `Plan imported. Entries now: 18.`; under the result one bulleted line for each adjustment the import made (the `settings.data.prototype.report` messages), worded as what changed and why, its dates and days the plan's, formatted (§4), e.g. `1 purchase was not imported: it was missing a coin, an amount, units or a date.`, `The file's buy day was outside 1 to 28, so the buy day is now 28.` or `The file's tax note was not imported. Copy it from the DCA plan page if you want to keep it.`; after `Add missing entries only`, which keeps this plan, only the lines on the file's purchases, and for each coin this plan does not list whose purchases were added, `2 purchases of XRP were added. This plan does not list XRP, so Portfolio shows it after the plan's coins; you can add it in Coins & split.`; a plan the import cannot complete: alert `The plan in this file from the DCA plan page is not complete, so nothing was imported. Check its amounts and dates there, export it again, then import the new file.` |
| Paste an export | under `Choose a file`, a text box labelled `Paste a backup or an export from the DCA plan page` and one secondary button `Read the pasted text`, which reads the text as a chosen file is read and empties the box; it stays focusable with `aria-disabled` while an import writes; the file line of a pasted text from the DCA plan page `Pasted text, exported from the DCA plan page. Purchases in this text: 18.`, of a pasted backup `Pasted backup, exported on 16 Oct 2026. Entries in this backup: 23.`; everything after the file line as in `Import a file` and `Import from the DCA plan page`, where the country step takes the focus when it appears (`docs/DESIGN.md` §6), except that the currency refusal of `Add missing entries only` and the refusal of entries that cannot be stored name the paste, as the unreadable line does: `The purchases in the pasted text are in USD, and this plan's are in EUR, so nothing was added. Amounts are never converted. If you want the pasted plan and its currency in place of this one, paste the text again, then Replace everything.` and `1 entry in the pasted text cannot be stored, so nothing was imported. Export a new backup from Proof of Calm on the device that made it, then paste the new text.` (`2 entries` for more) |
| Import an exchange's file | the preview of a Kraken ledger or a Trade Republic transaction export (the lines of Trade Republic's file at the end of this row), worded from what the import would do (`docs/DOMAIN.md` §3.13), shown in Settings under `Import a file` when a ledger or a transaction export is chosen or pasted with a plan (`or a transaction export` added 2026-11-14, since the preview opens for Trade Republic's file too), under the heading `What this file adds`, which takes the focus; every count a figure (§4), every date and amount formatted, units trimmed to the places the most precise in the sentence needs, at most the coin's own. First the file, `kraken-ledgers.csv: a Kraken ledger of 9 rows, from 5 Oct 2026 to 16 Oct 2026.` (`Pasted text:` for a paste, `1 row`, the dates only when it has rows), then `Each date is the day in this device's time zone, Europe/Lisbon.`, then the field `Venue for these entries`, filled with the spelling of the latest entry whose venue is Kraken, else `Kraken` (over 40 characters: `Use at most 40 characters in the venue.`). Summary `Adds 5 entries: 3 monthly buys, 1 sale, and 1 Coins added entry at no cost.` (each kind only when it adds one), or `Nothing to add from this file.`; when it replaces estimates, `Replaces 1 estimate from Bought as planned.` (`2 estimates`, counting estimates, not months); when a month's imported purchases come to less than half of its estimate (`docs/DOMAIN.md` §3.13 step 5), after it `Keeps 1 estimate from Bought as planned: the purchases imported for its coin and month come to less than half of it.` (`Keeps 3 estimates … for each coin and month, the purchases imported come to less than half the largest estimate.`, decided 2026-11-23: the largest estimate of one coin and month is what step 5 compares), and a collapsed section `Estimates it keeps (1)`, one item per estimate: `Monthly buy for October 2026: the estimate of 0.00119 BTC at Bitvavo for €70.00 stays; the purchases imported for its coin and month come to €30.00.`, a fact with no instruction (decided 2026-11-23); when no purchase or sale is in the plan's currency, `No purchase or sale in this file is in EUR, this plan's currency: they are in USD. Amounts are never converted.`. Then, each only when it applies (decided 2026-11-14, ADR-0056; the import names them and changes neither entry): `Your Log has 1 entry imported earlier that this file shows as cancelled: 0.005 ETH for €15.00 on 13 Oct 2026. Delete it in the Log.` (`2 entries`, the items as a list, `Delete them`; an item with no amount, `0.00005 BTC on 7 Oct 2026`; entries, as the Log names them, decided 2026-11-14; Trade Republic's file only, the trades a cancellation in it pairs whose entry is live), followed, when the Log once this import is applied (its entries added and the estimates it replaces tombstoned) and the named entries deleted leaves a month no monthly buy but imported ones that come to less than half the largest of its coin's estimates for that month that are tombstoned or that this import replaces (`docs/DOMAIN.md` §3.13 step 1; decided 2026-11-23: the line is written for an earlier import's buy that replaced the month's estimate and that this file cancels, where one import of the whole file keeps that estimate live, so the wording holds for a month that keeps an imported buy under half, and recording the month again gives the Log one import gives; a tombstone does not record who made it, so an estimate the person deleted or cleared by hand counts too, and the line can then show where one import of the whole file keeps no estimate live, or keeps live one the person cleared; it stays true in every such state, since deleting the named entry leaves the month without a live estimate this import cannot bring back), by `Deleting it leaves BTC for October 2026 without its estimate, which this import cannot bring back. Record that month again in the Log if you bought in it.` (`Deleting them`, `BTC for September 2026, BTC for October 2026, and ETH for October 2026 without their estimates`, `Record those months again in the Log if you bought in them.`; the instruction names no coin figure, `docs/LEGAL.md` §6 Q1; it says only what deleting does, since the import cannot tell its own tombstone from a hand delete; decided 2026-11-14); one line for each receipt stored with fewer units than the file now gives, `A Coins added entry of 16 Oct 2026 imported earlier holds 0.00003 BTC in the Log and 0.00005 BTC in this file. Change its units in the Log to the file's.`, and when the file dates it otherwise, `A Coins added entry of 18 Oct 2026 imported earlier holds 0.00003 BTC in the Log and 0.00005 BTC in this file. The file dates it 16 Oct 2026. Change its units, and its date, in the Log to the file's.` (the figures compared at the places the preview shows, so typing the named figure ends the line; no coin figure in the instruction, `docs/LEGAL.md` §6 Q1; decided 2026-11-14); then one line for each row of one-tap estimates the file leaves while its purchase made after the month's reach counts for another month or as an extra buy (`docs/DOMAIN.md` §3.13, "Lines that ask for a change"), `Your BTC estimate from Bought as planned for October 2026 stays in the Log. This import adds the file's 0.0012 BTC for €100.00 on 19 Oct 2026 as a monthly buy for November 2026.` and below it, on its own line in the secondary ink as the starting line's instruction, `If it was your monthly buy for October 2026, change the estimate's date, cost, and units in the Log to the file's. Do this before you import, then choose the file again.` (`Your BTC and ETH estimates from Bought as planned for October 2026 stay`, `0.0011 BTC for €70.00 and 0.012 ETH for €30.00`, `as monthly buys for November 2026` or `as an extra buy` and `as extra buys`, `If they were your monthly buys`, `change the estimates' date, costs, and units`; `from Bought as planned` names the estimate as `Replaces 1 estimate from Bought as planned.` does; the fact and the instruction apart, decided 2026-11-14; only when the change, made as the Log makes it, records that date by the estimates and keeps every other line, and only before the import; decided 2026-11-14). When the Log has a Coins added entry and a purchase or receipt of its coin in the file that the entry guards (`docs/DOMAIN.md` §3.13 step 4), after the summary: `Your Log has 0.002 BTC as a Coins added entry at Ledger, dated 13 Oct 2026. 2 BTC transactions in this file, 0.002 BTC in all, are dated on or before it and may be those coins. They are not added unless you choose to.` (`1 BTC transaction in this file, 0.001 BTC, is dated`, then `It is not added`, the venue only when the entry names one); when more than one entry guards one, every such entry, oldest first, `Your Log has 2 Coins added entries of BTC: 0.0015 BTC on 6 Oct 2026 and 0.0020 BTC at Ledger on 13 Oct 2026. 2 BTC transactions in this file, 0.0020 BTC in all, are dated on or before the latest of them and may be those coins.` (`1 BTC transaction in this file, 0.0012 BTC, is dated on or before the latest of them`; decided 2026-11-14), and, while they are not added, `If you add them, they also replace 1 estimate from Bought as planned.` when they would (`If you add it, it also replaces` after one transaction; every sentence after the line is `it` for one transaction and `they` for several, counted over the line's coins; decided 2026-11-14), then `If you add them, 1 sale from Left out is imported too.` when ticking adds back sales a guard left out (`If you add it`, `2 sales from Left out are imported too`; the estimates sentence first, then the sales sentence; decided 2026-11-23), so a file whose only sale waits on the box reads `Nothing to add from this file.` until it is ticked; then the checkbox `Add these transactions too` (`Add this transaction too` after one transaction), unticked (transactions, as the line above counts them: every role but a sale, bonus receipts among them; decided 2026-11-13), and `If you add them and their coins are the same ones, delete the Coins added entry in the Log after the import.` (`delete the Coins added entries` when the line names several, `If you add it and its coins are the same ones` after one transaction; decided 2026-11-14; the plural worded as the singular is, decided 2026-11-14). Then one section for each kind that has an entry, collapsed until opened, its trigger naming the count: `Monthly buys (1)`, each `Monthly buy for October 2026: 0.012 ETH for €30.00, fee €0.08, on 5 Oct 2026.` (the summary's other 2 monthly buys replace an estimate, so they show in the next section, not this one); `Estimates it replaces (1)`, one sentence for each estimate, `Monthly buy for October 2026: the estimate of 0.00119 BTC at Bitvavo for €70.00 becomes 2 purchases at Kraken, 0.00200 BTC for €120.00 in all, fees €0.31, on 5 Oct 2026 and 12 Oct 2026.` (the estimate named once, by the sentence, in every language, `the estimate of` as pt-PT's `a estimativa de`, so its units are unmarked, decided 2026-11-18; every purchase the file adds for that month and coin, summed as `Matching entries` sums a hand entry's dates: the count of purchases, never of dates, `fee` for one fee and no fees part when no purchase has one, decided 2026-11-14; a fee of 0 is no fee: its `, fee` part is left out, `Monthly buy for October 2026: 0.00005 BTC for €4.50, on 7 Oct 2026.`, and the summed fees count only fees above 0, decided 2026-11-14; one purchase as itself, `Monthly buy for October 2026: the estimate of 0.00119 BTC at Bitvavo for €70.00 becomes 0.00120 BTC at Kraken for €70.00, fee €0.18, on 5 Oct 2026.`; the venue only when it differs from the estimate's; no line under them, decided 2026-11-14: typing an estimate's units in the Log can leave the month counted twice or a purchase moved to the next month, `docs/DOMAIN.md` §3.13); for a file with one, `Extra buys (1)`, each `Extra buy: 0.0008 BTC for €50.00, fee €0.13, on 12 Oct 2026.` (a purchase in no month of the plan, in a skipped or paused one, or of a coin at 0 %, unless the Log holds a one-tap estimate of its coin for that month; decided 2026-11-14); `Sales (1)`, each `Sale: 0.01 ETH for €25.00, fee €0.07, on 15 Oct 2026.`; `Coins added at no cost (1)`, each `Coins added: 0.00005 BTC at no cost, on 16 Oct 2026.`; `Matching entries in the Log, not added (1)`, each `The file's 0.00120 BTC for €70.00 on 5 Oct 2026 looks like your monthly buy for October 2026: 0.00121 BTC at Bitvavo for €70.00.` (an entry that records several of the file's purchases, on one date or several, counted by purchase as the sentence under it is, `The file's purchases of 0.002 BTC for €120.00 in all, on 5 Oct 2026, look like your monthly buy for October 2026: 0.002 BTC at Bitvavo for €120.00.` (`on 5 Oct 2026 and 12 Oct 2026`; a sale's `The file's sales of 0.002 BTC for €120.00 in all`; decided 2026-11-15); an item whose dates come to less than half of its entry's amount says `The file's 0.0008 BTC for €50.00 on 5 Oct 2026 counts as recorded by your monthly buy for October 2026: 0.0020 BTC at Bitvavo for €120.00. €50.00 is less than half of that entry's amount.`, with no `look like`, no date clause and no delete sentence (decided 2026-11-23; no date clause, since a plan month reaches 15 days either side of its due date, `IMPORT_MATCH_DAYS`, so neither `the same month` nor `within 3 days` holds for every claim); a one-tap entry's units marked as the starting-amount line marks them, `looks like your starting amount of 5 Apr 2026: 0.01219512 BTC (estimated) for €1,000.00.`, decided 2026-11-15; decided 2026-11-14: no count, since a date's amount is all the file's purchases on it, and the dates after the sum, so a serial comma never runs into it; `your starting amount of 5 Apr 2026`, `your extra buy of 12 Oct 2026`, `your sale of 15 Oct 2026`), and, on its own line at the end of the item it applies to, inside that list item in the secondary ink, `To import the file's transaction instead, delete that entry in the Log, then choose the file again.` (`the file's transactions` when the item names more than one transaction, on one date or several) only when deleting the entry's row in the Log and choosing the file again, its box for coins held unticked, before importing this preview or after, adds every date the item names and keeps every other entry the import adds and every estimate it replaces, except those of a month the delete frees (`docs/DOMAIN.md` §3.13, "Lines that ask for a change"; never after a starting amount, an imported entry or past the rows the preview checks, `IMPORT_RECORDED_CHECKS`, `docs/DOMAIN.md` §9, nor in a file of more than `IMPORT_REMEDY_MAX_MOVEMENTS` movements, `docs/DOMAIN.md` §9; decided 2026-11-14); `Left out (11)`, counting its lines, which come in this order, each only when it applies: `1 purchase or sale in USD, not imported: amounts are never converted.` (`4 purchases and sales in USD`); for each coin the plan does not list, `This plan does not list XRP, so 1 XRP transaction was left out. If you want it in this plan, you can add XRP in Coins & split, then choose the file again.` (`2 XRP transactions were left out. If you want them`); `1 purchase dated on or before 20 Apr 2026, 15 days after your first buy day, not imported: 0.0006 BTC for €40.00 on 10 Apr 2026. The file cannot show whether it is part of your starting amount. The Log holds no starting amount.` (`2 purchases`, `whether they are part`; the days are `IMPORT_MATCH_DAYS`, `docs/DOMAIN.md` §9, so the date reads as the cut-off it is; each purchase named with its units, amount and date, the latest five past five and then `and 2 earlier`, since the ones left unnamed are the oldest, except that the purchases of the date the instruction below names always show, taking the earliest ones' places, and the list then ends `and 2 more`, since the ones left unnamed are no longer all earlier; a coin's units at the places the most precise of them in the whole line needs, purchases and starting amounts together; then, per coin of the named purchases, one sentence for what the Log holds, decided 2026-11-14 so that a starting amount of another coin is never named as theirs: while it holds a starting amount of each, `The Log holds your starting amount as 0.00875 BTC for €700.00 and 0.12 ETH for €300.00, both on 5 Apr 2026.` (the date once when they share it, `all on` for three or more), a one-tap one as `0.00875 BTC (estimated) for €700.00`, and, while the Log also holds a starting amount of a coin the line does not name, the coins named, `The Log holds the BTC part of your starting amount: 0.00875 BTC for €700.00 on 5 Apr 2026.` (`the BTC and ETH parts` for two or more), since the listed ones are not all of it; of some of them, in two sentences, `The Log holds part of your starting amount as 0.00875 BTC for €700.00 on 5 Apr 2026. It holds no starting amount of ETH.` (`no starting amount of`, as the sentence for none of them, since `none of it` read as none of the part); of none of them while it holds one of another coin, `The Log holds no starting amount of BTC.`; `The Log holds no starting amount.` only while the Log holds no starting amount of any coin, the Log the subject as in the other sentences; then, on its own line at the end of the item, in the secondary ink as the matching entries' sentence, only where following it imports the file's purchases of that date and keeps every other line (`importRemedies`, `docs/DOMAIN.md` §3.13, "Lines that ask for a change"), while the Log holds a starting amount `If you bought your whole starting amount on 20 Mar 2026, change its date, cost, and units in the Log to the file's. Then choose the file again.`, and while it holds none, `If you bought your whole starting amount on 20 Mar 2026, record it in the Log with the file's date, cost, and units. Then choose the file again.` (the starting-amount sheet takes every coin's part in one save); when a coin of the change has two or more purchases on that date, the item's text ends `The file's purchases on 10 Jun 2026 add up to 0.0125 BTC for €1,000.00.` (`add up to 0.00875 BTC for €700.00 and 0.1 ETH for €300.00.` for two coins, each coin of the change) and the instruction reads `If you bought your whole starting amount on 10 Jun 2026, change it in the Log to that date and those totals. Then choose the file again.` (`record it in the Log with that date and those totals`; the figures in a sentence of their own and no coin figure in the instruction, `docs/LEGAL.md` §6 Q1; decided 2026-11-14: typing one purchase's figures left the others out); never `record it` while the Log holds a starting amount and never to record a purchase each or as an extra buy, since recording a purchase the Log already holds counts it twice, decided 2026-11-14; the instruction decided 2026-11-14, `If you bought` because the file cannot show it; the starting amount named by the first buy day, decided 2026-11-14; every purchase on or before that date, however early, in a plan with a starting amount or for a coin with a one-tap starting amount; decided 2026-11-14; choosing per purchase waits for M4, `docs/ROADMAP.md`); after it, one item per sale a guard leaves out (`docs/DOMAIN.md` §3.13 step 4), in date order: `0.005 BTC sold for €400.00 on 10 Apr 2026, not imported. It is dated on or before 20 Apr 2026, 15 days after your first buy day. On 10 Apr 2026, the purchases this file imports and your own entries hold less BTC than the sale. Monthly estimates from Bought as planned do not count.` (`on or before your Coins added entry of 0.020 BTC on 13 Oct 2026` for a Coins added entry's reach, its units at the places the sale's need; a fact, never an instruction, and never `the Log holds`, since other imports' entries count only before the file's earliest left-out purchase; decided 2026-11-23); `Rewards paid in coins, not imported: 0.0001 ETH.`; `Coins sent to Kraken from elsewhere, not imported: 0.01 BTC. Record a gift with Add coins you already have, and your own coins coming back with Log coins you moved.`; `Coins sent out of Kraken that match a move in the Log: 0.00502 BTC.`; `Coins sent out of Kraken with no matching move in the Log: 0.00502 BTC. Record each with Log coins you moved.`; `1 exchange of one coin for another, not imported: the file gives no amount in EUR for it.` (`2 exchanges`, `for them`); `1 row of money with no coin, such as a deposit or withdrawal, not imported.` (`2 rows of money with no coin, such as deposits and withdrawals`); `1 row within Kraken, such as a move between its wallets: it changes no entry.` (`2 rows within Kraken, such as moves between its wallets: they change no entry.`); `Line 15 could not be read or matched to the other row of its trade, so it was left out.` (`Lines 15, 16, and 17 could not be read or matched to the other rows of their trades, so they were left out.`, past five lines `Lines 2, 3, 4, 5, 6, and 4 more`); `1 row of another type, not imported.` (`2 rows of other types`). Last, each only when it counts one: `Imported earlier, not added: 4.`, `Deleted earlier on this device, not added: 1.`, `Units cut to 10 decimal places: 1 entry.`, `Fees taken in the coin, valued at the trade's own price: 1 entry.` An exchange's file the import cannot take, chosen or pasted, raises an alert in place of `Import not recognised`, which takes the focus (each code of `readExchangeFile`, `docs/DOMAIN.md` §3.13, and of the ZIP reader, `docs/ARCHITECTURE.md`): a chosen ZIP opens the preview of its one CSV file, named as the ZIP is; one with no CSV file, `This ZIP file holds no CSV file, so it was not read. Choose the ZIP of your exchange's export, or the CSV file inside it.`; one with more than one, `This ZIP file holds more than one CSV file, so it was not read. Open it, then choose the CSV file of your exchange's export.` (both name the export the person's exchange gave, not Kraken's Ledgers, since the import reads two exchanges' files and an error names a fix that fits either, §1 rule 8; decided 2026-11-14); one whose CSV file is past the size limit, `The CSV file in this ZIP is larger than 50 MB, so it was not read. Export a shorter period from the exchange, then choose the new file.` (a no-break space between the figure and `MB`, as the file's own size line writes it, so the numeral never wraps away from its unit, §1 rule 1 and §4; decided 2026-11-13); one the reader cannot open (encrypted, ZIP64, multi-disk, another method, a bad CRC or size, undecodable or truncated data, or a browser with no deflate), `Proof of Calm cannot open this ZIP file, so it was not read. Open it on your device, then choose a CSV file inside it, or export it again from the exchange.` (its own line, decided 2026-11-13: for a ZIP64 or damaged directory the reader stops before it counts any CSV file, so the line names none as `the CSV file`; now that the import opens ZIPs it must not read as if ZIPs were never read; and a damaged archive needs a step the person can carry out, exporting again); a pasted ZIP, `This is a ZIP file. Open it, then choose the CSV file inside.`; no alert names a file inside the ZIP; Kraken's trades file, `This is Kraken's Trades export. Export the Ledgers from Kraken instead, then import that file.`; a ledger missing required columns, each named as a list, `This Kraken ledger is missing the refid and fee columns, so it was not read. Export the Ledgers again with every field.` (`column` for one); a header with no data row, `This Kraken ledger has no rows, so nothing was imported. Export the Ledgers again for a period with transactions.`; a ledger with no plan stored, `This Kraken ledger needs a plan for its coins, currency, and months. Set up a plan, then choose the file again.` Under the sections, `Import 5 entries` (`1 entry`; none when nothing is added) and `Cancel`, which gives the focus back to `Choose a file`. An import that wrote ends in the status line, which takes the focus: `Entries added: 5.`, then, each only when it counts one, `Estimates replaced: 1.`, `Imported earlier, not added: 4.` and `Deleted earlier on this device, not added: 1.` A write refused because the plan or the Log changed since the preview shows, focused above the new preview with the venue and the answer kept, `The plan or the Log changed after this preview was made, so nothing was imported. The preview now shows what the file adds: check it, then import.`; every other refusal closes the preview with its alert: rows from a newer version, the backup import's `A newer version of Proof of Calm saved or deleted entries on this device, so nothing was imported. Reload the page, then import again.`; no plan any more, `This device has no plan now, so nothing was imported. Set up a plan, then choose the file again.`; over the cap, `Importing this file would leave 10,004 entries in this plan, more than the 10,000 a plan holds, so nothing was imported. Delete entries in the Log, then choose the file again.`; entries that do not store, `2 entries from this file cannot be stored, so nothing was imported.` (`1 entry`). Trade Republic's file (decided 2026-11-13, ADR-0056: Trade Republic named only as the file's format and the entries' default venue, unlinked; Kraken's lines above unchanged): every line not listed here reads as Kraken's (the ZIP alerts name no exchange, and a venue a line names is the field's). The file, `trade-republic.csv: a Trade Republic transaction export of 16 rows, from 2 May 2026 to 4 Jul 2026.`; the venue field filled with the spelling of the latest entry whose venue is Trade Republic, else `Trade Republic`, never `Kraken` (an entry's venue is where the file came from). Under `Left out`: `Staking rewards and coins sent in to Trade Republic, not imported: 0.00012 ETH in 1 row. Record rewards with Add coins you already have, and your own coins coming back with Log coins you moved.` (`2 rows`; the export marks staking rewards and coins sent in alike, so the line names both and counts the rows; the first sentence shortened to at most 25 words, §1 rule 4, decided 2026-11-14); `Coins sent out of Trade Republic that match a move in the Log: 0.0001 BTC.`; `Coins sent out of Trade Republic that match no move of the same units in the Log: 0.0001 BTC. If you have not recorded them, record each with Log coins you moved.` (the export does not show whether the network fee is inside the units sent, so neither line names a fee, and the second says what it compared); a migration that swaps one token for another is counted by Kraken's line `1 exchange of one coin for another, not imported: the file gives no amount in EUR for it.`; `1 row of money with no coin, such as a card payment, interest, or a transfer, not imported.` (`2 rows of money with no coin, such as card payments, interest, or transfers`: the cash rows a Trade Republic account holds); `1 Saveback cash credit, not imported; any purchase made with it is read like your other purchases.` (`2 Saveback cash credits`, `with them`; after the cash line: the credit is money, and a purchase made with it is read as any other; decided 2026-11-14: the line no longer describes the provider's product by its benefit, `docs/LEGAL.md` §6 Q4, and no longer promises an import the reader does not guarantee); `1 row within Trade Republic, part of a migration that cancels out at one moment: it changes no entry.` (`2 rows within Trade Republic, part of migrations that cancel out at one moment: they change no entry.`: rows whose coin sums to 0 at one instant; decided 2026-11-14: nothing in the export shows rows moving between accounts, so the line names only what the reader knows); in place of Kraken's line of lines, one sentence per cause, in this order, each naming its lines as Kraken's does (decided 2026-11-14, §1 rule 10: the reader knows which rows are which, so no sentence offers two causes): `Lines 12 and 13 are a trade and its cancellation, so they were left out.` (`Lines 2, 3, 6, and 7 are 2 trades and their cancellations`, the pairs counted as a figure; past six lines the first six and the rest as a count, `Lines 2, 3, 4, 5, 6, 7, and 2 more are 4 trades and their cancellations`), `Line 9 is the cancellation of a buy, so it was left out. No unpaired earlier buy of the same coin, units, and amount could be read from this file.` (`Lines 9 and 10 are cancellations of buys, so they were left out. No unpaired earlier buys of the same coin, units, and amount could be read from this file.`, past five lines `Lines 9, 10, 11, 12, 13, and 4 more are cancellations of buys`; rule 6 pairs a cancellation with an earlier trade of its side and the same coin, units and amount, earlier in time rather than in the file, one trade to one cancellation, so the line names what it compared; `could be read` because a buy the reader could not read pairs with nothing, and `unpaired` because another cancellation may have taken the trade, so the line stays true in both cases (counsel and brand, 2026-11-14); the side comes first and `left` is said once, since the two sentences sit next to each other; two sentences, one idea each, §1 rule 4), the same for a sale's cancellation with `the cancellation of a sale` and `earlier sale` (`cancellations of sales` and `earlier sales`, the reason `unpaired-sale`, after the buys' sentence, decided 2026-11-14: a buy of those figures can be in the file), and `Line 16 could not be read, so it was left out.` (`Lines 16 and 17 could not be read, so they were left out.`, past five lines `Lines 2, 3, 4, 5, 6, and 4 more could not be read`); `1 row of another type, such as a share or a fund, not imported.` (`2 rows of other types, such as shares and funds`: the export holds the whole account; shortened to one idea, §1 rules 4 and 10, decided 2026-11-14). Its alerts: `This Trade Republic transaction export is missing the shares column, so it was not read. Export the transactions again from Trade Republic.` (`columns`, each named as a list); a header with a name the reader does not know, `This looks like a Trade Republic transaction export, but it has 2 columns Proof of Calm does not know: note and 1 more. It was not read. If you edited the file, export the transactions again from Trade Republic, then choose the new file as it is.` (`1 column`; the fix names an edited file, the one case exporting again fixes, decided 2026-11-14; only names of lowercase letters and underscores, at most 40 characters, are shown and the rest counted, so no free text from a header reaches the screen; the file is not read, since an unknown column may hold a meaning the reader would miss; `it has 1 column Proof of Calm does not know.` when none can be named); `This Trade Republic transaction export has no rows, so nothing was imported. Export the transactions again for a period with transactions.`; `This Trade Republic transaction export needs a plan for its coins, currency, and months. Set up a plan, then choose the file again.` |
| Sale exceeds holdings | `This sale is 0.021 BTC more than you hold (0.312 BTC on 16 Oct 2026). Check the amount and the date, or log the missing purchases first.`, the date the sale's; both figures at the decimals the more precise one needs (`docs/DESIGN.md` §5 rule 7), a holding of 0 with none (a sale dated before its purchase holds 0 that day) |
| Coins with no recorded cost (Portfolio) | after the summary, while coins added with no cost are held: `No recorded cost for 0.01 BTC and 0.5 ETH, so Invested, the average cost, and the P/L leave these units out.`, the units of each such coin in one list (§1.9) |
| Not bought yet (Portfolio) | under the holdings, while a plan coin has no units: `Not bought yet: SOL. For coins you already have, open the Log and choose Add coins you already have.`, the coins in one list (§1.9), `Log` the link to the Log (§1.7: the link names where it goes; the sentence names the button there) |
| Value on 1 January (Portfolio, the Netherlands only) | last on the screen, for the profile of a wealth snapshot on 1 January and the current calendar year (`docs/JURISDICTIONS.md` §7.8): the term `Value on 1 January 2030` over the figure in the closes' currency, then at `text-14` `Estimate from the daily closes of 31 Dec 2029 for BTC and ETH · Price data by CoinGecko`, the credit unlinked (ADR-0050); while the closes load `Loading the daily closes of 31 Dec 2029.`; until the closes were fetched at or after 00:10:30 UTC on 1 January, since CoinGecko's last point dated 31 December is before then the price at the call, or no point is dated that day (ADR-0036's Readings), no figure: `The daily closes of 31 Dec 2029 are not in the price history yet, so there is no value to show.`; with a held coin that has no close dated that day, or none loaded, no partial sum: `The price history has no daily close of 31 Dec 2029 for ETH, so there is no value to show.`; while a live entry of coins added (`Add coins you already have`) is dated after that day, under the figure or the line in its place, `Coins added in the Log with a date after 31 Dec 2029 are not counted here: BTC. If you held them on 31 Dec 2029, change their date in the Log.`, the last `Log` the link to the Log, as in the "Not bought yet (Portfolio)" row, and with nothing held that day the figure's place says `The Log shows no coins held at the end of 31 Dec 2029.`; nothing with nothing held and nothing added later, and nothing when the closes could not be read, which the value chart's line says. No disclaimer of its own (decided 2026-11-08): `docs/LEGAL.md` §4 asks for the past-performance line once per path, so the value chart carries it when it draws (or loads); otherwise, under a figure, this line carries the same `Past performance is not a reliable indicator of future results.` with the link `Risk disclosure`, after the estimate line and at its `text-14`, the type of the line above it as on the chart; a second line would repeat it, and Portfolio is not a decision point, so no sentence of its own is added. Never near it: the tax's name, `taxable`, a rate, the allowance, a deadline, the return's field, or words that tell the person to enter the value anywhere |
| Sale before its purchases (Portfolio) | one line per coin under the holdings, from imported data only: `0.002 BTC sold without a purchase dated on or before the sale. Check the dates and amounts in the Log.`, and on its own line a move's network fee that no lot of the coin covers, its destination's included: `0.0005 BTC paid as a network fee that no purchase dated on or before the move covers. Check the dates and amounts in the Log.`; a fee taken at the destination shows neither (ADR-0055); the units in the plan's locale, trimmed as in prose |
| Portfolio value chart | after the summary: the range buttons `7D` · `30D` · `90D` · `1Y` · `All` (group `Chart range`), each named by its label and then the range in words, so the name holds the visible text (WCAG 2.5.3): `7D, last 7 days`, `30D, last 30 days`, `90D, last 90 days`, `1Y, last 12 months`, `All, since the first entry`; the chart named `Portfolio value, last 30 days (20 Sept 2026 to 20 Oct 2026), from €1,200.00 to €1,860.00` (`last 7 days`, `last 90 days`, `last 12 months`, `since the first entry`), or by its own dates alone when the closes start after the range's first day, `Portfolio value, 18 Oct 2026 to 20 Oct 2026, from €100.00 to €121.00`, so the name never claims days it does not draw; no change figure, because the values bought inside the range would count as a rise; table view `Show the values as a table` with `Date` · `Value`; under it `Daily closes, 20 Sept 2026 to 20 Oct 2026, as of 14:05, 20 Oct 2026 · Price data by CoinGecko`, then the past-performance line of the first historic view on the path, in the same type as the closes line, with the link `Risk disclosure` (`docs/LEGAL.md` §4); without the closes one `ink-2` line `The price history could not be loaded, so there is no chart. Open Portfolio again to retry.`; when a coin with entries has fewer than two daily closes, one `ink-2` line names the coins, with no retry step: `The price history has fewer than two daily closes for ETH, so there is no chart.` (`for BTC and ETH`); a range with no value to draw keeps the range buttons, and one `ink-2` line with the range's dates and a next step takes the chart's place: `There is no value to draw for the last 30 days, 20 Sept 2026 to 20 Oct 2026. Choose a longer range.` (`last 7 days`, `last 90 days`, `last 12 months`), only while a longer range has a value; when every entry is later than the last close and a coin is held at the end of one of their days no range has one, and every range, All included, shows `There is no value to draw since the first entry: the daily closes end on 20 Oct 2026. The chart starts with the next daily close.`; when nothing was held on any day the closes cover (everything bought was sold before them or on their first day, or every entry is later and none of their days ends with a coin held), every range shows `There is no value to draw: you held no coins from 21 Oct 2025 to 20 Oct 2026, the dates the daily closes cover.`; a range not saved: toast (8 s) `The chart range could not be saved. Choose it again.` |
| Holdings row chart | in an open holdings row, drawn only while the Portfolio value chart draws, over its range: the coin's daily closes, named `BTC price, last 30 days (20 Sept 2026 to 20 Oct 2026), from €61,000.00 to €62,500.00` (the range words of the "Portfolio value chart" row), or by its own dates alone when the closes start after the range's first day, `BTC price, 18 Oct 2026 to 20 Oct 2026, from €61,000.00 to €62,500.00`; no change figure, as on the value chart; legend `BTC price` · `Purchase` · `Sale` · `Average cost`, each mark's legend item shown only while the chart draws that mark; the average cost's level labelled `Average cost €59,500.00`; tooltip `5 Oct 2026: €61,640.00, bought €100.00` (`, sold €150.00`; both when the day has both); table view `Show the daily closes as a table` with `Date` · `Close` · `Bought` · `Sold`; under it `Price data by CoinGecko` (the "Prices attribution" row); no past-performance line: the row chart draws only while the value chart above it draws, and that chart carries the line under its figure (`docs/LEGAL.md` §4, ADR-0047); while the closes load, the same frame stands empty and unread, so an open row keeps its height; when the coin has closes but fewer than two inside the range (histories that end on different days, a first entry yesterday), one `ink-2` line takes the chart's place, with the range's dates and no retry step: `The price history has fewer than two daily closes for ETH from 26 Oct 2026 to 27 Oct 2026, so there is no chart.`; a coin with no closes at all shows nothing, since the value chart's line names it |
| Holding warning on a sale | `Only 0.10 of the 0.15 BTC sold are past the holding rule on 20 Oct 2026. The rest may be taxed.` with a tax-free rule; where lots are kept per venue (`docs/JURISDICTIONS.md`) and one coin's sale spans two venues, each warning names its venue after `sold`: `Only 0.10 of the 0.15 BTC sold at Kraken are past …`, or `sold with no venue`; `Only 0.10 of the 0.15 BTC sold are past the holding rule on 20 Oct 2026. The rest may be taxed at the short-term rate.` with a lower-rate rule (`docs/JURISDICTIONS.md` §1); when none of it is past the rule, `None of the 0.001 BTC sold is past the holding rule on 20 Oct 2026. It may be taxed.` (or `It may be taxed at the short-term rate.`), never `Only 0.000 of`. The figures trimmed as in prose, the date the sale's; under it, once, `Computed from your dates, not tax advice` (`docs/LEGAL.md` §4) |
| Template labels | the risk label first, as the card's badge; under the card's one line and split line its dated band, composed by the app from the template's `drawdowns` (`docs/DOMAIN.md` §5): each coin's ticker before its fall, signed with U+2212 (§4) so it never reads as a split, then the window that holds every fall, from the earliest high to the latest low ("each" only for two coins or more), in the plan's percent format with dates that never break and the serial comma in any English UI; in the UK's formats: `BTC −78% and ETH −82%, each high to low between 10 Nov 2021 and 21 Nov 2022` (two coins), `BTC −78%, ETH −82%, and SOL −97%, each high to low between 6 Nov 2021 and 29 Dec 2022` (three); then the template line once after the cards: see `docs/LEGAL.md` §4 |
| "Why?" links | `Why?` as the link text, opening the module in a sheet: a button styled as a link, and the one control label under §1 rule 7 that is a question; sheet title is the module's idea, the button `Close`; the accessible name starts with the link text and names what it stands beside: `Why? The hold phase`; a sheet that cannot load leaves the screen and the link, with a toast (8 s) `This explanation could not be loaded. Check your connection, then reload the page.` and its action `Reload`, since an installed app has no browser reload, and each further press says so again |
| Learn | the index: the heading `Learn`, a row per module with its title, its idea and `2 min read`, then the row `Countries` with the line `Tax and holding rules by country, with their sources and the date each was last reviewed.`; with no module, the heading and that row. The country list: the back link `Back to Learn`, the heading `Countries`, a row per country with its name as the link and `Last reviewed 2 Nov 2026`, or `Not reviewed since 2 Nov 2026` when its card is under review (`docs/LEGAL.md` §4). A country: the back link `Back to countries`, then the jurisdiction card. On the site's pages under `/en/` (ADR-0045) the country list adds, under its heading, the line `Tax and holding rules by country, with their sources and the date each was last reviewed.` and the link `Holding rules by country`; its head title is `Crypto tax rules by country`, a country's `Crypto tax in Portugal` (`Crypto tax in the United Kingdom`, and the article before the Netherlands and the United States too), the headings as in the app; a country page whose rule sets a holding period, and is not under review, ends with the link `Show the date a purchase passes this holding rule` to the holding-date page with that country chosen. The holding-date page: the back link `Back to countries`, the heading `Holding rules by country`, the line `Each country's holding rule with every condition, its sources, and the date it was last reviewed.`, then a row per country with its name as the link to its page, its holding rule with every condition and the link `Sources`, and its date line; between that line and the rows, with script on, the tool: the radios `Country` with each country's name, the field `Purchase date`, the button `Show the date`, the hints `Choose a country.` and `Choose a purchase date from 3 Jan 2009 to 20 Oct 2027.` (the build's day plus a year) under their fields, then one country's result, its name as the link to its page and `Tax-free from 29 Feb 2028` or `Long-term rate from 1 Mar 2025`, `For a purchase on 1 Mar 2027`, `Computed from your dates, not tax advice`, the first condition in full and the rest behind `Show 3 more conditions`, `Sources` and the date line (a rule with no period: its holding-rule text, `Sources` and the line; `docs/LEGAL.md` §4), and under the tool the line `Proof of Calm's Log shows the day each purchase passes the plan's holding period, where there is one.` The Taxes module's page, before its first section, the line `The sections before “How fast rules change” describe what the app shows once a plan is set up. The list at the end links to each country's page.`, and after the body the section `Countries` with the country list's rows. A module: the back link `Back to Learn`, the title, `Last reviewed 30 Oct 2026`, `2 min read`, the caveat in a box, the body, with the link `Risk disclosure` beside a past-performance line (`docs/LEGAL.md` §4); the tax module's review line: §5. On the route of When the market drops alone, while a fall of the held coins is under way, one line above the body: `A fall of the coins you hold is under way. See its figures` (`See its figures` links to the fall page, whose figure shows in every state this line does, while the earlier falls and the next buy day can be missing; never in the sheet) |
| Jurisdiction card | the country's name and summary, then the sections `How crypto is classified`, `What is taxed` (`Selling for money · Taxable`), `Rates` (`From 1 Jan 2026`), `Allowances` (left out when the profile has none), `Holding rule`, `Matching sales to purchases`, `Losses`, `Reporting` and `Questions for an accountant`; a rule with a source ends with the link `Sources`, named `Sources for the rates`, `Sources for the holding rule`, `Sources for matching sales to purchases`, `Sources for losses` or `Sources for reporting`; then the date line (`docs/LEGAL.md` §4); last the section `Sources for Portugal` (the country's name, with its article, `docs/LEGAL.md` §4), a row per source of the profile with its title as the link and `<publisher> · dated 24 Oct 2023`, or `<publisher> · accessed 16 Oct 2026` for a source with no publication date |
| Prices attribution | `Price data by CoinGecko` under the prices CoinGecko supplied, live, delayed or stored offline, under the Portfolio value chart and under each drawn holdings row chart, whose recent daily closes are CoinGecko's (ADR-0036); a row chart's credit is these words alone, its dates on its axis and in its name, the closes' time in the value chart's line; `Reference closes derived from Kraken, Bitstamp and Coinbase public data; FX: ECB reference rates` under every chart or figure drawn from the bundled long history and under the simulator (ADR-0036; M2) |
| Reminder email (M3) | Subject `Your buy day` · Body `It is your buy day. Open Proof of Calm to record it.` · Footer `You asked for this reminder.` and the unsubscribe link; no disclosure sentence (see `docs/LEGAL.md` §4) · one-click unsubscribe |
| Sign-in email (M3) | Subject `Your sign-in code` · Body `Your code is 482 913. It works for 10 minutes. If you did not ask for it, ignore this email.` plus the click-to-confirm link |
| UK page | `Proof of Calm is not available in the United Kingdom yet.` and the legal links; nothing else |

### Coins & split

The coin editor of Settings and onboarding's custom path. The coins to add are a plain list in
alphabetical order of their names (`docs/LEGAL.md` §3): no coin and no split is suggested (ADR-0009).

| Moment | Copy |
|---|---|
| The editor | Group `Coins & split`; one field per coin, `Bitcoin share (%)`; button `Remove Bitcoin` (not on the last coin); under `Add a coin`, one button per coin not in the plan: `Add Ethereum` |
| Onboarding's custom path | on the starting-point step, after the templates, the option `Your own coins` with `You choose the coins and how each buy is split across them.` and no risk label; then the step heading `Choose your coins and their split` over the editor, whose group legend is read by screen readers only, under the step heading, with `Back` · `Continue` (Continue waits for a coin; a refused Continue moves the focus to the first share it marks) |
| 20 coins in the plan | `A plan holds at most 20 coins.` in place of the coins to add |
| Shares off 100 | `Make the shares add up to 100 %.` under the split, describing every share |
| A share with 5 decimals | `Use at most 4 decimal places.` under that share |
| A share that cannot be read | the input errors: `Enter a number such as 1,234.56.` · `Enter the number without a minus sign.` under that share |

### Amounts and dates

The amount-and-dates editor of Settings and onboarding's custom path. Each message sits under the
field it concerns.

| Moment | Copy |
|---|---|
| The editor | Group `Amounts and dates`; `Monthly amount (EUR)`; `Starting amount (EUR)` with `Bought once on the first buy day and split across your coins like each monthly buy. Enter 0 for none.` (on onboarding's custom path `Bought once on the first buy day and split across your coins like each monthly buy. Enter 0 for none. For coins you already have, choose Add coins you already have on the Log after setup.`, the template path's hint); `First buy`; `Buy day`, a select of 1 to 28, with `The day of the month of every buy after the first.`; `Last buy` |
| Onboarding's custom path | the step heading `Choose the amounts and dates` over the editor, whose group legend is read by screen readers only, under the step heading; then `Back` · `Continue`, which goes on to the sentence only once the plan would start; a refused Continue moves the focus to the first field it marks |
| Neither amount above 0 | `Enter a monthly amount, a starting amount, or both.` under the monthly amount |
| An amount with 3 decimals | `Use at most 2 decimal places.` under that amount |
| An amount that cannot be read | the input errors, as for a share, under that amount |
| A date left empty or incomplete | `Choose a full date: day, month, and year.` under that date, as for the entry form |
| Last buy before the first | `Choose a last buy on or after the first buy.` under the last buy |
| More than 240 buys | `A plan holds at most 240 monthly buys. Choose an earlier last buy.` under the last buy |
| On onboarding's numbers step, a template with no `Last buy` field | the refusal sits under `First buy` and names the template's last buy by its date: `Choose a first buy on or before 1 Sept 2029, this starting point's last buy.` · `A plan holds at most 240 monthly buys. Choose a later first buy.` |
| A last buy more than 20 years after the first, within 240 buys | `A plan lasts at most 20 years from the first buy. Choose an earlier last buy.` under the last buy |
| A last buy that opens the sell window before it passes the holding rule | under the last buy, the notice `The sell window opens on 1 Sept 2029. This last buy is tax-free from 5 Jan 2031 under Portugal's rule. You can also choose an earlier last buy.` (`at the long-term rate` for a rule with a lower rate after the period; the rule named by its country: `under Portugal's rule`, `under the general profile's rule` for the generic profile, `your own rule`, and, while the rules are not loaded and no country's source and review date can show, `under your plan's holding rule`; `You can also choose a later opening date.` on Hold & sell and `You can also cancel this change and choose a later opening date on Hold & sell.` on the country change, which has no opening date), then `Computed from your dates, not tax advice` (`Computed from the template's dates, not tax advice` on onboarding's template path), the profile's first condition with `Show 3 more conditions` (`Show 1 more condition`) while it has others, and the country's date line (`docs/LEGAL.md` §4; none under the person's own rule), as Hold & sell, the Plan tab and onboarding all show them, and the checkbox `Open the sell window on 1 Sept 2029, before this last buy passes the holding rule`, described by the notice and unticked whenever it shows; a save without the tick marks the checkbox with the negative boundary, shows under it the refusal `Tick the box to open the sell window early, or choose an earlier last buy.` (`or choose a later opening date.` on Hold & sell; `or cancel this change and choose a later opening date on Hold & sell.` on the country change; `or choose another starting point.` on onboarding's template path), which the checkbox is then described by as well, moves the focus to it and saves nothing; changing the last buy clears the tick; a last buy the saved plan already accepted shows neither. On onboarding's numbers step a template whose dates do this under the chosen country's rule shows the notice above `Back` · `Continue`, before any tap, with `The template's last buy` and `You can also choose another starting point.`, and the checkbox ends `before the template's last buy passes the holding rule`; Continue without the tick marks the checkbox and shows the refusal, moves the focus to it and stays on the step; another template or country clears the tick |

### Settings tabs

The tabs of Settings and the save of the Plan, Coins & split and Hold & sell tabs (`docs/DOMAIN.md` §6 "Edit the plan").

| Moment | Copy |
|---|---|
| The tabs | Tab list `Settings`: `Plan` (the amount-and-dates editor), `Coins & split` (the coin editor), `Hold & sell` (the holding rule and sell-window editors), `Currency & data` |
| No plan (Plan, Coins & split, Hold & sell) | the no-plan empty state, as on Today; its `import a file` opens `Currency & data` |
| Ended plan (Plan tab) | under Last buy, describing it: `Buying ended on 15 Oct 2026. Saving a later last buy adds buy days again.` (never "starts buying again": the app places no order, ADR-0039) |
| Save | Button `Save changes` under the editor |
| Saved | Toast (8 s) `Changes saved.` |
| A refusal no field on the tab can show (the change conflicts with a part of the plan another Settings tab edits) | `Not saved: this change conflicts with another part of your plan.` under the editor |
| Another browser tab changed a field this save sends, between the read and the save | `Your plan changed in another browser tab, so this change was not saved. The form now shows the saved plan; make your change again.` under the editor |
| Hold & sell | Radio group `Holding rule`: the card titled by its country, `Portugal's rule` (`The general profile's rule` for the generic profile, `Your country's rule` while the rules are not loaded; the country code as its badge; `365 days, then tax-free.`, and above the cards the country's date line in the forms of `docs/LEGAL.md` §4, `Sources` linking the source of the rule in the country profile, opened outside the app; the rule in words and `Sources` show together once the source's URL is known, and until then, or for good when the profile does not load, the card shows its title alone and the date line ends after `not advice`; a card under review (`docs/JURISDICTIONS.md` §1) likewise shows its title alone, with the under-review date line and no `Sources`; for a country with no reviewed rule, the generic profile's own status and holding-rule text in place of the rule (its `card.classification` and `card.holdingRuleText`, `packages/content/jurisdictions/xx.json`), the generic date line, and no `Sources` (`docs/JURISDICTIONS.md` §"Generic profile `XX`" says why); without the rules on the device `Your country's rule is not loaded on this device.`, and the card is disabled) and `Your own rule` (`It applies to every purchase, whatever its date.`); an own rule shows `Rule` (`No holding rule`, `A number of days`, `A number of years`), `Days` or `Years`, and `After the period` (`Tax-free`, `Long-term rate`); refusals under their field: `Enter a whole number of days.`, `Enter from 1 to 36,500 days.`, `Enter from 1 to 100 years.`, `Your country's rule is not loaded on this device. Choose your own rule.`. Then radio group `Sell window`: `No sell window` (`Your plan buys, then holds.`) and `A sell window` (`Your plan sells in 3 parts between the opening and closing dates, out by the last.`), which shows `Opens`, `Closes` and `Out by`; refusals under their date: `Choose a full date: day, month, and year.`, `Choose a closing date on or after the opening date.`, `Choose an out-by date on or after the closing date.`. A rule or window that opens the sell window before the last buy passes the rule shows, under the dates, the notice and checkbox of the Plan tab's last buy with `Your last buy`, `a later opening date` and `before your last buy passes the holding rule`; a change of the rule or a date clears the tick, and the rule and dates the saved plan already accepted show neither; a refused `Holding rule` group gives its chosen card the negative boundary; without a plan, the no-plan empty state |
| Change country (`Currency & data`, above `Your data`; `docs/DOMAIN.md` §6 "Change country") | Heading `Country`, the line `The country you live in sets the plan's holding rule, the currency for new amounts, and how numbers and dates are written.`, and, while the plan's currency differs from its country's, the line `Your plan is in EUR, and your country's currency is GBP. If your amounts were paid in GBP, change the plan to GBP. Every amount then shows as GBP, as typed; nothing is converted.` with the button `Change to GBP` (`docs/DOMAIN.md` §6 "Change pay currency"; done: the result line `Plan currency changed to GBP.`, which takes the focus), then the select `Country` with the profiles by name, `Other country` last; choosing another lists under `Changing to Germany:` each change: `Country: Portugal to Germany` and for the holding rule `Holding rule now: Portugal's rule. 365 days, then tax-free.` and `After the change: Germany's rule. 1 year, then tax-free.`, each rule its own row, each country's rule followed by its card's date line as Hold & sell shows it (`docs/LEGAL.md` §4; none under the person's own rule), and while a country's source is unknown (its profile does not load) or its card is under review its rule by name alone, without its words, as on Hold & sell; the plan's rule named `your own rule`, `Portugal's rule` or `the general profile's rule`, whose words are the generic profile's own holding-rule text, never `No holding rule.`; when the plan follows the country's rule both before and after, neither rule is `No holding rule` nor the generic profile's, and the day the last buy passes the rule moves with the same effect, the row `Last buy tax-free from 29 Oct 2025 now, from 30 Oct 2025 after the change` (`Last buy at the long-term rate` for a lower rate) with `Computed from your dates, not tax advice` once under it, then the profile's first condition and `Show 3 more conditions` (`Show 1 more condition`) while it has others; the notice below then leaves out the note and the conditions; the currency rows (`Currency for new amounts: EUR to USD`, `Currency shown: EUR to USD`) appear only when the currency moves, each with a row for the plan's own amounts that are not zero (`Monthly amount: €300 becomes $300. Check it in Plan.`, `Starting amount: …`; the amount after in the new country's number format, as Plan shows it after the change), in the list when no question is asked and otherwise under the question's one-currency line, next to the cards; then, when no logged amount would change meaning, with any logged entry, `Amounts you already logged stay as typed; nothing is converted.`, and, when a logged amount would change meaning, the currency question (ADR-0053): `3 logged entries, from 5 Jan 2026 to 5 Mar 2026, hold amounts or fees in EUR. Which currency were they paid in?` (`1 logged entry, on 5 Jan 2026, holds an amount or a fee in EUR. Which currency was it paid in?`), two cards with nothing chosen, `Keep EUR` (`If you moved: they were paid in EUR, and new amounts are logged in EUR too.`; with one entry `it was paid in EUR`) and `Change to GBP` (`If the country was wrong from the start: they were paid in GBP. They show as GBP, as typed; nothing is converted.`; with one entry `it was paid in GBP. It shows as GBP`), under them `A plan holds one currency. To pay in GBP from now on, keep EUR, export a copy, and start a new plan in GBP.`, refused without an answer as `Choose Keep EUR or Change to GBP.`; a holding rule that changes asks for the checkbox `Replace Portugal's rule with Germany's rule`, refused without it as `Tick the box to replace the holding rule.`; a sell window the new rule opens early shows the Hold & sell notice and checkbox, the rule named by its country (`under Germany's rule`); with any logged entry, above the button, `Tax-year files follow your current country's rules until you change country. Export the years you need first.` with Your data's export line and the tax-year select and button; button `Change country to Germany`; done: the result line at the end of the Country form, in the body size, `Country changed to Germany.`, which takes the focus; another tab's change: the Settings sentence above, and the list then shows the change from the plan as stored with every box unticked, or, when that plan is already in the chosen country, closes with the select on it and, in place of that sentence, the result line `Your plan was changed to Germany in another browser tab.`, which takes the focus; a change the core refuses (an invariant the new currency or rule breaks), above the button and taking the focus: `Not saved: this change conflicts with another part of your plan. Check Plan and Hold & sell, then change the country again.`; without any profile on the device `The country profiles are not loaded on this device.` and no select; without the plan's country's profile, `Your country's rule is not loaded on this device. Reload the page when you are online to change the country.` and no select |
| Language (below the tabs, above About, only when the build offers two languages; ADR-0023) | Heading `Language`, the line `The app reloads in the language you choose.`, which describes the select, then the select `Language` with each language named in itself and marked with its own language: `English` · `Português (Portugal)`; choosing another reloads the app in it |
| About (below the tabs, on every tab, with or without a plan; `docs/LEGAL.md` §5) | Heading `About`; the site line `Data and tools, not advice. Crypto-assets can lose all their value.` with the link `Risk disclosure`; under it, navigation `Legal information`: `Terms of use` · `Privacy notice` · `Cookie-free statement` · `Contact`, each the title of its site page |

## 4. Numbers and dates in copy

Per `docs/DESIGN.md` §5: numbers are formatted by the country's locale and dates by the UI language
(ADR-0023), never hand-built. Every percentage on a
page takes the spacing of the country's number locale, as `format.percent` writes it: `70%` in
Portugal, `40 %` with a no-break space in Germany. Research figures in messages go through
`format.percent`, and a country profile writes its literal percentages with its own locale's joiner,
which `pnpm validate:content` checks, so the sign never wraps away from its number. A profile's
literal percentage also takes the decimal separator of the profile's number locale in the page's
language, `numberLocaleFor(language, profile)` in `packages/content/src/loaders/locales.ts`, in its
English text too, written once in the content string that the app and the site pages both show:
`12,2%` for Portugal, `5,5 %` for Germany, `12.2%` for Britain (decided
2026-11-16). `pnpm validate:content` refuses any other separator in a profile's percentage or in
a translated profile's (`decimal-separator`). A percentage range is two figures joined by an
unspaced en dash or hyphen, and both are percentages, the one without the sign too: `12,2–48%`. A
range with `to` writes the sign on each figure: `2,5% to 13,3%`. A figure that is not a percentage
keeps its point, as a law citation does (`art. 33.1`, `Quadro 9.4`). Write it apart from a
percentage beside it, with a word or a spaced dash between them (`art. 33.1 sets 28%`,
`art. 33.1 – 28%`), never joined by a hyphen or by `to` (`art. 33.1-28%` and `art. 33.1 to 28%`
read as a range). On the pages of Germany, Spain, France, Italy, the Netherlands, and Portugal, a
profile's figure of 10 000 or more groups its digits in threes with a no-break space (U+00A0,
`\u00a0` in JSON): `EUR 59 357`. A smaller one takes none: `EUR 1000`. Both hold in English
and in each translation. A decimal in a profile's text there takes the comma, and a point in
it is only a citation's. An identifier keeps its digits plain (`PIV 28969`).

On every page, a currency code and its figure (`EUR 20 350`, `100 USD`) and a form's name and its
number (`Modelo 721`, `Anexo G`, `Formulaire 2086`, `Form 1040`, `Box 3`, `Quadro 9.4`) are joined
by U+00A0 too, so that a line never ends on the code or the name. This holds in English, in each
translation, and in a module. A JSON file writes the space as `\u00a0`, a module as the character
itself (decided 2026-11-17). `pnpm validate:content` refuses a code's or a form's join that is not
U+00A0 in a profile or a translated one (`figure-join`).

In an English profile the same U+00A0 joins a law's name and its number (`§ 23`, `art. 46`,
`section 104`, `no. 3`, `n° 2026-534`, `Lei 24‑D/2022`, `Bill 2026`) and a date's parts
(`31 July 2027`, `1 April`, `May 2026`), so that none of them ends a line half way. An en dash or
a hyphen-minus between two digits takes a word joiner after it (U+2060, `\u2060` in JSON), in a
range (`2023–2025`, `0–45 %`, `2026-27`) and in a number (`Notice 2023-27`, `Part 02-01-03`),
since Chromium and WebKit both break a line after either sign. A hyphen beside a letter
(`COVID-19`, `e-money`) stays as it is (S4, decided 2026-11-17, in place of the earlier reading
that a hyphen-minus between digits never breaks). A point after a letter ends an abbreviation, so
a dash or hyphen between the figures after it takes the joiner as well (`s.104-105`,
`Rev.Proc.2025-32`, decided 2026-11-18). A hyphen-minus inside a law number takes the joiner too
(`Lei 24-⁠D/2022`, `9-⁠bis`), or, outside a source's title, the text writes U+2011 there
(`9‑bis`). The hyphen before a
Latin ordinal suffix after a number or a single letter takes the same, with or without a law name
before it (`Form 3916‑bis`, `lett. c‑sexies`); the suffixes are a closed list, `bis`, `ter`,
`quater`, `quinquies`, `sexies`, `septies`, `octies`, `novies` and `decies` (decided 2026-11-18).
`pnpm validate:content` refuses a name's or a date's join that is not U+00A0 (`figure-join`) and
a dash or hyphen with no joiner after it (`range-join`).

A figure and its unit are joined by U+00A0 as well (`365 days`, `5 anos`): the units are a closed
list, `day`, `week`, `month` and `year` with their plurals in English, and `dia`, `semana`, `mês`,
`ano` with their plurals in pt-PT. Every text of a language with lists is read with every
language's units, since an English card quotes its country's law in that law's language
(`365 dias` in Portugal's English card, decided 2026-11-18). `Suplemento` is checked only after an ordinal figure, as an
ordinal and its noun (`2.º Suplemento`, §9). A word counted after a figure (`6 escalões`,
`3 states`) is not a unit, so it stays unchecked, except in a Learn module, where R6 checks B's
count and R7 a count before a listed noun (below). A citation's brackets take U+2060
between them (`55(1)(d)`, `1.1012-1(j)(3)(ii)`), and nothing between the number and its first
bracket, which neither engine breaks. A probe at 161 widths from 240 to 400 px found each pair split
at a line end in Chromium or WebKit, and none once joined (#368, decided 2026-11-18).
`pnpm validate:content` refuses a unit's join that is not U+00A0 (`figure-join`) and a citation with
no joiner between its brackets (`citation-join`).

The five U+00A0 joins above are read the same way: a code and its figure, a form's name and its
number, a law's name and its number, a date's parts, and a figure and its unit.
`pnpm validate:content` reads the run between the two parts with R7's gap class (below): JS white
space (`\s`), format characters (`\p{Cf}`), control characters (`\p{Cc}`) and default-ignorable
code points (`\p{Default_Ignorable_Code_Point}`). It refuses the run unless it is one U+00A0 alone.
A lone U+2060 is refused, and so is U+00A0 beside any other character of the run. Beside an
ordinary space, a line can still break at that space (decided 2026-11-18).

When any other character sits between the two parts, they are not a join, so they stay unchecked.
A part that two pairs share is read in both (`EUR 100 USD`), whether the first pair's run is
refused or not. The detail names the pair and each character of the run in order
(`U+00A0 U+0020`), never a text to write.

In a Learn module, B's count joins its noun with U+00A0 (`had 4 falls`, `teve 4 quedas`, R5 and
§9), written as the character itself. A probe ran the chart section's paragraph in the Learn sheet's
own styles at 161 widths from 240 to 400 px in Chromium and WebKit. With U+0020, `had 4` split from
`falls` at 34 widths at 125 % zoom and none at 100 %, and `teve 4` split from `quedas` at 7 widths at
100 % and 68 at 125 % zoom. With U+00A0 nothing split (comment 6971015219 on #370, decided
2026-11-18). The page drops a default-ignorable code point between the count and its noun. R5's
hidden-character rule refuses that paragraph before B reads the gap. Between the count and its noun,
B reads a gap made of JS white space (`\s`), format characters (`\p{Cf}`) or control characters
(`\p{Cc}`). That is the class the five joins above read without the default-ignorable marks, letters
and unassigned code points (U+FE0F, U+3164, U+2065). `pnpm validate:content` refuses a sentence that
matches B with any such gap other than one U+00A0 (`figure-join`, R6). Any other character the page
keeps between the count and its noun makes the sentence match neither shape (`figure-chart`, R5).

R7: in a Learn module, a count before a listed noun is joined to it by exactly one U+00A0 (`6 inputs`,
`95 países`), written as the character itself, so that no line ends between them. `moduleCountProblems` in
`packages/content/src/module-counts.ts` reads it, and `packages/content/scripts/closed-body.ts` runs it in
`pnpm validate:content` on every English and pt-PT module that compiles. It reads the front matter's title, idea
and caveat as written, and every block of the compiled page that holds text, including a heading, a paragraph in
a list item or a quote, and a code block (`packages/config/vite/page-blocks.ts`). It reads an ordered list
item's first block after the number the page shows (`3. `). It reads each block as the parser decoded it,
before the page drops its default-ignorable code points (`written`), so in the body a character reference counts
as the character it stands for (`&#x200B;`). R7 reads a default-ignorable code point
(`\p{Default_Ignorable_Code_Point}`: a soft hyphen, a zero-width space or a variation selector among them) as
part of the gap between a count and its noun, as nothing between two digits of a count or two letters of a noun,
and never as a letter, mark or number beside either. A count is a run of number characters (`\p{N}`) that no
letter, mark or number character touches, its groups split by a comma, a dot or U+00A0 (`750,000`, `210 000`).
A default-ignorable code point inside a count is refused (`figure-join`) even when the gap is one U+00A0, since
a zero-width space or a soft hyphen lets a line end there. The fix deletes it. Such a count is never read as a
year. Four ASCII digits from 1900 to 2099 with no group separator are a year (`the 2017 and 2021 cycles`) and
stay unread, so a count written like a year (`2016 blocks`) is not read either. Between the count and its noun
R7 reads B's gap, the class in `packages/content/src/module-figures.ts`, and every default-ignorable code point:
a run of JS white space (`\s`), format characters (`\p{Cf}`), control characters (`\p{Cc}`) or default-ignorable
code points. It refuses any such gap other than one U+00A0 (`figure-join`), U+00A0 beside a default-ignorable
code point included (`U+00A0 U+200B`). The fix replaces the whole gap, any hidden code point in it included,
with one U+00A0. The detail quotes the count, the noun and the gap as written and names the gap by its code
points. It quotes each run of spaces, tabs, line feeds, carriage returns or form feeds in the noun as one space
(`pageSpaces` in `packages/content/src/paragraphs.ts`), and names each other hidden or look-alike character
in the count or the noun by its code point, as `printedText` in `packages/content/src/percent-gap.ts` prints it
(`6U+FE0F 0`, `dataU+2009 points`, `inU+00AD puts`). Any other character between the two, a hyphen or a word,
leaves the pair unread. A noun matches whole and in any case, with no letter, mark or number character after it;
a space inside one (`data points`) matches any run of white space. So a default-ignorable code point between a
word and the count or the noun separates them, and R7 reads the pair. It does not read R5's `ignorable` mark,
which only a paragraph carries and which names no place (decided 2026-11-18, #387). The lists are closed, one
per language, and hold the nouns of the counts a census of the modules found (16 of them could end a line apart
from their noun): in English `blocks`, `data points`, `inputs`, `components`, `indexes`, `bitcoins`, `episodes`,
`start months`, `countries`, `completed cycles`, `cycles`, `parts` and `signs`, and in pt-PT the nine §9 names.
B's noun (`falls`, `quedas`) is on neither list: R6 reads it. A count before any other noun stays unread. A
probe joined the 28 counts the English (15) and pt-PT (13) modules write before these nouns by U+00A0. At 161
widths from 240 to 400 px, at 100 % and 125 % zoom, in Chromium and WebKit, none split and none overflowed
(decided 2026-11-18).

U+00A0 joins a figure to its unit, a name to its number, an ordinal to its noun, B's count and R7's
count to their nouns, and a date's parts; U+2060 goes only after a dash or a hyphen and between a citation's brackets; U+2011 replaces the
hyphen inside a law number in text a screen shows, except in a source's title (below):
`9‑bis`. U+202F is never typed
by hand: it is the percent sign's joiner in a locale that has one (the percent paragraphs below).

The names are a closed list per language in `packages/content/src/join-validate.ts`, taken from
every profile's text and its sources' titles; a law number may be a roman numeral (`Série I`). A
docket (`IX R 3/22`), a form's cell (`colonna 12`), a letter after its name (`lett. c`), and a word
the list leaves out stay unchecked. Left out as well: the month-first US order (`April 15`); the
file-only lot note; the modules and the facts; and a translation until its language has its lists
(decided 2026-11-17). A URL in the text stays unchecked too, since its figures belong to its path,
as in the percent and grouping checks (decided 2026-11-18). `pnpm validate:content` checks the text
on each side of a URL on its own, so it reads no join across it.

A source's title is read for joins in its own language, from its `lang`: `en` as English, `pt` as
pt-PT, and `es`, `fr` and `it` with lists that `titleJoinProblems` in
`packages/content/src/join-validate.ts` takes from that language's titles alone, without English's
names. Spanish's names are `Ley`, `Real Decreto`, `Orden` and `art.`, its months with the linker
`de` (`25 de marzo`). French's are `LOI n°` and `article`, its months with no linker
(`25 juin 2026`). Italian's are `Legge`, `n.`, `art.` and `fascicolo`, its months with no linker
(`22 dicembre 1986`). None of the three lists adds a unit: like every text of a language with lists
(above), their titles are read with every language's units. An `nl` title is read for the
code and form joins only, since its titles hold no name, date or unit. A title in any other
language (`de`) stays unchecked for joins until it has its lists (#381, decided 2026-11-18), though
U+2011 is refused in every title. A source title's words stay as published, so the ban list and
`number-unit-hyphen` stay off it, and a translation cannot change it (#368, decided 2026-11-18).
The joins check reads the whole title, its hyphen rules included (`range-join` asks for U+2060
after an en dash or a hyphen-minus between two figures, and after a hyphen-minus in a law number or
before a Latin ordinal suffix). `pnpm validate:content` refuses U+2011 in any title (`range-join`,
decided 2026-11-18): a title keeps the published U+002D, with U+2060 after it where `range-join`
asks for one. A pending change's source is not shown and stays unchecked.

`pnpm validate:content` refuses other grouping beside a currency code (`number-group`). It reads
each figure as English does (a comma or a space between groups, a point before the decimals) and
as the page does (a point or a space between groups, a comma before the decimals); a group is three
digits after a first group of 1 to 999, with one kind of mark between groups. A figure with one
value in both readings, or a reading in only one, is suggested in the page's form with that value:
`EUR 12.50` becomes `EUR 12,50`, `EUR 1,234.56` becomes `EUR 1234,56`. A figure the two read as
different values (`EUR 20,350`, `EUR 1.125`), one neither reads (`EUR 1,23.456`) and a range not
already in the page's form (`0.125–1.125 EUR`) are refused with this rule and no suggestion: write
them by hand, and give an amount of 1 to 999 a fourth decimal where it has three (`EUR 1,1250`).
A translation copies English's figure as written; where its figure differs, `overlay-number-mismatch`
names both texts' figures as written and no fix (decided 2026-11-17).
Britain, Ireland, and the US keep their locale's grouping (`£37,700`) (decided 2026-11-16). A figure the app
formats follows its locale (`1.234` in Germany); only a profile's literal figures group as above.
Facts and modules write `N %` with an ordinary space, or with a no-break space where the sign must not wrap
away; a template's explanation takes only the token below. When a page shows a fact's, template's or module's
percentage beside a formatted figure, that percentage takes the page's joiner. A module without a chart keeps
its spacing as written. The tax module is the exception: its country card shows the profile's percentages, so
its text takes the page's joiner, on the route and in the sheet. A sheet is the module's surface, not the
page's, so a module opened in a sheet keeps its own spacing beside the page's figures, as the Cycles sheet
over Plan does. A page with formatted figures shows
no `N %` with an ordinary space: a template's `oneLine` holds no percentage, the card builds its
split line from `split`, and the app formats a research figure such as an explanation's; the
acknowledged plan-creation text is quoted as versioned (`docs/LEGAL.md` §4). Signed values carry
their sign; multiples with `×`; ranges with an en dash in tables and "to" in prose; dates with the
year in records and in anything that can change; ISO 8601 in exports; times with the zone when they
matter. In English prose, numerals for everything including 2 to 9; `%` always with a numeral.
The acknowledged plan-creation text keeps "four times" at its wording version 1, quoted as versioned as
its percent spacing is: changing a word would ask every plan to acknowledge again, so there is no
version bump for it. The next change of substance to that text writes "4 times"; a translation keeps
version 1 and follows its own language's number style (decided 2026-11-15).
A count in copy (entries, purchases, the import's result lines, the replace and delete titles) is a
figure in the country's number format, `1234` in Portugal (`12 345` from five digits) and `1.234` in Germany: a plural picks its
form from the count and writes the formatted figure, never ICU's `#`, which follows the language.
A formatted date never breaks across lines: `lib/format` joins its parts with no-break spaces (U+00A0),
and the onboarding summary and a template card's split line join each coin to its share the same way (`BTC 70%`). Short months are the
locale's own, so en-GB writes `1 Sept 2029` beside `31 Aug 2030`; copy quotes them as formatted, never
shortened by hand.
A template's `oneLine` and explanation write no date: each is a placeholder `{date:<field>}` that names one of the
template's own date fields (`lastBuy`, `validUntil`, `sellWindow.opens`, `references.peakFrom`,
`drawdowns.BTC.high`; the list is `docs/DOMAIN.md` §5), and the onboarding writes it with `format.date`, unbroken.
The UI language decides its format, never the plan's country, as for every date in copy (ADR-0023). In English that
is `1 Jun 2028` for a plan in Portugal, Britain, or the US (decided 2026-11-15, corrected 2026-11-16). `pnpm validate:content`
refuses a placeholder that names no date of its template or is not whole (`template-date-unresolved`) and one in any
other field (`template-date-field`). It also refuses a month name in English, Portuguese or German in any of a
template's texts or in their translations, a short one only beside a figure (`template-date-month`).
A template's English explanation writes a percentage or a drawdown date only in one of six closed shapes. Each shape
is a whole sentence, capitals as written, and may open with the fixed lead `What can go wrong: `. In them `N` is 1 to 3
digits, an ordinary space and `%`, the one token the app formats, and a fall's may start with U+2212; `C` is one of the
template's coin names; `A` is `each amount` or `every amount`, either with `monthly` before `amount`; `D(X)` is
`from its high on {date:drawdowns.X.high} to its low on {date:drawdowns.X.low}`, one row X both times. An explanation,
English or translated, writes no other joiner (nothing, U+00A0, U+202F, a hyphen) and no other sign (`percent-token`).
The check reads it as `paragraphsOf` does, so a tab, two spaces or a line break before the sign is one ordinary space.
The check and the app read the token from `packages/content/src/percent-token.ts`.

- F1: `C fell N D(X).`, with `more than N` in place of `N` allowed. A fall names its coin, never `It`.
- F2: `From its high on {date:drawdowns.X.high} to its low on {date:drawdowns.X.low}, C fell N.`, with `more than N`
  allowed.
- S1: `N of A goes into C.` S2: `C: N of A.` S3: `C takes N of A.`, then any number of `; N goes into C` before the
  stop.
- S4: `It splits A N C, N C, and N C.`, with any number of `, N C` and the serial comma before `and`; two coins read
  `It splits A N C and N C.`

R1: a sentence that holds a drawdown date is a dated fall and matches F1 or F2 (`figure-form`). R2: a dated fall names
its row's coin and states the row's fall or a bound below it written `more than N %` (`figure-form` for another coin,
`figure-mismatch` for another figure). A bound sits below the row's fall because the row's whole percent may round up:
77.6 % shows as 78 %. R3: any other percentage is a coin's share in S1 to S4, each coin named once with its share of the
split (`figure-form` for a coin named twice, `figure-mismatch` for another figure). R4: any other percentage fails,
whatever words surround it (`figure-unclassed`). A percentage is one of the signs `%`, `٪`, `﹪`, or `％`, or "per" and
"cent" at the start of a word or right after a digit, joined by nothing, any space, or a hyphen, in any case, with
nothing required after "cent": percent, per cent, percentage, percentile, and the like all count. The check reads the
whole explanation, so a line or paragraph break between the two words counts as a space. A new wording needs a new
reviewed shape (decided 2026-11-17). The shapes accept only the past tense `fell`. The copy review (`docs/LEGAL.md` §6
Q6) catches a projection with no percentage and no drawdown date, such as "Solana could fall that far again".

R5: a Learn module's chart section runs from the heading before `<Chart />`, or the page's start, to the next heading,
on the page the build's compiler gives (`packages/content/src/module-figures.ts`). A sentence there that holds a
number character, a percentage (as R4 defines it, or the sign `‰` or `‱`), a number word, a month, a currency sign,
or the name of a coin the chart draws matches one of two shapes as a whole: B,
`In the chart, C had K falls of more than N between Y and Y.` with `1 fall` for one, or E,
`C fell L.` or `C fell L`, then any number of `, C L`, then `, and C L.`. In them `N` is a whole number from 1 to 100,
one ordinary or no-break space and `%`; `K` is 1 to 99, joined to its noun by U+00A0 (R6);
`Y` is a year of four digits; `L` is `N`, `N and N`, or two or
more `N` joined by `, ` with `, and ` before the last; `C` is a catalogue coin's name, as written or with its first
letter in lower case, or `Ether` or `ether` for ETH, never a ticker. Every other gap is one space. A number word is a
cardinal, an ordinal, or a word such as `once`, `half`, `double`, or `couple`; a month is its name or short form, with
`May`, `March`, and `Mar` counted only when capitalised; a coin the chart draws counts by its name in any case, `ether`
for ETH, or its ticker as written. Anything else fails (`figure-chart`). So does a code block in the section, a heading
there that holds one of them, a figure joined to a sign (`%`, `٪`, `﹪`, `％`, `‰`, or `‱`) unless one ordinary or
no-break space joins it to `%`, and a paragraph that holds one of them beside emphasis, strong text, a code span, a
hard break, a text element, or a hidden character (one the page does not show).

E states each coin's falls in the chart's order, oldest high first. Each `N` is the row's whole fall, and the falls
a B counts are left out. A coin the chart draws no fall of fails (`figure-chart`). The section states every row: a coin
gets one `figure-unstated` when no sentence there states one of its rows. A sentence outside the shapes states none.

R6: B counts C's falls of more than `N`, strictly, whose high is in the first `Y` or later and whose low is in the last
`Y` or earlier. There are `K` of them and at least one, the first high is in the first `Y`, and the last low is in the
last `Y` (`figure-chart`). The page drops a default-ignorable code point between `K` and its noun. R5's
hidden-character rule refuses that paragraph before B reads the gap (`figure-chart`). B reads the sentence as
`paragraphsOf` gives it: two line feeds with only spaces, tabs, carriage returns or form feeds between them end the
paragraph, and any other run of `[ \t\n\r\f]` becomes one U+0020. Between `K` and its noun, B reads a gap of JS white
space (`\s`), format characters (`\p{Cf}`) or control characters (`\p{Cc}`). A sentence that matches B with any such
gap other than one U+00A0 fails (`figure-join`). The detail names the gap as B reads it, by its code points, so a tab
there is U+0020. The fix is one U+00A0 in its place (decided 2026-11-18). Any other character the page keeps between
`K` and its noun makes the sentence match neither shape (R5, `figure-chart`). A detail's quote shows that U+00A0 as
written, as it shows a joiner before `%`.

Each detail quotes the sentence and names its own figure and rule, never a row or a count to copy (decided
2026-11-17). In a translation the section is closed: each sentence and heading there is its language's B or E (§9) or
one its language's list holds, character for character; a language without shapes fails closed. The section holds only
top-level paragraphs and headings and the chart (decided 2026-11-18). A block in a list item, a quote or an element,
and any other element, fails, since the page shows a list item's number (`1975. Text.`) that no sentence holds. The
section ends only at a top-level heading. An unlisted sentence's detail names B or E, or a listing in a reviewed pull
request; an unlisted heading's names the listing or its removal. In a translation whose language has shapes, a
sentence refused for a trigger above names B or E (§9), since no listing passes it; an empty list item's detail says
to remove the list marker (decided 2026-11-18).
A chart other than `drawdowns-bar` has no rows, so any figure in its section fails.

A numeral joined to its unit by a hyphen (`90‑day`, `365‑day`) never breaks there. Text a screen shows writes the
no-break hyphen U+2011 between them (`\u2011` in a JSON string, the character itself in a module): messages, modules
(title, idea, caveat and body), every profile text the app shows, a template's name, one-line summary, risk label
and explanation, and a coin's name in the catalogue; `pnpm validate:content` refuses an ordinary
hyphen there (`number-unit-hyphen`). Text only a downloaded file carries keeps U+002D and the ordinary space U+0020
beside a code or a form's name, since a file does not wrap and its reader searches it as typed. These are the
tax-year file's lines (the `settings` messages under `data.taxYear.file`) and a profile's `lotRuleNote`, which
`figure-join` skips (decided 2026-11-17). A holding condition shows on screens and the file copies it as written, so it takes U+2011.
Facts and documents keep U+002D, and a document quotes copy with it.
A law's number takes U+2011 between its digits and its letter in text shown on screen (`Lei 24‑D/2022`), so it
does not break at the hyphen. A source's title keeps U+002D, as the source writes it, with U+2060 after it inside
a law number (`Lei 24-⁠D/2022` in JSON, #368).

## 5. Education modules

One idea per module, under 400 words of body text (the content test fails above), one chart only
where it earns its place, one caveat in its own box, a reading time (`ceil(words ÷ 230 + charts ÷ 6)`
whole minutes: 10 seconds per chart added before rounding up, counted on body text; Brysbaert 2019
puts adult non-fiction reading at about 238 wpm, so the estimate errs long for second-language readers;
the reading time counts the module's own text, not the country card that leads the tax module), and
`Last reviewed <date>` under the title, which the tax module extends to `Last reviewed <date> · Next
review due <date>`, each phrase after the `·` kept on one line. From the day after `nextReviewDue` a module is past due: its line reads `Last
reviewed <date> · review overdue`, with `review overdue` in ink, on the route and in the sheet, and
the tax module adds `Rules may have changed since <date>. Check your tax authority before
filing.` on its own line, `<date>` the module's last-reviewed date as the line above formats it,
since the country card below carries a date of its own (the build fails when a module is more than
18 months old). Every statistic cites a fact key from `packages/content/facts` with a date. The structure and the 7 modules: `docs/EDUCATION.md`.

Phrasing of history: always a window with its dates and source ("every 4-year monthly plan in
our data, 118 start months from January 2013 to October 2022, Bitstamp prices, no fees, ended above
cost; the worst at 1.37×"), never "never loses" or "always", because the 5-year windows did go
negative in December 2022 and January 2023. "Pattern" only with "not". The regulator counterweight
(BIS Working Paper 1049, fact `r.app-user-losses`) sits in the same module as any favourable
statistic.

## 6. Templates

Named for their structure, not their promise; the risk label is the first thing shown; the
explanation says who picks it and what goes wrong (the Cycle plan's first sentence says it encodes a
forecast about 2029 that may not come true); no imperative about buying, holding or selling in a name ("no sell window",
not "never sell" or "accumulate"); never "conservative", "recommended", "balanced", "safe" or
"default portfolio", which read as a claim about safety or suitability. On Plan's timeline a
template's cycle high reads `Cycle high {source} assumes`, naming its source, and the forecast
sentence ("may not come true") stays where the plan is chosen (2026-10-29): in the explanation and,
for a reader who never opens its control, in the Cycle plan's `oneLine`, as its second sentence
(2026-10-30).
The explanation sits behind one closed control for the picked template, because shown by default
each explanation (76 to 192 words) would break the 120-word budget of `docs/LEGAL.md` §4.
Every date a template's text names comes from a field of that template, written `{date:<field>}` (§4), so a date in
the text and the plan it starts never disagree, and each date is written in the UI language's format (§4; ADR-0023;
decided 2026-11-15, corrected 2026-11-16). A
date the text needs that no plan holds (the Cycle plan's second and last thirds) is a text-only field of `references`.

## 7. Emails

Minimal by design (ADR-0026): the sign-in code and the click-to-confirm link; the reminder says it is
the buy day and links to Today; no amounts, no coin names, no market words; no disclosure sentence
(`docs/LEGAL.md` §4: there is nothing in the email to disclaim); reminders carry the one-click
unsubscribe header; nothing is ever sent that was not asked for.

## 8. The copy review (the gate before release)

1. Run the banned-words lint; zero findings, allow-list entries justified.
2. Read every new string aloud once; cut filler; one idea per sentence.
3. Every number has a unit and a date; every date has a year.
4. Buttons are verbs; errors name the fix; nothing says "we" in an error.
5. No sentence tells anyone what, when or where to buy, hold or sell; templates and reminders are
   mechanical. Read by hand what the lint passes (§2), such as a sentence with `{sold}`, `{fee}`,
   `{log}` or `{file}` filled with units, a sentence whose verb opens an ICU branch, and, in English
   and German, a sentence whose verb does not open it.
6. No exclamation marks, emoji, interjections, "please", "easy", "just".
7. Risk warnings are where `docs/LEGAL.md` §4 puts them and read as sentences, not as footers.
8. History is dated and windowed; forecasts are absent; "past performance" line present where
   required.
9. German and Portuguese strings reviewed by a native reader for the same rules (from M2, before
   the launch; ADR-0041). The read, decided on 2026-11-23 on the owner's delegation of 2026-11-18
   (not the owner's own review or signature): one native reader per language, who lives or grew up
   in the country of the variant. The reader gets one capture of every screen and the list of named
   questions (#414 for pt-PT), with a page that states the register and what is fixed (§9). Every
   answer that is applied passes the banned-words lint, brand's read and, for a legal or risk text,
   counsel's read. A changed term is recorded in §9 for pt-PT and in German's own section, which
   the first German change adds. German's first strings (Today, the shell, the errors and one Plan key;
   2026-11-23, #419) exist and stay hidden until the native reader's read.
10. Template names signed off by the owner.
11. The balance step, for every new or moved disclosure (ADR-0047): what decision does this line
    protect; is a warning already on this path (then it is a repeat and goes); one competitor
    comparison from `docs/BENCHMARK.md` §1 (who does this best, in how many words); the screen is
    within the budgets of `docs/LEGAL.md` §4. What a disclosure is and what is a status instead:
    `docs/LEGAL.md` §4.

The three recurring failures of the benchmark, checked per screen by the brand role
(`docs/BENCHMARK.md` §3):

| Failure | Found at | The check |
|---|---|---|
| A hindsight profit figure without a label | Relai's blog, Swan's homepage, dcaBTC | every historic or simulated figure carries its dates, its source and the past-performance line where `docs/LEGAL.md` §4 places it |
| A warning repeated on one path | Bitpanda's nine sentences, Kraken's block | at most one disclosure per decision point; none elsewhere on the path |
| A rule stated without a computed date or a source and last-checked date | marketing pages that omit the rule; FAQs without a date | a holding rule shows the computed date; a card shows its reviewed date and sources |

## 9. Portuguese (pt-PT)

The ten rules of §1 and the ban list of §2 hold in Portuguese; this section adds what the language
needs (decided 2026-11-15). The native reader's review is §8 item 9.

- **European Portuguese, AO1990 spelling.** `ação`, `receção`, `ótimo`, `direção`; `facto` and
  `contacto` keep their pt-PT form. Months and weekdays in lower case: `1 de março de 2027`.
- **Formal address in third-person verb forms, without the pronoun "você".** `Pode alterar isto a
  qualquer momento`, `Escolha uma data a partir da primeira compra`; never `Você pode` (the lint
  refuses `você`), never `tu`. The possessive (`o seu`, `a sua`) only where it removes doubt:
  `o plano` and `os movimentos`, never `o seu plano`; `a sua chave privada`, where whose key it is
  matters.
- **Buttons, labels and headings in the infinitive or an impersonal form**, the pt-PT app convention:
  `Guardar`, `Registar compra`, `Exportar registo CSV`, `Saltar outubro`. A change of the form of
  address then touches only the sentences, not the controls. A link that ends a sentence takes the
  sentence's imperative (`Exporte uma cópia.`); a standalone control takes the infinitive
  (`Exportar cópia`).
- **§3's participle buttons keep the participle**, which says what is recorded: `Bought as planned`
  is `Comprado como planeado`, `Bought a different amount` is `Comprado outro montante`.
- **A control named inside a sentence stands in guillemets**, as the control shows it, its placeholders
  included: `escolha «Adicionar moedas que já tem» no Registo`, `Escolha «Manter {logged}» ou «Mudar
  para {country}».`, `importe de novo com «Substituir tudo»`. This holds for a button, an option and a
  Settings tab (`Pode alterá-las em «Moedas e pesos».`, as the table's `Regra e venda` row has it).
  English names the same control bare, since its capital marks it (`choose Add coins you already
  have`); pt-PT's infinitive would read as the sentence's own verb. A screen named as a place stays a
  bare noun (`no Registo`, `abra o Portefólio`); where a tab shares a screen's name (`Plano`), the
  guillemets mark the tab (`Confirme-o em «Plano».`). An entry kind stays a noun (`uma
  transferência`), never a quoted name, and an imperative that says what to do is a sentence, not a
  name (`Tente de novo.`). `packages/app/src/lib/i18n/control-names.test.ts` checks every control
  that an English sentence names after a lower-case word, or after any tense of `choose` (`if you
  chose Later`). Decided 2026-11-18; the
  native reader confirms or overturns it (§8 item 9).
- **No courtesy words and no "we" in an error** (§1.6, §1.8): no `por favor`, `lamentamos`,
  `obrigado`, `caro utilizador` or `Atenção:` (the lint refuses the first two). `Escolha uma data a
  partir da primeira compra`, never `Não conseguimos guardar`.
- **The asset and the name.** `a bitcoin` for the unit (`a bitcoin caiu mais de 75%`,
  `as bitcoins`), `Bitcoin` for the network (`a rede Bitcoin`); the product's name takes the feminine article (`a Proof of Calm`) and stays in
  English (ADR-0040). Never echo the name as reassurance: no `calma` or `tranquilidade` in copy
  about the market or the plan.
- **The other coins take the feminine article too**, read as `a moeda`, as `a bitcoin` does:
  `a Ethereum`, `a Solana`, `a Chainlink` (`A Solana caiu`). The unit ether keeps the
  masculine: `o ether`.
- **"Ensure" is `confirme` or `verifique`**, since `garantir` and `garanta` stay banned (§2):
  `Confirme a data antes de guardar`.
- **Disclosures take the official Portuguese text** of each regulator phrasing in `docs/LEGAL.md`
  §4, never a translation back from English: MiFID II Delegated Regulation 2017/565 art. 44(4)(d),
  «os resultados registados no passado não constituem um indicador fiável dos resultados futuros»;
  MiCA art. 6(5)(a), «O criptoativo pode perder parcial ou totalmente o seu valor», and (e), «O
  criptoativo não está abrangido pelos sistemas de indemnização dos investidores»; the
  deposit-guarantee statement is MiCA art. 6(5)(f), its own point: as the English Risk page writes
  `deposit-protection`, the Portuguese one adapts the scheme's name to `proteção de depósitos`, with
  no allow-list entry, in §2's statement on status, which opens `A {product} não está registada`; the ESAs' warning of 2022-03-17 in the Portuguese version the ESAs
  published. "Not advice" reads «não constitui aconselhamento».
- **Numerals for every number**, 2 to 9 included: `4 vezes`, `2 moedas`, `há 15 dias`. Numbers,
  percentages and dates are formatted by the country's locale (§4): `28%` and `0,1234 BTC` in
  Portugal, never typed by hand where `lib/format` writes them.
- **A template's name spells out its number, as the English name does**: `Três moedas, sem janela
  de venda`, `Duas moedas, sem janela de venda` (`Three coins`, `Two coins`). The one exception to the
  numerals above; the template's other texts keep numerals (`1 moeda`, `2 moedas`).
- **A template's explanation writes its percentages by hand as `N %`**, with an ordinary space, as
  the English file does (`40 %`): a token the app finds and replaces with its formatted percentage
  (`packages/content/i18n/pt-PT/README.md`, §4). The one exception to "never typed by hand".
- **Outside a template's explanation, a translation joins a numeral to its unit or sign with a
  no-break space (U+00A0) wherever English does**, a date's parts included and with no hyphen:
  `máximo de 90 dias`, `10 %`, `16 de outubro de 2026`, each unbroken (decided 2026-11-17). A module
  writes the character itself. A pt-PT profile's check (§4) reads pt-PT's law names (`artigo`,
  `secção`, `frase`, `parágrafo`, `exemplo`, `código`, `processo`, `(UE)`; `(UE)` is pt-PT's `(EU)`
  before a regulation's number) and English's, which a translation keeps where it cites the source's
  law (`Topic 409`, `PIV 28969`, `Série I`). It reads each gap of `1 de janeiro de 2023`,
  `31 de outubro` and `janeiro de 2026`. A `de` before a bare year (`de 2023`) stays unchecked, as
  English's word before a year does (decided 2026-11-18). Its units are `dia`, `semana`, `mês` and
  `ano` with their plurals, and `Suplemento` after an ordinal (`2.º Suplemento`); a form's name may be
  a `Formulário` (#368, decided 2026-11-18). A source title in Portuguese (`lang` `pt`) is read with
  these lists. In a module, a count before pt-PT's nouns `blocos`, `observações`, `componentes`,
  `índices`, `bitcoins`, `países`, `ciclos`, `partes` and `sinais` is joined to its noun by U+00A0
  (`95 países`, §4 R7); `quedas` stays with R6.
- **The tax authority's own terms**, never a translation back from English: `CIRS`, `Anexo G`,
  `Anexo G1`, `Quadro 18A`, `mais-valias`, `Autoridade Tributária e Aduaneira`; a rule quoted from the
  law keeps the law's wording in quotation marks («detidos por um período igual ou superior a 365
  dias»). A tax name that a string shows the lint refusing goes on the allow-list with its reason
  (§2).
- **Lists take no comma before `e`**, as `lib/format` writes them: `BTC, ETH e SOL`.
- **A country in a sentence takes its form** (`packages/app/src/lib/countries/messages/pt-PT.json`), never
  `{country}` after a preposition or an article. Each form carries its preposition and article, contracted:
  `{countryFor}` and `{countryFrom}` take `de` (`dos Países Baixos`, `do Reino Unido`, `da Alemanha`, `de
  Portugal`), `{countryIn}` takes `em` (`nos Estados Unidos`, `em Portugal`), `{countryTo}` `para`, `{countryWith}`
  `com`, and `{countryThe}` is the name with its article as an object (`sugere a França`). Espanha, França and Itália take no article after a
  preposition (`em França`, `de Espanha`, `para Itália`) and take it as an object; the native reader confirms it
  (§8 item 9). A bare `{country}` stands only after a colon, a middle dot or in parentheses (`País do plano: Países
  Baixos.`). The general profile is `o perfil geral`.
- **A module's chart section takes pt-PT's two shapes of §4 R5** (decided 2026-11-17): B,
  `No gráfico, C teve K quedas de mais de N entre Y e Y.` with `1 queda` for one, and E, `C caiu L.` or
  `C caiu L`, then any number of `, C L`, then ` e C L.`, with no comma before `e`; `L` is `N`, `N e N`, or two or
  more `N` joined by `, ` with ` e ` before the last; `K` joins `quedas` or `queda` by U+00A0, as R6
  has it. `C` is `a` and a catalogue coin's name, as written or with its
  first letter in lower case, or `o ether` for ETH; only E's first `C` capitalises its article (`O ether caiu`,
  `A Solana caiu`), and the article agrees (`A ether caiu`, `o Solana` and `a Ether` fail). `N`, `K` and `Y` are
  §4's. Every other sentence of the section, and a heading there, is one `LISTED` in
  `packages/content/src/module-figures.ts` holds for pt-PT, as the page shows it, character for character. It holds
  none of §4's triggers, and its paragraph holds no mark. A new or reworded sentence fails until it is written as B or
  E, or listed in a reviewed pull request whose fact check finds in it no figure, count, date, amount or coin in any
  language (decided 2026-11-18). Each stands in a top-level paragraph or heading, never in a list item, a quote or an
  element: `1975. Um plano mensal define o dia de cada compra.` fails, since the page shows 1975 (§4 R5).
- **A country card's summary keeps the 60-word limit**, as in English (`docs/JURISDICTIONS.md` §2;
  `pnpm validate:content` counts the words). When a Portuguese card runs over 60 words, the
  explanation gives way, never the computed date, the rule or the source.
- **Content still in English on a pt-PT screen is marked, not hidden**: its element takes `lang="en"`
  and a country card says `As regras abaixo estão em inglês.` under its title (ADR-0057, the
  Corrections of 2026-11-16).

The product's nouns, one Portuguese word each, in every string, the site pages and the Learn modules:

| English | pt-PT |
|---|---|
| Today (the screen) | Hoje |
| Log (the screen) | Registo |
| an entry | movimento |
| record (the verb) | registar |
| move (an entry between venues) | transferência |
| Portfolio (the screen) | Portefólio |
| Holdings | moedas detidas |
| Invested | investido |
| average cost | custo médio |
| averaging (the method, DCA) | estratégia de custo médio, kept apart from average cost, `custo médio`; `a estratégia` once named |
| P/L | resultado |
| share (of the allocation) | peso |
| allocation | distribuição, kept apart from split, `repartição` |
| a wallet | carteira |
| Plan | Plano |
| Learn | Aprender |
| Settings | Definições |
| buy day | dia de compra |
| monthly buy | compra mensal |
| starting amount | montante inicial |
| extra buy | compra adicional |
| first buy, last buy | primeira compra, última compra |
| due {date} | previsto para {date} |
| skip, skipped | saltar, saltado |
| paused | em pausa |
| sale | venda |
| coins added at no cost (held) | moedas adicionadas |
| sell window | janela de venda |
| holding period | período de detenção |
| holding date | o primeiro dia depois do período da regra de detenção (never `data de fim do período de detenção`, the period's last day) |
| hold phase | fase de detenção |
| holding rule | regra de detenção |
| the plan strip's Buying, Holding, Selling, Out by | Compra, Detenção, Venda, Saída; the four stand only as the strip's phase labels, before a range or `a partir de`, never beside an asset name (`Compra` and `Venda` are spelled like imperatives, §2's imperative rule) |
| tax-free | `não tributado a partir de 2 de março de 2027` for the status, `data de exclusão de tributação` for the noun; the status agrees with its noun, and its noun is the gain, since a buy is never taxed: `Last buy tax-free` is `Mais-valia da última compra não tributada a partir de 2 de março de 2027`, a status from its date (the native reader confirms it, §8 item 9): CIRS art. 10 excludes these gains and Anexo G1 heads them «Mais-valias não tributadas»; never `isento`, since an exemption is a different concept |
| venue | local |
| units | unidades |
| (estimated) | (estimado), agreeing with its noun: `comissão (estimada)`, `unidades (estimadas)`; until the native reader decides (§8 item 9), a ticker amount takes the masculine plural, and every word after it agrees: `0,00094 BTC (estimados)`, `0,1 BTC vendidos` |
| fee, network fee | comissão, comissão de rede; never `taxa`, which is the tax rate in the same prose |
| coin | moeda |
| currency | moeda de pagamento |
| split | repartição |
| split, in the coin editor's name (the Settings tab, the Plan tab's legend and onboarding's summary row) | `Moedas e pesos`, since `repartição` (10 letters) runs past its tab at 125 % zoom and the editor's fields already say `peso`; `repartição` stays in every other string |
| Currency & data (the Settings tab) | `País e dados`, the headings of its two sections, since `pagamento` (9 letters) runs past its tab; `moeda de pagamento` stays in every other string, and a bare `moeda` never stands for currency |
| Hold & sell (the Settings tab) | `Regra e venda` for the tab's name, since `Detenção` (8 letters) runs past its tab at 125 % zoom when selected; a no-break space (U+00A0, ` ` in a JSON string) joins «e» and «venda» wherever the tab is named, the tab label included, so 125 % text breaks it into two lines, not three; every string that names the tab quotes it as «Regra e venda», and the holding rule itself stays `regra de detenção` |
| Undo | Anular |
| Delete | Eliminar |
| Dismiss | Dispensar |
| Review (the control) | Rever |
| Resume | Retomar |
| Reviewed on {date} | Revisto a {date} |
| backup | cópia de segurança |
| keep (data) | conservar |
| offline | sem ligação |
| app | aplicação |
| Risk disclosure (the link) | Aviso sobre riscos |
| daily close | fecho diário |
| a fall (what Today's line and Learn's first row name) | queda |
| the fall page | página da queda |
| 90-day high | máximo de 90 dias, joined by a no-break space, no hyphen |
| headline (news) | manchete |
| template | ponto de partida, its name after it unquoted: `o ponto de partida Plano de ciclo` |
| country card | ficha do país |
| tax-year file | ficheiro do ano fiscal |
| halving | halving, as the plan's chart labels it |
| Price data by CoinGecko | Dados de preços da CoinGecko |

Two terms name the same date in two frames: `o primeiro dia depois do período da regra de detenção`
is the date in the holding rule's own frame (the hold-phase card, the holding-date tool, the tax-year
file's `eligible_from` line in settings; the site's Risk tax line since #401 says «o primeiro dia
depois do período dessa regra»), and `não tributado a partir de <data>` (the status) or
`data de exclusão de tributação` (the noun) is its tax status in Portugal. `data de fim do período
de detenção` reads as the period's last day, one day before that date, so it names neither; no
shipped string uses it (counsel on #401, 2026-11-18).

## 10. German (de-DE)

The ten rules of §1 and the ban list of §2 hold in German; this section adds what the language
needs (decided 2026-11-23 under the unattended M2 rule, for the owner to confirm at the end of M2,
`docs/GROWTH.md` §9). The native reader's review is §8 item 9.

- **Standard spelling with ß, nouns and months capitalised** (`1. März 2027`); quotation marks are
  `„…“`, never `«…»`.
- **Address the reader as `Sie`**, with `Sie`, `Ihr` and `Ihnen` capitalised, in every string, site
  page, module, email and legal page, as the ESAs' German texts do; never `du`. `du` would read as
  the careful friend of §1 and `Sie` as a bank, but `Sie` keeps one voice with the ESAs' texts and
  the legal pages, for the owner to weigh at the end of M2. Serious is not formal
  (§1.5): short active sentences, no `erfolgt` or `Durchführung`. `Ihr` only where it removes doubt:
  `der Plan`, `die Einträge`, but `Ihr privater Schlüssel` and `Ihr Bestand`.
- **Buttons, labels and headings in the infinitive, the verb last**: `Speichern`, `Einen Kauf
  eintragen`, `Oktober überspringen`, `CSV-Protokoll exportieren`. A change of the form of address
  then touches only the sentences, so no control holds `Sie` (`Vorhandene Coins hinzufügen`). A link
  that ends a sentence takes its imperative (`Exportieren Sie eine Kopie.`); a standalone control
  takes the infinitive (`Kopie exportieren`).
- **§3's participle buttons keep the participle**: `Wie geplant gekauft`, `Anderen Betrag gekauft`.
- **A control named inside a sentence stands in `„…“`**, as the control shows it, its placeholders
  included: `wählen Sie im Protokoll „Vorhandene Coins hinzufügen“`. A screen named as a place stays
  a bare noun (`im Protokoll`, `im Portfolio`, `in den Einstellungen`). `Heute` and `Lernen`, which
  read as an adverb and a verb, stand in `„…“` wherever a sentence or a control names them
  (`Akzeptieren und „Heute“ öffnen`, `Zurück zu „Lernen“`); where a tab shares a screen's name, the
  quotes mark the tab (`Prüfen Sie das unter „Plan“.`). An entry kind stays a noun (`eine
  Übertragung`). `packages/app/src/lib/i18n/control-names.test.ts` reads pt-PT only; the first German
  strings bring its German check.
- **No courtesy words and no `wir` in an error** (§1.6, §1.8): no `bitte`, `leider`,
  `Entschuldigung`, `danke`, `Achtung:` or `Hinweis:`. `Wählen Sie ein Datum ab dem ersten Kauf`,
  never `Wir konnten das nicht speichern`.
- **"Ensure" is `prüfen`**, since every form of `sicher` stays banned (§2): `Prüfen Sie das Datum vor
  dem Speichern`, never `Stellen Sie sicher` or `Sind Sie sicher?`; the `garant` row refuses
  `Garantie`.
- **No ICU branch, and no line that names an asset, opens a clause with a form of §2's German
  list** (`Kauf`, `Verkauf`, `Halten`, `Tausch`), as the lint refuses. A label that is the whole
  message passes bare, as the entry sheet's kind labels do (`Monatskauf`, `Startbetrag`,
  `Zusatzkauf`, `Verkauf`, `Hinzugefügte Coins`, `Übertragene Coins`, the glossary below), while
  the same `Verkauf` opening an ICU branch fails (§2 German item 5). Every dot
  opens a clause for the lint, so in a line that names an asset no form stands right after an
  ordinal or an abbreviation (`2. Kauf`, `z. B. Kauf`). There, write a noun after a determiner (`ein
  Verkauf von {coin}`) and `Bestand`, never `die Sie halten`. The label `Investiert` stands bare; a
  sentence that names it quotes „Investiert“, which the allow-list passes.
- **The asset and the name.** A coin's name takes no article (`Ethereum fiel 2018 um 94 %`); the
  unit is `der Bitcoin`, the network `das Bitcoin-Netzwerk`. The product's name stays in English,
  with no article and no genitive `s` (`Proof of Calm berechnet`, `die Daten von Proof of Calm`;
  ADR-0040). Never echo it as reassurance: no `Ruhe`, `gelassen` or `keine Sorge` about the market
  or the plan.
- **People and places.** Name the function (`Fragen für die Steuerberatung`) or write the ESAs' pair
  (`Verbraucherinnen und Verbraucher`), never `*`, `:` or an inner capital I; a quoted law keeps its
  wording (`Anleger`). A country in a sentence takes its form from
  `packages/app/src/lib/countries/messages/de.json` (planned: M2), each with its preposition, article and case
  (`für die Niederlande`, `im Vereinigten Königreich`, `mit den Niederlanden`, `auf die USA`, `vom Vereinigten
  Königreich`); a bare `{country}` stands only after a colon, a middle dot or in parentheses (§9).
- **Disclosures take the official German text** of each regulator phrasing in `docs/LEGAL.md` §4,
  never a translation back from English: Delegated Regulation 2017/565 art. 44(4)(d), „Die frühere
  Wertentwicklung ist kein verlässlicher Indikator für künftige Ergebnisse.“; MiCA art. 6(5)(a), „Der
  Kryptowert kann seinen Wert ganz oder teilweise verlieren.“; (e) and (f), the `Systeme für die
  Entschädigung der Anleger` and the `Einlagensicherungssysteme`, in the German text of
  `docs/LEGAL.md` §5's statement on status, which opens
  `Proof of Calm ist bei keiner Finanzaufsichtsbehörde registriert und unterliegt keiner Finanzaufsicht`;
  the ESAs' warning of 2022-03-17 in its German version. "Not advice" reads `keine Beratung`, "no financial or tax advice" `keine
  Anlage- oder Steuerberatung`. The plan-creation text stays English until counsel approves a German
  one (`docs/LEGAL.md` §4).
- **Numerals for every number**, 2 to 9 included: `2 Coins`, `vor 15 Tagen`, `4‑mal`. Numbers,
  percentages and dates are formatted by the country's locale (§4): `40 %` and `0,00094000 BTC` on a
  German plan, `40%` on a Portuguese one, never typed by hand where `lib/format` writes them.
- **A template's name spells out its number**, as English does (`Drei Coins, ohne
  Verkaufsfenster`); its other texts keep numerals, and its explanation writes `N %`, the token of §9.
- **U+00A0 joins** a numeral to its unit, in a template's texts too (`365 Tage`, `etwa 4 Jahre`;
  a counted word such as `3 Coins` is no unit, §4), and outside a template to `%` (`40 %`); `§`, `§§`,
  `Abs.`, `Satz`, `Nr.` and `Art.` to their numbers (`§ 23 Abs. 1 Satz 1 Nr. 2 EStG`, the law's own
  form); a currency code to its figure (`EUR 20 350`, §4's grouping); each gap of a hand-written date
  (`15. März 2027`); and `z. B.`. U+2060 follows an en dash between figures (`2023–2025`); U+2011
  joins a numeral compound (`90‑Tage‑Hoch`). Prose ranges take `bis`. Never `Uhr` after a time, since
  `lib/format` may add the zone (`14:05 MESZ`), and never a placeholder in a compound (`Kosten für
  {coin}`, not `{coin}-Kosten`). `packages/content/src/hyphen-validate.ts` refuses a German unit
  hyphened to its numeral (`365-Tage`, `1-jährige`, `4-mal`); `packages/content/src/join-validate.ts`
  holds no German lists yet, and a German profile or module overlay waits for it. A template's texts
  never reach it: `packages/content/src/loaders/templates-language.test.ts` holds the German
  templates to the unit join, with the hyphen lint's units.
- **The tax authority's own terms**: `privates Veräußerungsgeschäft`, `Freigrenze`, `Anlage SO`,
  `Finanzamt`, `BMF-Schreiben`; a rule quoted from the law keeps its wording („nicht mehr als ein
  Jahr beträgt“). A tax name the lint refuses goes on the allow-list with its reason (§2).
- **Lists take no comma before `und`**, as `lib/format` writes them: `BTC, ETH und SOL`.
- **A module's chart section has no German shapes of §4 R5 yet**, so it fails closed until they are
  decided as pt-PT's were.
- **A country card's summary keeps the 60-word limit**, and content still in English on a German
  screen is marked: `lang="en"`, and on a country card `Die folgenden Regeln sind auf Englisch.`
  under its title (ADR-0057).

The product's nouns, one German word each, in every string, the site pages and the Learn modules:

| English | de-DE |
|---|---|
| Today (the screen) | Heute |
| Log (the screen) | Protokoll |
| an entry | Eintrag |
| record (the verb) | eintragen (`Eingetragen: …`) |
| move (an entry between venues) | Übertragung, übertragen; never `Überweisung`, which moves money |
| Portfolio (the screen) | Portfolio; never `Depot`, an account a provider keeps (ADR-0039) |
| Holdings | Bestand |
| Invested | investiert |
| average cost | durchschnittlicher Kaufpreis |
| averaging (the method, DCA) | `DCA`, explained once as `regelmäßige Käufe mit festem Betrag`; never `Cost-Average-Effekt`, a benefit stated as fact, nor `Durchschnittsmethode`, the BMF's lot method |
| P/L | Ergebnis |
| share / allocation / split | Anteil / Verteilung / Aufteilung |
| a wallet | die Wallet |
| Plan / Learn / Settings | Plan / Lernen / Einstellungen |
| buy day | Kauftag |
| monthly buy, starting amount, extra buy | Monatskauf, Startbetrag, Zusatzkauf |
| first buy, last buy | erster Kauf, letzter Kauf |
| due {date} | geplant für den {date}; never `fällig`, a bill's word |
| skip, skipped / paused / Resume | überspringen, übersprungen / pausiert / Fortsetzen |
| sale | Verkauf |
| coins added at no cost (held) | Hinzugefügte Coins |
| coins moved (the kind) | Übertragene Coins |
| sell window | Verkaufsfenster |
| holding period, holding rule | Haltefrist, one noun for both (`Keine Haltefrist`, `Eigene Haltefrist`); never `Spekulationsfrist` |
| holding date | der erste Tag nach der Haltefrist |
| hold phase | Haltephase |
| the plan strip's Buying, Holding, Selling, Out by | Kaufphase, Haltephase, Verkaufsfenster, Ausstieg, each before a range or `ab {date}`; never `Kauf` or `Halten`, which read as instructions |
| tax-free | `Steuerfrei ab 2. März 2027` for the status, which does not inflect and needs no subject; `der erste steuerfreie Tag` for the noun (`Warum? Der erste steuerfreie Tag`); `Last buy tax-free` is `Letzter Kauf: erster steuerfreier Tag`, so no buy is called tax-free; never `steuerbefreit`, an exemption |
| Long-term rate from {date} | Langfristiger Steuersatz ab {date} |
| venue | Ort (`ohne Ort`) |
| units / (estimated) | Einheiten / (geschätzt), never inflected |
| fee, network fee | Gebühr, Netzwerkgebühr |
| coin | Coin (der, die Coins); `Kryptowert` in a disclosure and in legal text, as MiCA writes it; never `Kryptowährung` |
| currency | Währung (`Zahlungswährung` where the pay currency is meant) |
| the Settings tabs | `Plan`, `Coins & Anteile`, `Frist & Verkauf`, `Währung & Daten`, with U+00A0 after each `&`; no word over 7 letters, since an 8-letter pt-PT word ran past its tab at 125 % zoom; quoted wherever a string names one |
| Undo / Delete / Dismiss / Review (the control) | Rückgängig / Löschen / Ausblenden / Prüfen |
| Reviewed on {date} | Stand: {date}; under review `Seit {date} nicht überprüft`; never `geprüft`, which reads as a seal (§2) |
| backup / keep (data) | Backup (`JSON-Backup exportieren`) / aufbewahren |
| offline / app / halving | offline / App / Halving |
| Risk disclosure (the link) | Risikohinweise |
| daily close / Price data by CoinGecko | Tagesschlusskurs / Kursdaten von CoinGecko; `Kurs` is the market's price, `Preis` what the person paid |
| a fall | Rückgang; never `Crash`, `Einbruch` or `Dip` |
| 90-day high | 90‑Tage‑Hoch, U+2011 twice |
| template | Ausgangspunkt, its name after it unquoted |
| country card / general profile | Länderprofil / das allgemeine Profil |
| tax-year file | Datei für das Steuerjahr (`Steuerjahr als CSV exportieren`) |
| crypto-asset service provider | Anbieter von Kryptowerte-Dienstleistungen |
| screen (#419's shell strings) | Ansicht (`Diese Ansicht konnte nicht geladen werden.`) |
| unread (a plan this version cannot read, `shell.newer.again`) | ungelesen |

Two terms name the same date in two frames: `der erste Tag nach der Haltefrist` is the date in the
holding rule's own frame (the hold-phase card, the holding-date tool, the tax-year file's
`eligible_from` line), and `steuerfrei ab <Datum>` (the status) or `der erste steuerfreie Tag` (the
noun) is its tax status in Germany. § 23 EStG taxes a sale when „der Zeitraum zwischen Anschaffung
und Veräußerung nicht mehr als ein Jahr beträgt“: bought on 15 March 2026, a sale on 15 March 2027 is
still inside the year, and the app shows `16. März 2027` (`packages/content/jurisdictions/de.json`).
`Ende der Haltefrist`, `Haltefrist endet am`, `Fristende`, `Ablaufdatum` and `bis <Datum>` name
15 March, the day before, so they name neither; no form of `Ablauf` or `ablaufen` stands in this copy.

For the native reader (§8 item 9): `Sie`; `steuerfrei ab` against `nicht steuerbar ab`, and `Letzter
Kauf: erster steuerfreier Tag`; `Protokoll`, `Lernen`, `Ort`, `Coin`, `die Wallet`, `Backup` (pt-PT
kept `cópia de segurança`), `durchschnittlicher Kaufpreis` against `Einstandspreis`, `Stand:` and
`geplant für den`; the Settings tabs, the tab bar and the entry sheet's kinds at 360 px with 125 %
text, with `Land & Daten` if `Währung` runs past; the German "not tax advice" line, pending the StBerG
question (`docs/BENCHMARK.md` §4), its candidate `Aus Ihren Einträgen berechnet, keine
Steuerberatung`; the descriptor against `Krypto-Sparplan` (`docs/GROWTH.md` §2.5); `ungelesen`
against `nicht eingelesen` for `shell.newer.again`.
