import { normaliseer } from './classificatie.js';
import { dagenTussen } from './planning.js';
import type { Gepland } from './planning.js';
import { leesLevertijd, uitersteBesteldatum } from './levertijd.js';

/**
 * De drie dingen die de app doorrekent en meldt. Waarschuwingen zijn advies:
 * de app past nooit zelf datums aan, en meldt alleen wat misgaat.
 *
 * Waar de gegevens ontbreken om iets uit te rekenen, blijft het stil. Een
 * waarschuwing op een verzonnen datum is erger dan geen waarschuwing.
 */

export type Ernst = 'kritiek' | 'let-op';

export interface Waarschuwing {
  soort: 'volgorde' | 'krappe-planning' | 'levertijd';
  ernst: Ernst;
  taakId: number | null;
  bestellingId: number | null;
  kop: string;
  uitleg: string;
}

export interface TaakVoorControle {
  id: number;
  naam: string;
  vasteStart: string | null;
  vasteEind: string | null;
  duurDagen: number | null;
  status: string;
}

export interface BestellingVoorControle {
  id: number;
  naam: string;
  levertijdTekst: string;
  datumNodig: string | null;
}

export interface Koppel { voorId: number; naId: number }

/** Hoeveel dagen van tevoren de app aan een besteldatum begint te trekken. */
const NADERT_BINNEN_DAGEN = 7;

/**
 * Regel 1 — volgorde. De planning zet een taak nooit voor zijn voorganger,
 * dus dit slaat alleen aan als er een datum uit de sheet tussen zit die niet
 * kan. Precies het geval dat je wilt zien.
 */
function volgordeGeschonden(
  taken: TaakVoorControle[], koppels: Koppel[], planning: Map<number, Gepland>,
): Waarschuwing[] {
  const perId = new Map(taken.map((t) => [t.id, t]));
  const uit: Waarschuwing[] = [];

  for (const k of koppels) {
    const voor = planning.get(k.voorId), na = planning.get(k.naId);
    const voorTaak = perId.get(k.voorId), naTaak = perId.get(k.naId);
    if (!voor || !na || !voorTaak || !naTaak) continue;
    if (voorTaak.status === 'klaar') continue;
    if (na.start > voor.eind) continue;

    const dagen = dagenTussen(na.start, voor.eind) + 1;
    uit.push({
      soort: 'volgorde',
      ernst: 'kritiek',
      taakId: naTaak.id,
      bestellingId: null,
      kop: `"${naTaak.naam}" begint voordat "${voorTaak.naam}" klaar is`,
      uitleg: `${naTaak.naam} staat op ${na.start}, maar ${voorTaak.naam} loopt tot en met `
        + `${voor.eind}. Dat is ${dagen} dag(en) overlap.`,
    });
  }
  return uit;
}

/** Regel 2 — krappe planning: minder dagen in het venster dan de taak nodig heeft. */
function krappePlanning(taken: TaakVoorControle[]): Waarschuwing[] {
  const uit: Waarschuwing[] = [];

  for (const t of taken) {
    if (!t.vasteStart || !t.vasteEind || t.duurDagen === null) continue;
    if (t.status === 'klaar') continue;

    const venster = dagenTussen(t.vasteStart, t.vasteEind) + 1;
    if (venster >= t.duurDagen) continue;

    uit.push({
      soort: 'krappe-planning',
      ernst: 'let-op',
      taakId: t.id,
      bestellingId: null,
      kop: `"${t.naam}" heeft meer dagen nodig dan er staan`,
      uitleg: `Van ${t.vasteStart} tot en met ${t.vasteEind} is ${venster} dag(en), `
        + `en er is ${t.duurDagen} dag(en) werk ingeschat.`,
    });
  }
  return uit;
}

/** Woorden die te algemeen zijn om een bestelling aan een taak te koppelen. */
const TE_ALGEMEEN = new Set(['set', 'meerdere', 'opties', 'stuks', 'nieuw']);

const kernwoorden = (naam: string) =>
  normaliseer(naam).split(' ').filter((w) => w.length > 2 && !TE_ALGEMEEN.has(w));

/**
 * Een bestelling bij de taak zoeken die hem gebruikt. Alleen als elk woord uit
 * de bestelnaam ook in de taaknaam staat: "Badkamer meubel" hoort bij
 * "Badkamer meubel", "Douche" bij "Douche hangen". Lukt dat niet, dan koppelt
 * de app niets, want een verkeerde koppeling levert een verkeerde datum op.
 */
export function zoekTaakVoorBestelling(
  bestelling: { naam: string }, taken: TaakVoorControle[], planning: Map<number, Gepland>,
): TaakVoorControle | null {
  const woorden = kernwoorden(bestelling.naam);
  if (!woorden.length) return null;

  const passend = taken.filter((t) => {
    const inTaak = new Set(normaliseer(t.naam).split(' '));
    return woorden.every((w) => inTaak.has(w));
  });
  if (!passend.length) return null;

  // Meerdere treffers: de vroegste bepaalt wanneer het er moet zijn.
  return passend.reduce((vroegste, t) => {
    const a = planning.get(t.id)?.start, b = planning.get(vroegste.id)?.start;
    if (!a) return vroegste;
    if (!b) return t;
    return a < b ? t : vroegste;
  });
}

/** Regel 3 — levertijd: de uiterste besteldatum is verstreken of nadert. */
function levertijden(
  bestellingen: BestellingVoorControle[], taken: TaakVoorControle[],
  planning: Map<number, Gepland>, vandaag: string,
): Waarschuwing[] {
  const uit: Waarschuwing[] = [];

  for (const b of bestellingen) {
    const { dagen: levertijd } = leesLevertijd(b.levertijdTekst, vandaag);
    if (levertijd === null) continue;

    // "Datum nodig" uit de sheet gaat voor; anders de start van de taak die
    // het materiaal gebruikt.
    const taak = b.datumNodig ? null : zoekTaakVoorBestelling(b, taken, planning);
    const nodigOp = b.datumNodig ?? (taak ? planning.get(taak.id)?.start ?? null : null);
    if (!nodigOp) continue;
    if (taak?.status === 'klaar') continue;

    const uiterlijk = uitersteBesteldatum(nodigOp, levertijd);
    const speling = dagenTussen(vandaag, uiterlijk);
    if (speling > NADERT_BINNEN_DAGEN) continue;

    const waarvoor = taak ? ` voor "${taak.naam}"` : '';
    uit.push({
      soort: 'levertijd',
      ernst: speling < 0 ? 'kritiek' : 'let-op',
      taakId: taak?.id ?? null,
      bestellingId: b.id,
      kop: speling < 0
        ? `"${b.naam}" had al besteld moeten zijn`
        : `"${b.naam}" moet binnen ${speling} dag(en) besteld worden`,
      uitleg: `Nodig op ${nodigOp}${waarvoor}, levertijd ${levertijd} dagen, `
        + `dus uiterlijk bestellen op ${uiterlijk}.`,
    });
  }
  return uit;
}

export function bepaalWaarschuwingen(
  taken: TaakVoorControle[],
  koppels: Koppel[],
  planning: Map<number, Gepland>,
  bestellingen: BestellingVoorControle[],
  vandaag: string,
): Waarschuwing[] {
  const alles = [
    ...volgordeGeschonden(taken, koppels, planning),
    ...krappePlanning(taken),
    ...levertijden(bestellingen, taken, planning, vandaag),
  ];
  // Het ergste bovenaan, verder op alfabet zodat de volgorde niet schommelt.
  const rang = (e: Ernst) => (e === 'kritiek' ? 0 : 1);
  return alles.sort((a, b) => rang(a.ernst) - rang(b.ernst) || a.kop.localeCompare(b.kop));
}
