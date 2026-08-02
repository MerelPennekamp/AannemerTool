import type { Werksoort } from './fasen.js';
import { faseVan, faseRang } from './fasen.js';

/**
 * Uit een taaknaam afleiden wat voor werk het is en in welke ruimte.
 *
 * De namen in de bronsheet zijn met de hand getypt en bevatten typo's
 * ("Schoortseen", "Plaffonds", "Stucador"). De patronen hieronder zijn daarop
 * afgestemd; waar een woord verkeerd gespeld is, vangt een ander woord uit
 * dezelfde taak het meestal op.
 *
 * Herkent de app niets, dan verzint hij niets: werksoort blijft null en de taak
 * belandt in de lijst 'niet ingedeeld'.
 */

/** Kleine letters, geen leestekens, enkele spaties. */
export function normaliseer(tekst: string): string {
  return tekst
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Sleutel waarop een ververs taken terugvindt. */
export function sleutelVan(naam: string): string {
  return normaliseer(naam);
}

type Patroon = RegExp[];

/**
 * Volgorde is betekenisvol: de eerste die raakt wint. Werkwoorden die over
 * voorbereiding gaan staan bovenaan, want "Vloerverwarming badkamer bestellen"
 * is een besteltaak, geen installatietaak.
 */
const WERKSOORT_PATRONEN: [Werksoort, Patroon][] = [
  ['voorbereiding', [
    /\bbestel\w*/, /\bbesteld\w*/, /\buitzoeken\b/, /\bzoeken\b/, /\bgezocht\b/,
    /\bregelen\b/, /\bgeregeld\b/, /\bfixen\b/, /\bsprokkelen\b/, /\boffert\w*/,
    /\bbenaderen\b/, /\baanvragen\b/, /\bhuren\b/, /\breserveren\b/, /\buitkiezen\b/,
  ]],
  ['onderzoek', [
    /\binspecti\w*/, /\bonderzoek\w*/, /\bontwerp\w*/, /\bontworpen\b/,
    /\btekening\w*/, /\bopgeleverd\b/, /\bvergunning\w*/, /\bsondering\w*/,
    /\bmeting\w*/, /\bkeuring\w*/, /\badvies\b/, /\bcamera\b/,
  ]],
  ['sloop', [
    /\bsloop\w*/, /\bslopen\b/, /\bverwijder\w*/, /\beruit\b/, /\buitbreken\b/,
    /\bafbreken\b/, /\bafvoeren\b/, /\bdemonteren\b/, /\bweghalen\b/, /\bstrippen\b/,
  ]],
  ['verhuizing', [/\bverhuiz\w*/, /\bverhuis\w*/]],
  ['elektra', [
    /\belektr\w*/, /\belectr\w*/, /\bmeterkast\b/, /\bgroepenkast\b/,
    /\bfr?e?ezen\b/, /\bfrezen\b/, /\bbedrading\b/, /\bstopcontact\w*/,
    /\bschakelaar\w*/, /\bdraden\b/,
  ]],
  ['loodgieterswerk', [
    /\bleiding\w*/, /\briool\w*/, /\bafvoer\b/, /\bwaterleiding\w*/, /\bloodgieter\w*/,
  ]],
  ['vloerverwarming', [/\bvloerverwarming\w*/]],
  ['verwarming', [/\bcv\b/, /\bketel\w*/, /\bradiator\w*/, /\bverwarming\b/]],
  ['ventilatie', [/\bventilati\w*/, /\bafzuig\w*/]],
  ['isolatie', [/\bisoler\w*/, /\bisolati\w*/, /\bgeisoleerd\b/]],
  // Let op: geen kaal /\bmuur\w*/. Een muur is bij stucwerk en schilderwerk het
  // oppervlak, niet het werk ("Stucwerk 1e etage (muren en plafonds)"). Een
  // nieuw te bouwen muur heet in deze sheet altijd "muurtje", en "Wc muur +
  // deur(frame)" wordt al door deur/frame opgepikt.
  ['ruwbouw', [
    /\bmuurtje\w*/, /\bboog\b/, /\bdichten\b/, /\bgat\b/, /\btrap\b/,
    /\bverzetten\b/, /\bverplaatsen\b/, /\baanbouw\w*/, /\bkozijn\w*/, /\bdeur\w*/,
    /\bframe\b/, /\bwand\w*/, /\bconstructie\b/, /\bfundering\b/, /\bschoorsteen\w*/,
  ]],
  ['stucwerk', [/\bstuc\w*/, /\bstukado\w*/, /\bstuken\b/, /\bpleister\w*/, /\bgips\w*/]],
  ['tegelwerk', [/\bbetegel\w*/, /\btegel\w*/]],
  ['vloer', [/\bdekvloer\w*/, /\bondervloer\w*/, /\bvloer\w*/, /\bplint\w*/, /\blaminaat\b/, /\bparket\b/]],
  ['schilderwerk', [/\bschilder\w*/, /\bverven\b/, /\bverf\b/, /\blakken\b/, /\bsausen\b/]],
  ['sanitair', [
    /\bwc\b/, /\btoilet\w*/, /\bdouche\w*/, /\bbad\b/, /\bligbad\b/, /\bwastafel\w*/,
    /\bwasbak\w*/, /\bkraan\b/, /\bmeubel\w*/, /\bsanitair\b/, /\bhanddoek\w*/,
  ]],
  ['keuken', [/\bkeuken\w*/]],
];

export type Ruimte =
  | 'badkamer' | 'wc' | '1e-etage' | 'beneden' | 'hal'
  | 'keuken' | 'dak' | 'aanbouw' | 'tuin';

/** Een taak mag in meerdere ruimtes vallen: "leidingen badkamer (boven) en wc (beneden)". */
const RUIMTE_PATRONEN: [Ruimte, Patroon][] = [
  ['badkamer', [/\bbadkamer\w*/]],
  ['wc', [/\bwc\b/, /\btoilet\w*/]],
  ['1e-etage', [
    /\b1e etage\b/, /\beerste etage\b/, /\b1e verdieping\b/, /\beerste verdieping\b/,
    /\bbovenverdieping\b/, /\bboven\b/,
  ]],
  ['beneden', [/\bbeneden\b/, /\bbegane grond\b/, /\bbenedenverdieping\b/]],
  ['hal', [/\bhal\b/, /\bgang\b/, /\boverloop\b/]],
  ['keuken', [/\bkeuken\w*/]],
  ['dak', [/\bdak\w*/, /\bschoorsteen\w*/, /\bzolder\b/]],
  ['aanbouw', [/\baanbouw\w*/]],
  ['tuin', [/\btuin\w*/]],
];

export interface Indeling {
  werksoort: Werksoort | null;
  /** Andere werksoorten die ook raakten, in volgorde van prioriteit. */
  alternatieven: Werksoort[];
  ruimtes: Ruimte[];
  /** De ruimte die de app als hoofdruimte toont. */
  hoofdruimte: Ruimte | null;
}

function raakt(tekst: string, patronen: Patroon): boolean {
  return patronen.some((p) => p.test(tekst));
}

export function deelIn(naam: string): Indeling {
  const t = normaliseer(naam);

  const gevonden: Werksoort[] = [];
  for (const [werksoort, patronen] of WERKSOORT_PATRONEN) {
    if (raakt(t, patronen)) gevonden.push(werksoort);
  }

  const ruimtes: Ruimte[] = [];
  for (const [ruimte, patronen] of RUIMTE_PATRONEN) {
    if (raakt(t, patronen)) ruimtes.push(ruimte);
  }

  return {
    werksoort: gevonden[0] ?? null,
    alternatieven: gevonden.slice(1),
    ruimtes,
    hoofdruimte: ruimtes[0] ?? null,
  };
}

/** Handig voor de regels: waar zit deze taak in de standaardvolgorde? */
export function rangVan(indeling: Indeling): number | null {
  if (!indeling.werksoort) return null;
  return faseRang(faseVan(indeling.werksoort));
}
