import { normaliseer } from './classificatie.js';
import { dagenTussen, plusDagen } from './planning.js';

/**
 * De kolom Levertijd in de Boodschappenlijst is vrije tekst: "3 werkdagen",
 * "Volgende dag in huis", "langste 4 weken, meerdere baden", "Begin september".
 * Hier wordt daar een aantal dagen uit gelezen.
 *
 * Levert het niets op, dan komt er null uit en geeft de app geen waarschuwing.
 * Een verzonnen levertijd is erger dan geen levertijd.
 */

const MAANDEN = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

/** "begin" -> de 1e, "medio" -> de 15e, "eind" -> de 25e. */
const DEEL_VAN_MAAND: [RegExp, number][] = [
  [/\bbegin\b/, 1], [/\bmedio\b/, 15], [/\bhalverwege\b/, 15],
  [/\beind\b/, 25], [/\blaat\b/, 25],
];

/**
 * Elke eenheid staat er voluit in, enkelvoud en meervoud apart. Niet op een
 * beginstuk matchen: het meervoud van "week" is "weken", niet "weeken", dus
 * `'weken'.startsWith('week')` is onwaar en levert stilletjes dagen op.
 */
const PER_EENHEID: Record<string, number> = {
  werkdag: 1, werkdagen: 1, dag: 1, dagen: 1,
  week: 7, weken: 7,
  maand: 30, maanden: 30,
};

export interface Levertijd {
  dagen: number | null;
  /** Hoe de app eraan komt, zodat de app kan laten zien waarom. */
  uitleg: string;
}

export function leesLevertijd(tekst: string, vandaag: string): Levertijd {
  const t = normaliseer(tekst);
  if (!t) return { dagen: null, uitleg: 'geen levertijd ingevuld' };

  // "Begin september" is geen levertijd maar een leverdatum.
  const maandIndex = MAANDEN.findIndex((m) => new RegExp(`\\b${m}\\b`).test(t));
  if (maandIndex >= 0) {
    const dagInMaand = DEEL_VAN_MAAND.find(([p]) => p.test(t))?.[1] ?? 15;
    const jaarNu = Number(vandaag.slice(0, 4));
    // Een maand die al voorbij is, slaat op volgend jaar.
    const kandidaat = (jaar: number) =>
      `${jaar}-${String(maandIndex + 1).padStart(2, '0')}-${String(dagInMaand).padStart(2, '0')}`;
    const datum = kandidaat(jaarNu) >= vandaag ? kandidaat(jaarNu) : kandidaat(jaarNu + 1);
    return {
      dagen: dagenTussen(vandaag, datum),
      uitleg: `geleverd rond ${datum}, dus ${dagenTussen(vandaag, datum)} dagen vanaf nu`,
    };
  }

  // "volgende dag in huis", "de dag erna"
  if (/\bvolgende dag\b|\bdag erna\b|\bmorgen\b/.test(t)) {
    return { dagen: 1, uitleg: 'volgende dag in huis' };
  }

  // Alle getallen met hun eenheid; bij meerdere houden we de langste aan,
  // want dat is de termijn waar je op moet plannen.
  const treffers = [...t.matchAll(/(\d+)\s*(werkdag|werkdagen|dag|dagen|week|weken|maand|maanden)\b/g)];
  if (treffers.length) {
    const inDagen = treffers.map((m) => Number(m[1]) * PER_EENHEID[m[2]!]!);
    const langste = Math.max(...inDagen);
    return {
      dagen: langste,
      uitleg: treffers.length > 1
        ? `langste van ${inDagen.join(', ')} dagen uit "${tekst.trim()}"`
        : `${langste} dagen uit "${tekst.trim()}"`,
    };
  }

  return { dagen: null, uitleg: `"${tekst.trim()}" is geen termijn die de app kan lezen` };
}

/** Wanneer moet dit uiterlijk besteld zijn om op tijd binnen te zijn? */
export function uitersteBesteldatum(nodigOp: string, levertijdDagen: number): string {
  return plusDagen(nodigOp, -levertijdDagen);
}
