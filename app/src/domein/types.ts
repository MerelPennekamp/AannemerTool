/**
 * De vorm van wat er uit de bronsheet komt, los van hoe het opgehaald wordt.
 *
 * Deze bestanden stonden eerst vast aan de xlsx-lezer op de server. Nu de app
 * de Sheets API rechtstreeks aanroept, mag het domein daar niets van weten:
 * hier staan alleen de records, zonder bibliotheek eromheen.
 */

export interface FaseTaak {
  naam: string;
  fase: string;
  duurDagen: number | null;
}

export interface DatumRegel {
  naam: string;
  start: string | null;
  eind: string | null;
  duurDagen: number | null;
}

export interface Vakman {
  functie: string;
  bedrijf: string;
  benaderd: string;
  status: string;
  reactie: string;
  telefoon: string;
  link: string;
  prijs: string;
  via: string;
  /**
   * Uit een optionele kolom "Gekozen" in het tabblad Vaklui. Ontbreekt die
   * kolom, dan is dit overal false en kiest de app zelf niemand.
   */
  gekozen: boolean;
}

export interface Bestelling {
  naam: string;
  leverancier: string;
  levertijd: string;
  link: string;
  prijs: string;
  datumNodig: string | null;
}

export interface BudgetCategorie {
  code: string;
  naam: string;
  blok: 'verbouwkosten' | 'allocatie';
  begroot: number | null;
  herzien: number | null;
}

export interface Uitgave {
  datum: string | null;
  bedrag: number;
  ontvanger: string;
  categorieRuw: string;
  categorieCode: string | null;
  omschrijving: string;
  bron: string;
  betaler: string;
  factuur: string;
}

/** Alles wat de app uit de bronsheet haalt, in een keer. */
export interface Bron {
  fases: FaseTaak[];
  datums: DatumRegel[];
  vaklui: Vakman[];
  bestellingen: Bestelling[];
  begroting: BudgetCategorie[];
  uitgaven: Uitgave[];
}
