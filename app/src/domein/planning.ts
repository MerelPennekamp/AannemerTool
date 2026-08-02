/**
 * Van taken en afhankelijkheden naar datums.
 *
 * De meeste taken in de bronsheet hebben geen datum, alleen een duur. De app
 * leidt de vroegst mogelijke datums af uit de volgorde, en rekent uit welke
 * taken op het langste pad liggen — dat is wat de Gantt laat zien.
 *
 * Alle dagen zijn werkdagen; weekenden worden niet apart behandeld. Dat staat
 * zo in het plan.
 */

export interface TaakVoorPlanning {
  id: number;
  naam: string;
  duurDagen: number | null;
  vasteStart: string | null;
  vasteEind: string | null;
  fase: string | null;
  status: string;
}

export interface Koppel { voorId: number; naId: number }

export interface Gepland {
  id: number;
  start: string;
  eind: string;
  duur: number;
  /** De duur stond niet in de sheet en is op een dag gezet. */
  duurGeschat: boolean;
  /** De startdatum komt uit de sheet en is niet berekend. */
  startVast: boolean;
  /** Ligt op het langste pad: schuift deze, dan schuift het einde mee. */
  kritiek: boolean;
  /** Aantal dagen dat deze taak mag opschuiven zonder het einde te raken. */
  speling: number;
}

export interface PlanningOpties {
  /** Wanneer Fase B mag beginnen. Standaard de sleuteloverdracht uit de sheet. */
  sleuteldatum: string;
  /** Ankerpunt voor taken die al voor de sleutel kunnen. */
  vandaag: string;
}

const DAG = 86_400_000;

export const naarDatum = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const naarIso = (d: Date) => d.toISOString().slice(0, 10);
export const plusDagen = (iso: string, n: number) => naarIso(new Date(naarDatum(iso).getTime() + n * DAG));
export const dagenTussen = (a: string, b: string) =>
  Math.round((naarDatum(b).getTime() - naarDatum(a).getTime()) / DAG);
const later = (a: string, b: string) => (a > b ? a : b);

/** Fase A hoort voor de sleutel; al het andere kan pas erna beginnen. */
function isVoorSleutel(fase: string | null): boolean {
  return /^fase a\b/i.test(fase ?? '');
}

/**
 * Topologische volgorde. Bij een kringloop krijgen we niet alle taken terug;
 * de aanroeper hoort dat te merken en te melden in plaats van door te rekenen.
 */
function topologisch(taken: TaakVoorPlanning[], koppels: Koppel[]): number[] {
  const inkomend = new Map<number, number>(taken.map((t) => [t.id, 0]));
  const na = new Map<number, number[]>();

  for (const k of koppels) {
    if (!inkomend.has(k.voorId) || !inkomend.has(k.naId)) continue;
    inkomend.set(k.naId, (inkomend.get(k.naId) ?? 0) + 1);
    na.set(k.voorId, [...(na.get(k.voorId) ?? []), k.naId]);
  }

  const rij = [...inkomend].filter(([, n]) => n === 0).map(([id]) => id);
  const uit: number[] = [];
  while (rij.length) {
    const id = rij.shift()!;
    uit.push(id);
    for (const volgende of na.get(id) ?? []) {
      const rest = (inkomend.get(volgende) ?? 1) - 1;
      inkomend.set(volgende, rest);
      if (rest === 0) rij.push(volgende);
    }
  }
  return uit;
}

export function berekenPlanning(
  taken: TaakVoorPlanning[],
  koppels: Koppel[],
  opties: PlanningOpties,
): { planning: Map<number, Gepland>; kringloop: boolean } {
  const perId = new Map(taken.map((t) => [t.id, t]));
  const volgorde = topologisch(taken, koppels);
  const kringloop = volgorde.length !== taken.length;

  const voorgangers = new Map<number, number[]>();
  const opvolgers = new Map<number, number[]>();
  for (const k of koppels) {
    if (!perId.has(k.voorId) || !perId.has(k.naId)) continue;
    voorgangers.set(k.naId, [...(voorgangers.get(k.naId) ?? []), k.voorId]);
    opvolgers.set(k.voorId, [...(opvolgers.get(k.voorId) ?? []), k.naId]);
  }

  const duurVan = (t: TaakVoorPlanning) => Math.max(0, t.duurDagen ?? 1);
  const start = new Map<number, string>();
  const eind = new Map<number, string>();

  // Voorwaartse pas: zo vroeg mogelijk.
  for (const id of volgorde) {
    const t = perId.get(id)!;
    const anker = isVoorSleutel(t.fase) ? opties.vandaag : later(opties.vandaag, opties.sleuteldatum);

    let vroegste = anker;
    for (const v of voorgangers.get(id) ?? []) {
      const eindVoorganger = eind.get(v);
      if (eindVoorganger) vroegste = later(vroegste, plusDagen(eindVoorganger, 1));
    }

    // Een datum uit de sheet is een afspraak, geen berekening: die telt.
    const s = t.vasteStart ?? vroegste;
    const duur = duurVan(t);
    const berekendEind = plusDagen(s, Math.max(0, duur - 1));

    start.set(id, s);
    eind.set(id, t.vasteEind ? later(t.vasteEind, berekendEind) : berekendEind);
  }

  // Achterwaartse pas: hoe laat mag het nog, zonder het project te verlengen.
  const projectEind = [...eind.values()].reduce((a, b) => later(a, b), opties.vandaag);
  const laatsteEind = new Map<number, string>();

  for (const id of [...volgorde].reverse()) {
    const kinderen = opvolgers.get(id) ?? [];
    if (kinderen.length === 0) {
      laatsteEind.set(id, projectEind);
      continue;
    }
    let grens = projectEind;
    for (const kind of kinderen) {
      const laatsteStartKind = plusDagen(
        laatsteEind.get(kind) ?? projectEind,
        -Math.max(0, duurVan(perId.get(kind)!) - 1),
      );
      const mag = plusDagen(laatsteStartKind, -1);
      if (mag < grens) grens = mag;
    }
    laatsteEind.set(id, grens);
  }

  const planning = new Map<number, Gepland>();
  for (const t of taken) {
    const s = start.get(t.id);
    if (!s) continue; // zat in een kringloop
    const e = eind.get(t.id)!;
    const speling = Math.max(0, dagenTussen(e, laatsteEind.get(t.id) ?? e));
    planning.set(t.id, {
      id: t.id,
      start: s,
      eind: e,
      duur: duurVan(t),
      duurGeschat: t.duurDagen === null,
      startVast: t.vasteStart !== null,
      kritiek: speling === 0,
      speling,
    });
  }
  return { planning, kringloop };
}
