import { describe, it, expect } from 'vitest';
import rasters from './fixtures/bron-voorbeeld.json';
import {
  leesBron, leesFases, leesBelangrijkeDatums, leesVaklui,
  leesBoodschappenlijst, leesBegroting, leesAfrekening, type Rasters,
} from '../src/data/bron.js';
import { isoDatum, naarSerie } from '../src/data/waarden.js';

/**
 * De fixture is de bronsheet, omgezet naar precies de vorm
 * die de Sheets API teruggeeft: rijen met kale waarden en datums als
 * serienummer. Dezelfde aantallen als de oude xlsx-lezer, zodat de overstap
 * naar de API niets stilletjes verandert.
 */
const bron = rasters as unknown as Rasters;

describe('serienummers naar datums', () => {
  it('rekent heen en terug', () => {
    expect(isoDatum(naarSerie('2026-08-17'))).toBe('2026-08-17');
    expect(isoDatum(naarSerie('2026-01-01'))).toBe('2026-01-01');
  });

  it('houdt kapotte formuledatums buiten de deur', () => {
    // Het jaartal 1773 uit de kolom "Aantal dagen tot einddatum".
    expect(isoDatum(-46000)).toBeNull();
    expect(isoDatum('')).toBeNull();
    expect(isoDatum('geen datum')).toBeNull();
  });
});

describe('Fases', () => {
  it('leest de matrix uit als losse taken, drie fases', () => {
    const taken = leesFases(bron['Fases']!);
    const perFase = new Map<string, number>();
    for (const t of taken) perFase.set(t.fase, (perFase.get(t.fase) ?? 0) + 1);

    expect(taken).toHaveLength(43);
    expect(perFase.get('Fase A - (voordat we de sleutel hebben)')).toBe(16);
    expect(perFase.get('Fase B - (eerste 6 weken)')).toBe(24);
    expect(perFase.get('Fase ??')).toBe(3);
  });

  it('laat de optelrij en zijn gemiddelde liggen', () => {
    const taken = leesFases(bron['Fases']!);
    expect(taken.some((t) => /^[\d.,]+$/.test(t.naam))).toBe(false);
    const totaal = taken.filter((t) => t.fase.startsWith('Fase B'))
      .reduce((som, t) => som + (t.duurDagen ?? 0), 0);
    expect(totaal).toBe(53);
  });
});

describe('Belangrijke datums', () => {
  it('leest alle regels, ook die zonder datum', () => {
    const regels = leesBelangrijkeDatums(bron['Belangrijke datums']!);
    expect(regels).toHaveLength(19);
    expect(regels.find((r) => r.naam === 'Sleutel overdracht')?.start).toBe('2026-08-17');
  });

  it('trapt niet in de kapotte formulekolom', () => {
    const boog = leesBelangrijkeDatums(bron['Belangrijke datums']!)
      .find((r) => r.naam === 'Boog badkamer maken')!;
    expect(boog.start).toBeNull();
    expect(boog.duurDagen).toBe(5);
  });
});

describe('Vaklui, Boodschappenlijst, Afrekening, Begroting', () => {
  it('leest alle 27 partijen met hun negen functies', () => {
    const lui = leesVaklui(bron['Vaklui']!);
    expect(lui).toHaveLength(27);
    expect(new Set(lui.map((v) => v.functie)).size).toBe(9);
    expect(lui.every((v) => v.gekozen === false)).toBe(true);
  });

  it('leest de bestellingen en laat vast dat "Datum nodig" leeg is', () => {
    const lijst = leesBoodschappenlijst(bron['Boodschappenlijst']!);
    expect(lijst).toHaveLength(9);
    expect(lijst.every((b) => b.datumNodig === null)).toBe(true);
  });

  it('telt de uitgaven op tot wat de sheet er zelf onder zet', () => {
    const uitgaven = leesAfrekening(bron['Afrekening']!);
    expect(uitgaven).toHaveLength(12);
    expect(uitgaven.reduce((a, u) => a + u.bedrag, 0)).toBe(17700);
    expect(uitgaven[0]?.categorieCode).toBe('43');
  });

  it('vindt beide begrotingsblokken tussen de rest van het model', () => {
    const cats = leesBegroting(bron['Begroting']!);
    const badkamer = cats.find((c) => c.blok === 'verbouwkosten' && c.code === '3')!;
    expect(badkamer.naam).toBe('Badkamer');
    expect(badkamer.begroot).toBe(8150);
    expect(badkamer.herzien).toBe(8250);
    expect(cats.filter((c) => c.blok === 'allocatie').length).toBeGreaterThan(8);
  });
});

describe('alles in een keer', () => {
  it('leest de zes tabbladen', () => {
    const b = leesBron(bron);
    expect(b.fases).toHaveLength(43);
    expect(b.datums).toHaveLength(19);
    expect(b.vaklui).toHaveLength(27);
    expect(b.bestellingen).toHaveLength(9);
    expect(b.uitgaven).toHaveLength(12);
  });

  it('zegt welk tabblad ontbreekt in plaats van stil te vallen', () => {
    expect(() => leesBron({ Fases: [] })).toThrow(/Belangrijke datums/);
  });
});
