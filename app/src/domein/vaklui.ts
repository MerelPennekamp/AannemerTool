import type { Werksoort } from './fasen.js';
import type { Ruimte } from './classificatie.js';
import type { Vakman } from './types.js';

/**
 * Vaklui koppelen aan taken. De koppeling zit in de kolom Functie van het
 * tabblad Vaklui: een stucadoor hoort bij stucwerk, een elektricien bij
 * elektra. Er is geen kolom die per taak een bedrijf aanwijst, en die is er ook
 * niet nodig — de functie is genoeg om te weten wie waarvoor in beeld is.
 *
 * Dit is de enige plek waar die vertaling staat. Komt er een functie bij in de
 * sheet, dan hoort hij hier ook bij, anders blijft hij ongekoppeld.
 */
export interface FunctieKoppeling {
  werksoorten: Werksoort[];
  /** Alleen taken in deze ruimtes; leeg betekent overal. */
  ruimtes?: Ruimte[];
  /** Extra eis aan de taaknaam, voor functies die op werksoort niet te scheiden zijn. */
  naamBevat?: RegExp;
}

export const FUNCTIES: Record<string, FunctieKoppeling> = {
  'Stucadoor': { werksoorten: ['stucwerk'] },
  'Elektricien': { werksoorten: ['elektra'] },
  'Loodgieter/installateur': { werksoorten: ['loodgieterswerk', 'sanitair', 'vloerverwarming'] },
  'CV ketel': { werksoorten: ['verwarming'] },
  'Asbest inspectie': { werksoorten: ['onderzoek'], naamBevat: /\basbest\w*/ },
  'Riool onderzoek': { werksoorten: ['onderzoek'], naamBevat: /\briool\w*|\bcamera\b/ },
  'schoorsteen / dak': { werksoorten: ['sloop', 'ruwbouw'], ruimtes: ['dak'] },
  'Bouw container': { werksoorten: ['sloop'] },
  // Een bouwpartner doet het grove werk; welke taken dat precies zijn hangt af
  // van wie het wordt, dus voorlopig alles wat met casco te maken heeft.
  'Bouw partner': { werksoorten: ['sloop', 'ruwbouw', 'isolatie'] },
};

export interface TaakVoorVaklui {
  naam: string;
  werksoort: Werksoort | null;
  ruimtes: Ruimte[];
}

/** Welke functies komen voor deze taak in aanmerking? */
export function functiesVoorTaak(taak: TaakVoorVaklui, genormaliseerdeNaam: string): string[] {
  if (!taak.werksoort) return [];
  const uit: string[] = [];

  for (const [functie, koppeling] of Object.entries(FUNCTIES)) {
    if (!koppeling.werksoorten.includes(taak.werksoort)) continue;
    if (koppeling.ruimtes && !koppeling.ruimtes.some((r) => taak.ruimtes.includes(r))) continue;
    if (koppeling.naamBevat && !koppeling.naamBevat.test(genormaliseerdeNaam)) continue;
    uit.push(functie);
  }
  return uit;
}

export interface VakmanKeuze {
  functie: string;
  /** Het bedrijf met een kruisje in de kolom Gekozen, als dat er is. */
  gekozen: Vakman | null;
  /** Alles wat voor deze functie in de sheet staat. */
  kandidaten: Vakman[];
}

/**
 * Per functie teruggeven wie er vaststaat en wie er nog in de race is.
 * Zolang niemand is aangekruist toont de app de kandidaten, zonder er zelf een
 * uit te kiezen — ook niet als er maar één kandidaat is. Enige kandidaat zijn
 * is geen keuze: die ene kan nog steeds onbenaderd of afgevallen zijn.
 */
export function keuzePerFunctie(vaklui: Vakman[]): Map<string, VakmanKeuze> {
  const uit = new Map<string, VakmanKeuze>();

  for (const vakman of vaklui) {
    const bestaand = uit.get(vakman.functie) ?? {
      functie: vakman.functie,
      gekozen: null,
      kandidaten: [],
    };
    bestaand.kandidaten.push(vakman);
    if (vakman.gekozen) bestaand.gekozen = vakman;
    uit.set(vakman.functie, bestaand);
  }
  return uit;
}

/** Functies uit de sheet die hierboven nog geen vertaling hebben. */
export function onbekendeFuncties(vaklui: Vakman[]): string[] {
  return [...new Set(vaklui.map((v) => v.functie))].filter((f) => f && !(f in FUNCTIES));
}
