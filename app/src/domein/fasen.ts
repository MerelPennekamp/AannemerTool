/**
 * De standaardvolgorde uit het plan. Geldt per ruimte, niet voor het hele huis:
 * de badkamer mag al gestuukt worden terwijl beneden nog gesloopt wordt.
 */
export const FASEN = [
  'onderzoek',
  'sloop',
  'ruwbouw',
  'installatie',
  'afwerking',
  'inrichting',
] as const;

export type Fase = (typeof FASEN)[number];

export function faseRang(fase: Fase): number {
  return FASEN.indexOf(fase);
}

/** Werksoorten zoals ze in de taaknamen voorkomen, elk in precies één fase. */
export const WERKSOORTEN = {
  voorbereiding: 'onderzoek',
  onderzoek: 'onderzoek',
  sloop: 'sloop',
  ruwbouw: 'ruwbouw',
  isolatie: 'ruwbouw',
  elektra: 'installatie',
  loodgieterswerk: 'installatie',
  vloerverwarming: 'installatie',
  verwarming: 'installatie',
  ventilatie: 'installatie',
  stucwerk: 'afwerking',
  tegelwerk: 'afwerking',
  vloer: 'afwerking',
  schilderwerk: 'afwerking',
  sanitair: 'inrichting',
  keuken: 'inrichting',
  verhuizing: 'inrichting',
} as const satisfies Record<string, Fase>;

export type Werksoort = keyof typeof WERKSOORTEN;

export function faseVan(werksoort: Werksoort): Fase {
  return WERKSOORTEN[werksoort];
}
