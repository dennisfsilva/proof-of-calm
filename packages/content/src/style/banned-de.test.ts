// The German imperative rule's tables (docs/CONTENT-STYLE.md §2, German, and §10): the D1 judge's corpora of
// 2026-11-23 for the directive, frame and branch rules and the shared asset class, the needed copy of §10, the gaps
// the rule leaves to counsel, and the previous rule's refusals; then the German word rows, filler words and gain
// patterns, and §2's and §10's words read from the document. All data is copied in; nothing is imported.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type Finding, findBanned } from './banned.ts';

const rules = (text: string) => findBanned(text).map((finding) => `${finding.rule}: ${finding.match}`);

// Directives, frames and branches the rule refuses, with the asset class in English and Portuguese.
const REFUSED: string[] = [
  'Kaufen Sie jeden Monat Bitcoin.',
  'Kauf jeden Monat für 100 € BTC.',
  'Kaufe am 1. November ETH.',
  'Kauft jetzt Solana.',
  'Jetzt Bitcoin kaufen.',
  'Cardano jetzt kaufen',
  'Sie sollten jetzt BTC kaufen.',
  'Sollten Sie BTC verkaufen, bevor die Frist endet?',
  'Halten Sie Ihre BTC bis 2030.',
  'Behalten Sie {coin} bis zum Ende des Verkaufsfensters.',
  'Verkaufen Sie {units} jetzt.',
  'Verkaufe {units} erst ab dem {date:sellWindow.opens}.',
  'Steigen Sie jetzt bei Bitcoin ein.',
  'Legen Sie jeden Monat 100 € in ETH an.',
  'Stocken Sie Ihre BTC auf, wenn der Kurs fällt.',
  'Jetzt in Bitcoin einsteigen',
  'Es lohnt sich, Bitcoin langfristig zu halten.',
  'Am besten kaufen Sie BTC immer am 1.',
  'Wenn BTC fällt, kaufen Sie nach.',
  'Kaufen Sie z. B. ETH statt BTC.',
  'Kaufen Sie am 1. November BTC.',
  'Tauschen Sie ETH gegen BTC.',
  'Schichten Sie von Solana in Bitcoin um.',
  'Bleiben Sie in Bitcoin investiert.',
  'Sichern Sie sich jetzt Ihre ersten Bitcoins.',
  'Warum kaufst du nicht jetzt BTC?',
  'Haben Sie Bitcoins? Dann verkaufen Sie sie nicht.',
  'Tätigen Sie Ihren nächsten Kauf von BTC am 1. des Monats.',
  'Sparen Sie monatlich in Bitcoin.',
  'Sie müssen jetzt verkaufen.',
  '{count, plural, one {Verkaufen Sie es} other {Verkaufen Sie sie}}',
  '{coins, select, one {} other {Halten Sie}} die Beträge am {date}.',
  'Halten Sie bis {date:sellWindow.opens} Ihre Bitcoin.',
  'Sie sollten Ihre Coins bis 2029 halten.',
  'Behalte deine Bitcoins.',
  'Wenn der Kurs fällt, kauf mehr ETH.',
  'Jetzt ist der richtige Zeitpunkt, um BTC zu kaufen.',
  'Nehmen Sie bei BTC Ihre Gewinne mit.',
  'Holen Sie sich jetzt Bitcoin.',
  'Wenn du BTC länger als ein Jahr hältst, ist der Gewinn steuerfrei.',
  'Am 1. März: Kauf BTC für 100 €.',
  'Halten Sie Ihre Coins bis 2029.',
  'Kaufen Sie jeden Monat Coins.',
  'Kaufen Sie Altcoins.',
  'Man kauft BTC am besten monatlich.',
  'Jeden Monat kauft ihr BTC.',
  'Legen Sie sich BTC zu.',
  'Halten Sie mit BTC durch.',
  'Setzen Sie auf Bitcoin.',
  'Führen Sie den Kauf von BTC am 1. durch.',
  'Kaufen sollten Sie jetzt nicht.',
  'Es lohnt, ETH zu halten.',
  'Tausch, z. B. gegen BTC.',
  'Sie haben 0,1 BTC verkauft.',
  'Prüfen Sie den Anbieter, bevor Sie Kryptowerte kaufen.',
  'Hold your coins until 2029.',
  'Buy XRP every month.',
  'Mantenha as moedas até 2029.',
  'Compre Cardano todos os meses.',
];

// §10's copy and the designers' pass lists: none may fail.
const NEEDED: string[] = [
  'Kauftag',
  'Kaufphase',
  'Haltefrist',
  'Haltephase',
  'Verkaufsfenster',
  'Monatskauf',
  'Zusatzkauf',
  'Verkauf',
  'Erster Kauf',
  'Letzter Kauf',
  'Einen Kauf eintragen',
  'Wie geplant gekauft',
  'Anderen Betrag gekauft',
  'investiert',
  'Investiert',
  'Ergebnis',
  'Bestand',
  'Ausstieg',
  'Kursdaten von CoinGecko',
  'JSON-Backup exportieren',
  'Steuerfrei ab {date}',
  'Warum? Der erste steuerfreie Tag',
  'Letzter Kauf: erster steuerfreier Tag',
  'Proof of Calm ist bei keiner Finanzaufsichtsbehörde registriert und unterliegt keiner Finanzaufsicht; kein System für die Entschädigung der Anleger und kein Einlagensicherungssystem deckt Kryptowerte ab.',
  'Keine Tätigkeit, die der behördlichen Zulassung bedarf; keine Aufsichtsbehörde.',
  'Anbieter von Kryptowerte-Dienstleistungen, die in der EU tätig sind.',
  'ESMA führt ein öffentliches Register der nach MiCA zugelassenen Anbieter.',
  'Daten und Werkzeuge, keine Anlage- oder Steuerberatung.',
  'Daten und Werkzeuge, keine Beratung. Kryptowerte können ihren gesamten Wert verlieren.',
  'Die frühere Wertentwicklung ist kein verlässlicher Indikator für künftige Ergebnisse.',
  'Der Kryptowert kann seinen Wert ganz oder teilweise verlieren.',
  'Prüfen Sie das Datum vor dem Speichern.',
  'Exportieren Sie eine Kopie, bevor Sie verkaufen.',
  'Viele Verbraucherinnen und Verbraucher wissen nicht, welche Risiken sie eingehen, wenn sie diese Vermögenswerte kaufen.',
  'Oktober überspringen',
  'CSV-Protokoll exportieren',
  'Vorhandene Coins hinzufügen',
  'Übertragene Coins',
  'Hinzugefügte Coins',
  'Akzeptieren und „Heute“ öffnen',
  'Wählen Sie ein Datum ab dem ersten Kauf.',
  'Der Kauf vom {date}',
  'Ethereum fiel 2018 um 94 %.',
  'Drei Coins, ohne Verkaufsfenster',
  'DCA: regelmäßige Käufe mit festem Betrag',
  'Krypto-Sparplan',
  'Aus Ihren Einträgen berechnet, keine Steuerberatung',
  'Eingetragen: 100 € in BTC am 16. Okt. 2026.',
  'Der Kauftag war der 1. Oktober, vor 15 Tagen. Tragen Sie den Kauf ein oder überspringen Sie den Monat.',
  'Ihre Daten liegen nur auf diesem Gerät. Exportieren Sie eine Kopie, um sie zu behalten.',
  '0,1234 BTC jetzt verkaufbar · 0,0100 BTC ab 12. März 2030',
  'Sie können alles verlieren: Bitcoin ist seit 2011 4-mal um mehr als 75 % von einem Hoch gefallen; Ethereum fiel 2018 um 94 %. Setzen Sie nur Geld ein, das Sie jahrelang nicht brauchen.',
  'Noch nicht gekauft: {coins}. Für Coins, die Sie bereits haben, öffnen Sie das Protokoll und wählen Sie „Vorhandene Coins hinzufügen“.',
  'Eingetragen: {units} hinzugefügt für {amount} am {date}.',
  'Eingetragen: {units} von {from} nach {to} übertragen am {date}.',
  'Netzwerkgebühr {units}',
  'Jeder Monatsbetrag wird auf Bitcoin, Ethereum und Solana aufgeteilt, ohne Verkaufsfenster.',
  '3 Coins, jeden Monat gekauft und gehalten, ohne Verkaufsdatum.',
  'Nur Bitcoin, ohne Verkaufsfenster',
  'Der Plan teilt jeden Monatsbetrag auf: 40 % Bitcoin, 30 % Ethereum, 15 % Solana und 15 % Chainlink.',
  'Nach dem {date:sellWindow.exitBy} wird nichts mehr gehalten.',
  'Der Plan sieht ab {date:sellWindow.opens} den Verkauf je eines Drittels vor, unabhängig vom Kurs.',
  'Die Rückgänge von Bitcoin und Ethereum begannen am selben Tag, also sind 2 Coins nicht 2 getrennte Risiken.',
  'Steuerpflichtig, wenn zwischen Kauf und Verkauf ein Jahr oder weniger liegt; steuerfrei nach mehr als einem Jahr.',
  'Ein Tausch oder ein mit Krypto bezahlter Kauf startet für die erhaltenen Coins eine neue Haltefrist.',
  'Freigrenze von 1.000 € im Jahr für alle Gewinne nach § 23 Abs. 1 Satz 1 Nr. 2 EStG zusammen.',
  'Tauschkryptowerte wie BTC und ETH, die nach dem 31. Dezember 2026 angeschafft werden, würden unabhängig von der Haltedauer zu Kapitalerträgen, besteuert mit 25 % zuzüglich Solidaritätszuschlag.',
  'Gewinne aus privaten Veräußerungsgeschäften werden mit dem persönlichen Steuersatz besteuert, nicht mit der Abgeltungsteuer von 25 %.',
  'Der Gewinn wird mit Ihrem persönlichen Steuersatz von 14 % bis 45 % besteuert.',
  '25 % Abgeltungsteuer auf Kapitalerträge',
  '0 % bis 12.348 €; 14 % steigend bis 42 % bei 69.879 €; 45 % ab 277.826 €.',
  'Bei einem Kauf am 15. März 2026 liegt ein Verkauf am 15. März 2027 noch innerhalb des Jahres; ab dem 16. März 2027 ist er steuerfrei.',
  'Ihr Plan kauft bis {lastBuy}, hält dann und verkauft zwischen {opens} und {closes} in 3 Teilen.',
  '{invested} von {planned} bisher investiert ({percent}). Verbleibende Käufe: {left}.',
  'Der Tag, an dem Sie sie gekauft oder erhalten haben.',
  '{coin} ist nicht in Ihrem Plan. Fügen Sie die Coin zuerst in den Einstellungen hinzu.',
  'Diesen Plan behalten',
  '{logged} behalten',
  'Exportieren Sie zuerst eine Kopie, wenn Sie die Einträge aufbewahren möchten.',
  '{count, plural, one {{figure} monatlicher Kauf} other {{figure} monatliche Käufe}}',
  '{count, plural, one {# Kauf} other {# Käufe}} von {coin} eingetragen.',
  'Bitcoin stieg zwischen dem 1. April und dem 6. Oktober 2025 um 48 %.',
  'BTC liegt 35 % unter dem 90‑Tage‑Hoch.',
  'Ihre Regel: 100 € in BTC am 1. jedes Monats',
  'Der Plan sieht jeden Monat einen Kauf von BTC vor.',
  'Am {date} gekauft: 0,1 BTC.',
  '12,8 % income tax plus 18,6 % social levies.',
  'Proof of Calm Plus kostet 3 € im Monat.',
  'Ein Konto ist nicht nötig.',
  'Sie können den Plan jederzeit ändern.',
  // The allow-list's entries, each in the sentence that needs it (style/banned.json).
  'Keine eingetragenen Kosten für {coins}, daher lassen „Investiert“ und „Ergebnis“ diese Coins aus.',
  'O plano conserva as moedas de pagamento e de apresentação do ficheiro, que pode alterar em «Regra e venda».',
  'A {product} nunca pede a sua frase de recuperação, nem moedas nem dinheiro para as comprar.',
];

// Each refused sentence, then its rewording, which must pass.
const REWORDED: [string, string][] = [
  [
    'Proof of Calm verwahrt nie Ihr Geld oder Ihre Coins. Sie kaufen und verwahren Coins bei einem Anbieter Ihrer Wahl oder in einer eigenen Wallet.',
    'Proof of Calm hat nie Zugriff auf Ihr Geld oder Ihre Coins. Für Kauf und Aufbewahrung wählen Sie einen Anbieter oder eine eigene Wallet.',
  ],
  [
    'Wenn Sie Coins selbst verwahren und die Seed-Phrase verlieren, kann niemand sie wiederherstellen.',
    'Bei Coins in eigener Verwahrung kann niemand eine verlorene Seed-Phrase wiederherstellen.',
  ],
  ['… oder nach Coins oder Geld, um sie zu kaufen.', '… oder nach Coins oder Geld für deren Kauf.'],
  ['Eingetragen: {amount} {coin} am {date} verkauft.', 'Eingetragen: ein Verkauf von {amount} {coin} am {date}.'],
  ['{coin} verkauft (Einheiten)', 'Verkaufte Einheiten von {coin}'],
  ['{coin} verkauft für, vor Gebühren ({currency})', 'Verkaufserlös von {coin} vor Gebühren ({currency})'],
  [
    'Dieser Verkauf ist {excess} mehr, als Sie halten ({held} am {date}).',
    'Dieser Verkauf übersteigt Ihren Bestand um {excess} ({held} am {date}).',
  ],
  [
    'Diese Übertragung sendet {sent}, mehr als Sie halten (…).',
    'Diese Übertragung übersteigt Ihren Bestand um {excess} ({held} am {date}).',
  ],
  ['…{coins, select, one {} other {, in den Mengen, die Sie halten,}}…', '…, gewichtet nach Ihrem Bestand,…'],
  ['Ein Rückgang der Coins, die Sie halten, ist im Gange.', 'Ein Rückgang der Coins in Ihrem Bestand ist im Gange.'],
  [
    '{units} verkauft ohne einen Kauf am oder vor dem Verkaufsdatum. …',
    'Für den Verkauf von {units} gibt es keinen Kauf am oder vor seinem Datum. Prüfen Sie Daten und Beträge im Protokoll.',
  ],
  [
    '4 Coins, … dann gehalten und ab {date:sellWindow.opens} in Dritteln verkauft.',
    '… dann gehalten und ab {date:sellWindow.opens} in Dritteln zum Verkauf vorgesehen.',
  ],
  ['2 Coins, …, ohne Datum zum Verkaufen.', '…, ohne Verkaufsdatum.'],
  [
    'Deutschland: Kryptowerte, die Sie länger als ein Jahr halten, sind beim Verkauf steuerfrei.',
    'Deutschland: Ein Verkauf von Kryptowerten mehr als ein Jahr nach dem Kauf ist steuerfrei.',
  ],
  [
    'Verkaufen Sie innerhalb eines Jahres, wird der Gewinn … besteuert; … mit Krypto …',
    'Bei einem Verkauf innerhalb eines Jahres wird der Gewinn … besteuert; …',
  ],
  ['Der Plan kauft am 1. jedes Monats Bitcoin.', 'Der Kauf von Bitcoin findet am 1. jedes Monats statt.'],
  ['Kauf von 0,01 BTC erfasst.', 'Eingetragen: ein Kauf von 0,01 BTC.'],
  [
    '{count, plural, one {Kauf} other {Käufe}} von BTC eingetragen.',
    '{count, plural, one {# Kauf} other {# Käufe}} von BTC eingetragen.',
  ],
  ['Der 1. Kauf von BTC ist am {date}.', 'Der erste Kauf von BTC ist am {date}.'],
  ['Legen Sie einen Plan für BTC an.', 'Richten Sie einen Plan für BTC ein.'],
  ['Halten Sie jeden Kauf von BTC fest.', 'Tragen Sie jeden Kauf von BTC ein.'],
  ['Sie müssen nichts verkaufen.', 'Der Plan verlangt keinen Verkauf.'],
  ['Sie müssen kein Konto anlegen.', 'Ein Konto ist nicht nötig.'],
  [
    'Prüfen Sie den Anbieter, bevor Sie Kryptowerte kaufen.',
    'Prüfen Sie jeden Anbieter vor dem ersten Kauf von Kryptowerten.',
  ],
  ['Tausch, z. B. gegen BTC.', 'Ein Tausch, z. B. gegen BTC, gilt als Verkauf.'],
  ['Der Gewinn aus den verkauften Einheiten von BTC', 'Der Gewinn aus den Verkäufen von BTC'],
  ['Bitcoin wurde 2021 von vielen verkauft.', '2021 gab es viele Verkäufe von Bitcoin.'],
  [
    "The exchange's halt of bitcoin withdrawals lasted 3 weeks.",
    'The exchange stopped bitcoin withdrawals for 3 weeks.',
  ],
];

// What the rule misses and leaves to counsel and the native reader (§2's German imperative bullet), each with why.
const GAPS: [string, string][] = [
  ['Jetzt wird BTC gekauft.', 'a passive command'],
  ['Jetzt BTC gekauft!', 'a participle command'],
  ['Rein in Bitcoin.', 'verbless'],
  ['BTC gehört in jedes Depot.', 'an unlisted verb'],
  ['Bleiben Sie bei BTC.', 'an unlisted verb'],
  ['Werden Sie Ihre BTC nicht los.', 'an unlisted verb'],
  ['Lösen Sie Ihre BTC-Position nicht auf.', 'an unlisted verb'],
  ['Steigen Sie auf Bitcoin um.', 'an unlisted verb'],
  ['Steigen Sie ein bei Bitcoin.', 'a particle after the clause'],
  ['Wer BTC länger als ein Jahr hält, zahlt keine Steuer.', 'a 3rd-person statement'],
  ['Bitcoin steigt bald wieder.', 'a forecast the word rows hold'],
  ['Die Rendite lag 2021 bei 300 %.', 'a dated past figure'],
  ['8 % p. a. mit Staking.', 'no gain word'],
  ['Ihr Geld hat sich mit BTC verdoppelt.', 'an unlisted verb'],
  ['Ihr Geld ist in BTC geschützt.', 'an unlisted verb'],
  ['Ein guter Zeitpunkt für BTC.', 'verbless'],
  ['Jetzt kaufen.', 'no asset, as English Buy now'],
  ['Verkaufen Sie innerhalb eines Jahres, wird der Gewinn besteuert.', 'no asset in the line'],
  ['Haben Sie Bitcoin?', 'the asset is named in another message'],
  ['Tem bitcoins? Não as venda.', 'Portuguese keeps its sentence unit'],
  ['Todos os meses compra BTC.', 'Portuguese keeps its sentence unit'],
];

// Main's lint refused every one of these before the German rule; all stay refused.
const PREVIOUS_REFUSED: string[] = [
  'Kaufen Sie Ethereum.',
  '{formal, select, yes {Kaufen Sie} other {Kauf}} jetzt.',
  'Wir empfehlen eine sichere Anlage, um Vermögen aufbauen zu können.',
  'Eine regulierte, lizenzierte und zugelassene App.',
  'Kaufen Sie jeden Monat Bitcoin.',
  'Kauf jeden Monat für 100 € BTC.',
  'Kauf jetzt BTC.',
  'Kaufen Sie bei Rücksetzern BTC nach.',
  'Der 1. Kauf von BTC ist am {date}.',
  'Am 2. Kauf von BTC',
  'z. B. Kauf von 0,5 BTC',
  'Kauf von {coin} eintragen',
  '{kind, select, buy {Kauf eintragen} other {Verkauf eintragen}}',
  'Kauf von 0,01 BTC erfasst.',
  '{count, plural, one {Kauf} other {Käufe}} von BTC erfasst.',
  'Wir empfehlen einen Plan mit 2 Coins.',
  'Wir empfehlen, monatlich in BTC zu investieren.',
  'Eine sichere Anlage für die Zukunft.',
  'Bitcoin ist eine sichere Anlage.',
  'Garantiert steuerfrei nach einem Jahr.',
  'Wenn Sie nicht sicher sind, beginnt mit dem spätestmöglichen Tag nie eine Haltefrist zu früh.',
  'Keine Garantie für Kursgewinne.',
  'Wir garantieren nichts.',
];

describe('the German imperative rule on the D1 judge’s corpora (docs/CONTENT-STYLE.md §2)', () => {
  it('refuses every directive, frame and branch of the list', () => {
    for (const text of REFUSED) expect(findBanned(text), text).not.toEqual([]);
  });

  it('passes every needed line of §10', () => {
    for (const text of NEEDED) expect(findBanned(text), text).toEqual([]);
  });

  it('refuses each reworded line and passes its rewording', () => {
    for (const [text, rewording] of REWORDED) {
      expect(findBanned(text), text).not.toEqual([]);
      expect(findBanned(rewording), rewording).toEqual([]);
    }
  });

  it('passes the named gaps, so closing one moves it into the refused list', () => {
    for (const [text, reason] of GAPS) expect(findBanned(text), `${text} (${reason})`).toEqual([]);
  });

  it('still refuses every text the previous rule refused', () => {
    for (const text of PREVIOUS_REFUSED) expect(findBanned(text), text).not.toEqual([]);
  });
});

describe('the German imperative rule’s findings', () => {
  it('reports the whole line with an asset name, its date placeholder as written', () => {
    expect(rules('Kaufen Sie am 1. November BTC.')).toEqual(['imperative: Kaufen Sie am 1. November BTC.']);
    expect(rules('Verkaufe {units} erst ab dem {date:sellWindow.opens}.\nDer Kauf vom {date}')).toEqual([
      'imperative: Verkaufe {units} erst ab dem {date:sellWindow.opens}.',
    ]);
  });

  it('reports a frame with a listed infinitive as advice, with or without an asset', () => {
    expect(rules('Sie müssen jetzt verkaufen.')).toEqual(['advice: Sie müssen jetzt verkaufen.']);
    // "sollten Sie" is also a German word row (§2), reported before the frame's line.
    expect(rules('Kaufen sollten Sie jetzt nicht.')).toEqual([
      'advice: sollten Sie',
      'advice: Kaufen sollten Sie jetzt nicht.',
    ]);
  });

  it('reports a branch that opens with a listed form in any case, and passes one that opens with #', () => {
    expect(rules('{kind, select, buy {Kauf eintragen} other {Verkauf eintragen}}')).toEqual([
      'imperative: Kauf eintragen',
      'imperative: Verkauf eintragen',
    ]);
    expect(rules('{count, plural, one {# Kauf} other {# Käufe}} eingetragen.')).toEqual([]);
  });

  it('counts a capitalised finite form only where a clause opens, after any dot too', () => {
    expect(rules('Der Kauf von BTC ist am {date}.')).toEqual([]);
    expect(rules('z. B. Kauf von 0,5 BTC')).toEqual(['imperative: z. B. Kauf von 0,5 BTC']);
    expect(rules('Am 2. Kauf von BTC')).toEqual(['imperative: Am 2. Kauf von BTC']);
  });

  it('reads the text with soft hyphens and zero-width characters taken out', () => {
    for (const hidden of ['­', '​', '‌', '‍', '⁠']) {
      expect(rules(`Kau${hidden}fen Sie BTC.`), JSON.stringify(hidden)).toEqual(['imperative: Kaufen Sie BTC.']);
    }
  });

  it('counts the catalogue’s names as written and its tickers in capitals, in every language', () => {
    expect(rules('Buy Cardano every month.')).toEqual(['imperative: Buy Cardano every month']);
    expect(rules('Kaufen Sie jeden Monat DOGE.')).toEqual(['imperative: Kaufen Sie jeden Monat DOGE.']);
    expect(rules('Buy a render of the chart.')).toEqual([]);
    expect(rules('Hold the coins until 2029.')).toEqual(['imperative: Hold the coins until 2029']);
  });
});

// The German word rows, filler words and gain patterns on the D1 judge's corpora, each with the rule that refuses it.
const ROWS_REFUSED: [string, Finding['rule']][] = [
  ['Es empfiehlt sich, den Plan nicht zu ändern.', 'advice'],
  ['Unsere Kaufempfehlung für Dezember', 'advice'],
  ['Sie sollten den Plan regelmäßig prüfen.', 'advice'],
  ['Tipp: Tragen Sie jeden Kauf am selben Tag ein.', 'advice'],
  ['Mit Renditegarantie.', 'advice'],
  ['Vermögensaufbau mit Bitcoin', 'advice'],
  ['Bitcoin wird sich wieder erholen.', 'advice'],
  ['Das Kursziel für BTC liegt bei 150.000 €.', 'advice'],
  ['Diese Chance nicht verpassen', 'advice'],
  ['Herzlichen Glückwunsch zu Ihrem ersten Kauf.', 'advice'],
  ['Keine Sorge: Der Plan läuft weiter.', 'advice'],
  ['Proof of Calm ist bei der BaFin registriert.', 'advice'],
  ['Keine Kursalarme, nur Ihr Plan.', 'advice'],
  ['Verpassen Sie diese Gelegenheit nicht.', 'advice'],
  ['Bitcoin, das digitale Gold.', 'advice'],
  ['Schützen Sie sich mit BTC vor Inflation.', 'advice'],
  ['Die besten Coins für 2027.', 'advice'],
  ['Ganz einfach jeden Monat investieren.', 'advice'],
  ['Schlagen Sie mit ETH den Markt.', 'advice'],
  ['Proof of Calm ist bei keiner Finanzaufsicht registriert und wird von keiner beaufsichtigt.', 'advice'],
  ['Leider ist ein Fehler aufgetreten.', 'filler'],
  ['Bitte wählen Sie ein Datum.', 'filler'],
  ['Eine Rendite von 8 % pro Jahr', 'return-percentage'],
  ['Bis zu 12 % Rendite im Jahr', 'return-percentage'],
  ['Die durchschnittliche Jahresrendite beträgt 50 %.', 'return-percentage'],
  ['Verdienen Sie bis zu 8 % mit Staking.', 'return-percentage'],
  ['Mit Staking können Sie 5 % im Jahr verdienen.', 'return-percentage'],
  ['Kursgewinne von über 300 % seit 2020', 'return-percentage'],
  ['Tagesgeld bringt 3 % Zinsen.', 'return-percentage'],
  ['Freuen Sie sich auf Gewinne von 25 %.', 'return-percentage'],
  ['8 % Rendite p. a. mit Staking.', 'return-percentage'],
  ['Ein Plus von 48 % seit Januar.', 'return-percentage'],
  ['ein Plus von 48 %', 'return-percentage'],
  ['Setzen Sie auf Renditen von 8 %.', 'return-percentage'],
  ['Rendite: +8 %', 'return-percentage'],
  ['Eine Rendite um die 8 %.', 'return-percentage'],
  ['Die Rendite liegt bei 7 Prozent.', 'return-percentage'],
  ['Die Anlage wirft 5 % im Jahr ab.', 'return-percentage'],
  ['bei der BaFin registriert', 'advice'],
  ['registriert bei der BaFin', 'advice'],
  ['Eingetragen bei der Finanzaufsicht.', 'advice'],
  ['Unter Aufsicht der BaFin.', 'advice'],
  ['Ein sicherem Gefühl.', 'advice'],
  ['Zinserträge von 3 %', 'return-percentage'],
  ['Ein Ertrag von 3 %', 'return-percentage'],
  ['durch die BaFin registriert', 'advice'],
  ['Proof of Calm ist bei der BaFin als Anbieter registriert.', 'advice'],
  ['Von der BaFin offiziell als Dienstleister eingetragen.', 'advice'],
  ['Proof of Calm ist bei der BaFin als Krypto-Dienstleister registriert.', 'advice'],
  ['Proof of Calm ist bei der BaFin als MiCA-Anbieter registriert.', 'advice'],
  ['Proof of Calm ist bei der BaFin seit 2024 registriert.', 'advice'],
];

// Each tax or status line the rows refuse, then its rewording, which must pass.
const ROWS_REWORDED: [string, string][] = [
  ['Steuersatz auf Kursgewinne: 25 %', 'Kursgewinne werden mit 25 % besteuert.'],
  ['Die Steuer auf Kapitalerträge beträgt 25 %.', 'Kapitalerträge werden mit 25 % besteuert.'],
  ['Steuersatz auf Gewinne: 25 %.', 'Gewinne werden mit 25 % besteuert.'],
  ['Gewinne: 25 % Abgeltungsteuer.', 'Gewinne werden mit 25 % Abgeltungsteuer besteuert.'],
  ['Die Besteuerung der Gewinne beträgt 25 %.', 'Gewinne werden mit 25 % besteuert.'],
  ['Gewinne sind 100 % steuerfrei.', 'Gewinne sind vollständig steuerfrei.'],
  [
    'Es gilt keine Erlaubnispflicht; keine Aufsichtsbehörde.',
    'Keine Tätigkeit, die der behördlichen Zulassung bedarf; keine Aufsichtsbehörde.',
  ],
  [
    'Proof of Calm ist bei keiner Finanzaufsicht registriert und wird von keiner beaufsichtigt.',
    'Proof of Calm ist bei keiner Finanzaufsichtsbehörde registriert und unterliegt keiner Finanzaufsicht.',
  ],
  [
    'Wenn Sie nicht sicher sind, beginnt die Haltefrist später.',
    'Im Zweifel startet der späteste mögliche Tag nie zu früh eine Haltefrist.',
  ],
  ['Sind Sie sicher?', 'Wirklich alles löschen?'],
  ['Nur Ziffern sind zugelassen.', 'Nur Ziffern möglich.'],
  ['… Ihrem API-Key.', '… Ihrem API-Schlüssel.'],
];

describe('the German word rows, filler words and gain patterns (docs/CONTENT-STYLE.md §2)', () => {
  it.each(ROWS_REFUSED)('refuses %j as %s', (text, rule) => {
    expect(findBanned(text).map((finding) => finding.rule)).toContain(rule);
  });

  it('refuses each reworded line and passes its rewording', () => {
    for (const [text, rewording] of ROWS_REWORDED) {
      expect(findBanned(text), text).not.toEqual([]);
      expect(findBanned(rewording), rewording).toEqual([]);
    }
  });

  it('passes a percentage with any other word before the gain noun: tax prose', () => {
    for (const text of [
      'Kapitalerträge werden mit 25 % besteuert',
      '25 % Abgeltungsteuer auf Kapitalerträge',
      'Die Kapitalertragsteuer beträgt 25 %.',
      'Die Gewinner des Jahres stiegen um 40 %.',
      'Proof of Calm Plus kostet 3 € im Monat.',
    ]) {
      expect(findBanned(text), text).toEqual([]);
    }
  });

  // Vertrag and Übertrag end in "ertrag" but name no gain. A savings contract's rate (Sparvertrag) is no comparison
  // with Tagesgeld, Festgeld or Sparbuch either, so no row refuses it; the copy review (§8) catches a comparison.
  it('reads Vertrag, Übertrag and their compounds as no gain noun', () => {
    for (const text of [
      'Laut Vertrag 2 % Gebühr.',
      'Der Kaufvertrag: 2 % Gebühr.',
      'Laut Mietvertrag von 3 %.',
      'Übertrag 2 %',
      'Übertragung 2 %',
      'Sparvertrag mit 3 %',
      'Verträge von 3 %',
    ]) {
      expect(findBanned(text), text).toEqual([]);
    }
  });

  it('reads super as a whole word, so the English words that begin with it pass', () => {
    expect(rules('Das ist super.')).toEqual(['advice: super']);
    for (const text of [
      'Ask your supervisor.',
      'Supervisory authorities publish warnings.',
      'A superannuation fund.',
    ]) {
      expect(findBanned(text), text).toEqual([]);
    }
  });

  it('reports a registration claim with the regulator as written, the participle first or last', () => {
    expect(rules('Proof of Calm ist bei der BaFin registriert.')).toEqual(['advice: bei der BaFin registriert']);
    expect(rules('Registriert bei der Bundesanstalt für Finanzdienstleistungsaufsicht.')).toEqual([
      'advice: Registriert bei der Bundesanstalt für Finanzdienstleistungsaufsicht',
    ]);
  });

  it('counts a hyphenated word or a number as one of the three words between the regulator and the participle', () => {
    expect(rules('Proof of Calm ist bei der BaFin als Krypto-Dienstleister registriert.')).toEqual([
      'advice: bei der BaFin als Krypto-Dienstleister registriert',
    ]);
    expect(rules('Proof of Calm ist bei der BaFin seit 2024 registriert.')).toEqual([
      'advice: bei der BaFin seit 2024 registriert',
    ]);
  });

  // §4 and §10: a numeral joins its unit with the no-break hyphen U+2011 in text a screen shows, so a gap word
  // takes it as an inner hyphen as well as U+002D.
  it('counts a word with the no-break hyphen as one of the three words, as its ASCII form', () => {
    const noBreak = 'Proof of Calm ist bei der BaFin als 24‑Stunden‑Anbieter registriert.';
    expect(rules(noBreak)).toEqual(['advice: bei der BaFin als 24‑Stunden‑Anbieter registriert']);
    const ascii = findBanned(noBreak.replaceAll('‑', '-'));
    expect(findBanned(noBreak).map((finding) => ({ ...finding, match: finding.match.replaceAll('‑', '-') })))
      .toEqual(ascii);
    expect(ascii).toHaveLength(1);
  });

  // The bound: four words between the regulator and the participle pass the lint; the copy review (§8) reads
  // the longer claims.
  it('passes four words between the regulator and the participle', () => {
    expect(findBanned('Proof of Calm ist bei der BaFin als ein großer Krypto-Anbieter registriert.')).toEqual([]);
  });
});

// §2's German table, read from the document itself.
const styleGuide = readFileSync(new URL('../../../../docs/CONTENT-STYLE.md', import.meta.url), 'utf8');
const section2 = styleGuide.slice(styleGuide.indexOf('## 2. '), styleGuide.indexOf('## 3. '));
const section10 = styleGuide.slice(styleGuide.indexOf('## 10. '));
const backticked = (text: string) => [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? '');
// A top-level bullet of §2's German rows, from the line that opens it to the next top-level bullet.
const germanRows = section2.slice(section2.indexOf('The German rows'));
const bullet = (opening: string) => {
  const start = germanRows.indexOf(opening);
  const end = germanRows.indexOf('\n- ', start + 1);
  return start === -1 ? '' : germanRows.slice(start, end);
};
// The bullet's list of rows, then its paragraph of praise, reassurance and filler words, every word of which fails.
const [rowList = '', ...rowParagraphs] = bullet('- Every row above has its German form').split('\n\n');
// A registration claim's sub-bullet names its parts; only its examples, in the last brackets, are whole claims.
const rowWords = [
  ...rowList
    .split(/\n {2}- /u)
    .flatMap((item) =>
      item.startsWith('a registration claim') ? backticked(item.slice(item.lastIndexOf('('))) : backticked(item),
    ),
  ...backticked(rowParagraphs.join('\n')),
];
const keptOff = backticked(bullet('- Words with an everyday sense').split('\n  - ')[0] ?? '');
const statusStatement = /`(Proof of Calm ist bei keiner[^`]*)`/u.exec(section10)?.[1] ?? '';

describe('§2’s German row and kept-off bullets and §10’s statement on status, read from the document', () => {
  it('finds the bullets and the statement', () => {
    expect(rowWords.length).toBeGreaterThan(100);
    expect(keptOff.length).toBeGreaterThan(30);
    // The authority, then the supervision, as pt-PT's «supervisor … supervisão financeira».
    expect(statusStatement).toBe(
      'Proof of Calm ist bei keiner Finanzaufsichtsbehörde registriert und unterliegt keiner Finanzaufsicht',
    );
  });

  it.each(rowWords)('refuses the row word %j', (word) => {
    expect(findBanned(word)).not.toEqual([]);
  });

  it.each(keptOff)('passes the kept-off word %j in a neutral line', (word) => {
    expect(findBanned(`Im Text steht ${word} am Ende.`)).toEqual([]);
  });

  it('passes §10’s statement on status', () => {
    expect(findBanned(statusStatement)).toEqual([]);
  });
});
const table = section2.slice(section2.indexOf('| Refused (German) | Write instead |'));
const rows = table
  .split('\n')
  .slice(2)
  .map((line) => line.trim())
  .filter(
    (line, index, lines) => line.startsWith('|') && lines.slice(0, index).every((before) => before.startsWith('|')),
  )
  .map((line) =>
    line
      .split('|')
      .slice(1, -1)
      .map((cell) => [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? '')),
  );

describe('§2’s German table', () => {
  it('has its rows, each with an example on both sides', () => {
    expect(section2).toContain('| Refused (German) | Write instead |');
    expect(rows.length).toBeGreaterThanOrEqual(10);
    for (const [refused = [], instead = []] of rows) {
      expect(refused.length * instead.length).toBeGreaterThan(0);
    }
  });

  it.each(rows)('refuses %j and passes %j', (refused, instead) => {
    for (const text of refused) expect(findBanned(text), text).not.toEqual([]);
    for (const text of instead) expect(findBanned(text), text).toEqual([]);
  });
});
