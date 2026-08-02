import { describe, it, expect } from 'vitest';
import { deelIn, normaliseer } from '../src/domein/classificatie.js';
import { functiesVoorTaak, keuzePerFunctie, onbekendeFuncties } from '../src/domein/vaklui.js';
import type { Vakman } from '../src/domein/types.js';

/**
 * De negen functies zoals ze in het tabblad Vaklui voorkomen, met dezelfde
 * verdeling als in een echte lijst: veel kandidaten voor het grote werk, een
 * enkele voor het specialistische. De bedrijfsnamen zijn verzonnen; alleen de
 * functies en de aantallen doen ertoe voor deze tests.
 */
const PARTIJEN: [functie: string, bedrijf: string][] = [
  ...Array.from({ length: 7 }, (_, i): [string, string] =>
    ['Bouw partner', `Bouwbedrijf ${i + 1}`]),
  ...Array.from({ length: 7 }, (_, i): [string, string] =>
    ['Stucadoor', `Stukadoor ${i + 1}`]),
  ...Array.from({ length: 4 }, (_, i): [string, string] =>
    ['Asbest inspectie', `Asbestbureau ${i + 1}`]),
  ...Array.from({ length: 3 }, (_, i): [string, string] =>
    ['schoorsteen / dak', `Dakwerken ${i + 1}`]),
  ...Array.from({ length: 2 }, (_, i): [string, string] =>
    ['Riool onderzoek', `Rioolservice ${i + 1}`]),
  ['Bouw container', 'Containerdienst 1'],
  ['Loodgieter/installateur', 'Installatiebedrijf 1'],
  ['Elektricien', 'Elektrotechniek 1'],
  ['CV ketel', 'Ketelservice 1'],
];

const vaklui: Vakman[] = PARTIJEN.map(([functie, bedrijf]) => ({
  functie, bedrijf, benaderd: '', status: '', reactie: '',
  telefoon: '', link: '', prijs: '', via: '', gekozen: false,
}));

const functiesVan = (naam: string) => {
  const d = deelIn(naam);
  return functiesVoorTaak({ naam, werksoort: d.werksoort, ruimtes: d.ruimtes }, normaliseer(naam));
};

describe('functie uit de sheet naar taken', () => {
  it('kent elke functie die in de sheet voorkomt', () => {
    expect(onbekendeFuncties(vaklui)).toEqual([]);
  });

  it('koppelt stucwerk aan de stucadoor', () => {
    expect(functiesVan('Stucwerk gehele 1e etage (muren en plafonds)')).toContain('Stucadoor');
  });

  it('koppelt elektra aan de elektricien', () => {
    expect(functiesVan('Elektra freezen')).toContain('Elektricien');
  });

  it('koppelt de cv ketel aan de cv-partij, niet aan de loodgieter', () => {
    const f = functiesVan('Cv ketel installeren');
    expect(f).toContain('CV ketel');
    expect(f).not.toContain('Loodgieter/installateur');
  });

  it('koppelt de camera-inspectie aan riool, niet aan asbest', () => {
    const f = functiesVan('Camera inspectie');
    expect(f).toContain('Riool onderzoek');
    expect(f).not.toContain('Asbest inspectie');
  });

  it('houdt dakwerk bij de schoorsteen-partij', () => {
    expect(functiesVan('Slopen van de haard en schoorsteen')).toContain('schoorsteen / dak');
  });

  it('koppelt niets aan een taak die de app niet herkent', () => {
    expect(functiesVan('Sleutel overdracht')).toEqual([]);
  });
});

describe('gekozen versus nog aan het kiezen', () => {
  it('wijst niemand aan zolang niemand is aangekruist', () => {
    expect([...keuzePerFunctie(vaklui).values()].every((k) => k.gekozen === null)).toBe(true);
  });

  it('kiest ook niet vanzelf als er maar een kandidaat is', () => {
    // Er is maar een cv-partij, en die is nog niet benaderd.
    const cv = keuzePerFunctie(vaklui).get('CV ketel')!;
    expect(cv.kandidaten).toHaveLength(1);
    expect(cv.gekozen).toBeNull();
  });

  it('houdt alle zeven stucadoors als kandidaat', () => {
    expect(keuzePerFunctie(vaklui).get('Stucadoor')!.kandidaten).toHaveLength(7);
  });

  it('pikt een kruisje in de kolom Gekozen wel op', () => {
    const metKeuze = vaklui.map((v) => (v.bedrijf === 'Stukadoor 4' ? { ...v, gekozen: true } : v));
    expect(keuzePerFunctie(metKeuze).get('Stucadoor')!.gekozen?.bedrijf).toBe('Stukadoor 4');
  });
});
