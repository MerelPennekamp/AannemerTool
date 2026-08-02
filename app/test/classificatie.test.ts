import { describe, it, expect } from 'vitest';
import { deelIn, normaliseer, type Ruimte } from '../src/domein/classificatie.js';
import type { Werksoort } from '../src/domein/fasen.js';

/**
 * Alle taaknamen komen letterlijk uit een echte verbouwingssheet,
 * inclusief typo's. Verandert een patroon, dan valt hier meteen om welke
 * echte taak eronder lijdt.
 */

type Verwacht = [naam: string, werksoort: Werksoort | null, ruimtes: Ruimte[]];

const FASE_A: Verwacht[] = [
  ['Badkamer besteld hebben', 'voorbereiding', ['badkamer']],
  ['Badkamer moet ontworpen zijn', 'onderzoek', ['badkamer']],
  ['Technische tekeningen badkamer opgeleverd', 'onderzoek', ['badkamer']],
  ['Wc ook voor bovenstaande', 'sanitair', ['wc']],
  ['Vloeren bovenverdieping uitzoeken en bestellen', 'voorbereiding', ['1e-etage']],
  ['Vloerverwarming badkamer bestellen', 'voorbereiding', ['badkamer']],
  ['Stucador zoeken voor stucen badkamer en gehele 1e etage', 'voorbereiding', ['badkamer', '1e-etage']],
  ['Klusjesman zoeken voor wc beneden zetten?', 'voorbereiding', ['wc', 'beneden']],
  ['Apparatuur tijdelijke keuken bij elkaar sprokkelen (vaatwasser, kooklplaat, oven, koelkast, koffiezetter)', 'voorbereiding', ['keuken']],
  ['Sloopcontainers bestellen/regelen?', 'voorbereiding', []],
  ['Regelen sloopgereedschap', 'voorbereiding', []],
  ['Klusjesman zoeken voor schoorsteendak dichten', 'voorbereiding', ['dak']],
  ['Klusjesman zoeken voor installeren badkamer?', 'voorbereiding', ['badkamer']],
  ['Loodgieter fixen', 'voorbereiding', []],
  ['Electricien fixen', 'voorbereiding', []],
  ['CV ketel uitzoeken en bestellen', 'voorbereiding', []],
];

const FASE_B: Verwacht[] = [
  ['Slopen van plafonds (1e etage)', 'sloop', ['1e-etage']],
  ['Slopen van wc en wasbak bovenverdieping', 'sloop', ['wc', '1e-etage']],
  ['Slopen van de haard en schoorsteen', 'sloop', ['dak']],
  ['Schoortseen gat dichten', 'ruwbouw', []],
  ['Afvoeren sloopafval', 'sloop', []],
  ['Leggen van leidingen voor de badkamer (boven) en wc (beneden)', 'loodgieterswerk', ['badkamer', 'wc', '1e-etage', 'beneden']],
  ['Leggen van alle elektra voor de bovenverdieping (excl uitbreiding van de meterkast? <- aanname)', 'elektra', ['1e-etage']],
  ['Stucwerk gehele 1e etage (muren en plafonds)', 'stucwerk', ['1e-etage']],
  ['Vloeren 1e etage eruit halen', 'sloop', ['1e-etage']],
  ['ondervloer leggen 1e etage', 'vloer', ['1e-etage']],
  ['Dekvloer leggen 1e etage', 'vloer', ['1e-etage']],
  ['Plinten leggen 1e etage', 'vloer', ['1e-etage']],
  ['Trap verzetten 1e etage?', 'ruwbouw', ['1e-etage']],
  ['Badkamer installeren (boven) + stucen/betegelen', 'stucwerk', ['badkamer', '1e-etage']],
  ['Wc installeren (beneden)', 'sanitair', ['wc', 'beneden']],
  ['Wc muur + deur(frame)', 'ruwbouw', ['wc']],
  ['Wc betegelen', 'tegelwerk', ['wc']],
  ['Tijdelijke keuken maken', 'keuken', ['keuken']],
  ['Verhuizen', 'verhuizing', []],
  ['Vloerverwarming badkamer (misschien nog niet aansluiten tot de cv ketel vervangen is en de vloerverwarming beneden ligt?)', 'vloerverwarming', ['badkamer', 'beneden']],
  ['Schilderen muren en plafonds 1e etage', 'schilderwerk', ['1e-etage']],
  ['Oud stucwerk verwijderen 1e etage', 'sloop', ['1e-etage']],
  ['Vloer badkamer', 'vloer', ['badkamer']],
  ['Cv ketel installeren', 'verwarming', []],
];

const FASE_ONBEKEND: Verwacht[] = [
  ['Aanbouw', 'ruwbouw', ['aanbouw']],
  ['Vloerverwarming beneden', 'vloerverwarming', ['beneden']],
  ['Dekvloer beneden', 'vloer', ['beneden']],
];

const BELANGRIJKE_DATUMS: Verwacht[] = [
  ['Boog badkamer maken', 'ruwbouw', ['badkamer']],
  ['Muurtje douche wc badkamer', 'ruwbouw', ['badkamer', 'wc']],
  ['Muurtje wc hal', 'ruwbouw', ['wc', 'hal']],
  ['Wc plaatsen', 'sanitair', ['wc']],
  ['Douche hangen', 'sanitair', []],
  ['Badkamer meubel', 'sanitair', ['badkamer']],
  ['Trap verplaatsen', 'ruwbouw', []],
  ['Elektra freezen', 'elektra', []],
  ['Elektra buizen / draden', 'elektra', []],
  ['Radiator / handdoeken rek Badkamer', 'verwarming', ['badkamer']],
  ['Vloerverwarming', 'vloerverwarming', []],
  ['Isoleren vloer', 'isolatie', []],
  ['Water afvoer leidingen', 'loodgieterswerk', []],
  ['Camera inspectie', 'onderzoek', []],
  ['Stuc werk bovenverdieping verwijderen', 'sloop', ['1e-etage']],
  ['Plaffonds eruit slopen bovenverdieping gang', 'sloop', ['1e-etage', 'hal']],
];

/** Geen werk, maar staan wel in het tabblad. De app hoort hier niets te verzinnen. */
const GEEN_TAAK: Verwacht[] = [
  ['Sleutel overdracht', null, []],
  ['Bezoek de architect', null, []],
];

const ALLES = [...FASE_A, ...FASE_B, ...FASE_ONBEKEND, ...BELANGRIJKE_DATUMS, ...GEEN_TAAK];

describe('werksoort en ruimte uit de echte taaknamen', () => {
  for (const [naam, werksoort, ruimtes] of ALLES) {
    it(`${naam.slice(0, 60)} -> ${werksoort ?? 'niet ingedeeld'}`, () => {
      const indeling = deelIn(naam);
      expect(indeling.werksoort, 'werksoort').toBe(werksoort);
      expect(indeling.ruimtes, 'ruimtes').toEqual(ruimtes);
    });
  }
});

describe('valkuilen die we eerder fout hadden', () => {
  it('"bovenstaande" is geen verdieping', () => {
    expect(deelIn('Wc ook voor bovenstaande').ruimtes).not.toContain('1e-etage');
  });

  it('"badkamer" is een ruimte, niet een bad', () => {
    expect(deelIn('Vloer badkamer').werksoort).toBe('vloer');
    expect(deelIn('Bad levertijd kan een probleem worden').werksoort).toBe('sanitair');
  });

  it('muren bij stucwerk en schilderwerk zijn oppervlak, geen ruwbouw', () => {
    expect(deelIn('Stucwerk gehele 1e etage (muren en plafonds)').werksoort).toBe('stucwerk');
    expect(deelIn('Schilderen muren en plafonds 1e etage').werksoort).toBe('schilderwerk');
  });

  it('bestellen wint van waar besteld wordt', () => {
    expect(deelIn('Vloerverwarming badkamer bestellen').werksoort).toBe('voorbereiding');
    expect(deelIn('Sloopcontainers bestellen/regelen?').werksoort).toBe('voorbereiding');
  });

  it('slopen wint van wat gesloopt wordt', () => {
    expect(deelIn('Oud stucwerk verwijderen 1e etage').werksoort).toBe('sloop');
    expect(deelIn('Vloeren 1e etage eruit halen').werksoort).toBe('sloop');
  });

  it('vloerverwarming is geen vloer en geen verwarming', () => {
    expect(deelIn('Vloerverwarming beneden').werksoort).toBe('vloerverwarming');
  });

  it('afvoeren (sloop) is niet dezelfde afvoer als de leiding', () => {
    expect(deelIn('Afvoeren sloopafval').werksoort).toBe('sloop');
    expect(deelIn('Water afvoer leidingen').werksoort).toBe('loodgieterswerk');
  });

  it('normaliseren haalt leestekens en accenten weg', () => {
    expect(normaliseer('Wc muur + deur(frame)')).toBe('wc muur deur frame');
    expect(normaliseer('Trap verzetten 1e etage?')).toBe('trap verzetten 1e etage');
    expect(normaliseer('vóór de dekvloer')).toBe('voor de dekvloer');
  });
});
