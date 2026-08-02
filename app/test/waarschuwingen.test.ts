import { describe, it, expect } from 'vitest';
import { leesLevertijd, uitersteBesteldatum } from '../src/domein/levertijd.js';
import { bepaalWaarschuwingen, zoekTaakVoorBestelling, type TaakVoorControle } from '../src/domein/waarschuwingen.js';
import { berekenPlanning, type TaakVoorPlanning } from '../src/domein/planning.js';

const VANDAAG = '2026-08-01';

describe('levertijd uit vrije tekst', () => {
  const lees = (s: string) => leesLevertijd(s, VANDAAG).dagen;

  it('leest de teksten die echt in de Boodschappenlijst staan', () => {
    expect(lees('Volgende dag in huis')).toBe(1);
    expect(lees('3 werkdagen')).toBe(3);
    expect(lees('3 dagen')).toBe(3);
    expect(lees('ongeveer 1 week')).toBe(7);
    expect(lees('langste 4 weken, meerdere baden')).toBe(28);
    expect(lees('ongeveer 1 week, meerdere opties')).toBe(7);
  });

  it('houdt de langste termijn aan als er meerdere staan', () => {
    expect(lees('2 tot 3 weken')).toBe(21);
  });

  it('rekent een maandaanduiding om naar een leverdatum', () => {
    // Begin september is 1 september; vanaf 1 augustus is dat 31 dagen.
    expect(lees('Begin september')).toBe(31);
    expect(lees('eind augustus')).toBe(24);
  });

  it('pakt volgend jaar als de maand al voorbij is', () => {
    expect(leesLevertijd('begin maart', VANDAAG).dagen).toBeGreaterThan(200);
  });

  it('verzint niets bij tekst zonder termijn', () => {
    expect(lees('Vandaag besteld dinsdag in huis')).toBeNull();
    expect(lees('')).toBeNull();
    expect(lees('meerdere douches')).toBeNull();
  });

  it('rekent terug naar de uiterste besteldatum', () => {
    expect(uitersteBesteldatum('2026-09-05', 28)).toBe('2026-08-08');
  });
});

const taak = (id: number, naam: string, extra: Partial<TaakVoorControle> = {}): TaakVoorControle => ({
  id, naam, vasteStart: null, vasteEind: null, duurDagen: 1, status: 'te-doen', ...extra,
});

const plan = (taken: TaakVoorControle[], koppels: { voorId: number; naId: number }[] = []) => {
  const voorPlanning: TaakVoorPlanning[] = taken.map((t) => ({
    id: t.id, naam: t.naam, duurDagen: t.duurDagen, vasteStart: t.vasteStart,
    vasteEind: t.vasteEind, fase: 'Fase B', status: t.status,
  }));
  return berekenPlanning(voorPlanning, koppels, { sleuteldatum: '2026-08-17', vandaag: VANDAAG }).planning;
};

describe('volgorde', () => {
  it('meldt een taak met een vaste datum die te vroeg valt', () => {
    const taken = [
      taak(1, 'Asbestinspectie', { vasteStart: '2026-09-01', vasteEind: '2026-09-01' }),
      taak(2, 'Slopen plafonds', { vasteStart: '2026-08-18', duurDagen: 3 }),
    ];
    const koppels = [{ voorId: 1, naId: 2 }];
    const w = bepaalWaarschuwingen(taken, koppels, plan(taken, koppels), [], VANDAAG);

    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ soort: 'volgorde', ernst: 'kritiek', taakId: 2 });
    expect(w[0]!.kop).toContain('begint voordat');
  });

  it('zwijgt als de app de datums zelf heeft uitgerekend', () => {
    const taken = [taak(1, 'Slopen', { duurDagen: 3 }), taak(2, 'Stucwerk', { duurDagen: 2 })];
    const koppels = [{ voorId: 1, naId: 2 }];
    expect(bepaalWaarschuwingen(taken, koppels, plan(taken, koppels), [], VANDAAG)).toEqual([]);
  });

  it('zwijgt over een voorganger die al klaar is', () => {
    const taken = [
      taak(1, 'Asbestinspectie', { vasteStart: '2026-09-01', vasteEind: '2026-09-01', status: 'klaar' }),
      taak(2, 'Slopen plafonds', { vasteStart: '2026-08-18', duurDagen: 3 }),
    ];
    const koppels = [{ voorId: 1, naId: 2 }];
    expect(bepaalWaarschuwingen(taken, koppels, plan(taken, koppels), [], VANDAAG)).toEqual([]);
  });
});

describe('krappe planning', () => {
  it('meldt een venster dat korter is dan het werk', () => {
    const taken = [taak(1, 'Stucwerk', { vasteStart: '2026-08-18', vasteEind: '2026-08-20', duurDagen: 7 })];
    const w = bepaalWaarschuwingen(taken, [], plan(taken), [], VANDAAG);

    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ soort: 'krappe-planning', ernst: 'let-op' });
    expect(w[0]!.uitleg).toContain('3 dag(en)');
  });

  it('zwijgt als het net past', () => {
    const taken = [taak(1, 'Slopen', { vasteStart: '2026-08-18', vasteEind: '2026-08-20', duurDagen: 3 })];
    expect(bepaalWaarschuwingen(taken, [], plan(taken), [], VANDAAG)).toEqual([]);
  });

  it('zwijgt zonder einddatum, want dan is er geen venster', () => {
    const taken = [taak(1, 'Slopen', { vasteStart: '2026-08-18', duurDagen: 9 })];
    expect(bepaalWaarschuwingen(taken, [], plan(taken), [], VANDAAG)).toEqual([]);
  });
});

describe('bestelling bij taak zoeken', () => {
  const taken = [taak(1, 'Badkamer meubel'), taak(2, 'Douche hangen'), taak(3, 'Wc plaatsen')];

  it('koppelt als elk woord uit de bestelling in de taaknaam staat', () => {
    expect(zoekTaakVoorBestelling({ naam: 'Badkamer meubel' }, taken, plan(taken))?.id).toBe(1);
    expect(zoekTaakVoorBestelling({ naam: 'Douche' }, taken, plan(taken))?.id).toBe(2);
  });

  it('koppelt niet op een half woord', () => {
    expect(zoekTaakVoorBestelling({ naam: 'Toilet set' }, taken, plan(taken))).toBeNull();
    expect(zoekTaakVoorBestelling({ naam: 'Bad acryl' }, taken, plan(taken))).toBeNull();
    expect(zoekTaakVoorBestelling({ naam: 'ontkalker' }, taken, plan(taken))).toBeNull();
  });
});

describe('levertijd-waarschuwing', () => {
  const taken = [taak(1, 'Badkamer meubel', { vasteStart: '2026-08-20', duurDagen: 1 })];

  it('meldt een besteldatum die al verstreken is', () => {
    const w = bepaalWaarschuwingen(taken, [], plan(taken),
      [{ id: 9, naam: 'Badkamer meubel', levertijdTekst: 'langste 4 weken', datumNodig: null }], VANDAAG);

    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ soort: 'levertijd', ernst: 'kritiek', bestellingId: 9, taakId: 1 });
    expect(w[0]!.uitleg).toContain('uiterlijk bestellen op 2026-07-23');
  });

  it('meldt een besteldatum die nadert', () => {
    const laat = [taak(1, 'Badkamer meubel', { vasteStart: '2026-08-09', duurDagen: 1 })];
    const w = bepaalWaarschuwingen(laat, [], plan(laat),
      [{ id: 9, naam: 'Badkamer meubel', levertijdTekst: '3 werkdagen', datumNodig: null }], VANDAAG);

    expect(w[0]).toMatchObject({ soort: 'levertijd', ernst: 'let-op' });
    expect(w[0]!.kop).toContain('binnen 5 dag(en)');
  });

  it('zwijgt als de levertijd niet te lezen is', () => {
    const w = bepaalWaarschuwingen(taken, [], plan(taken),
      [{ id: 9, naam: 'Badkamer meubel', levertijdTekst: 'Vandaag besteld dinsdag in huis', datumNodig: null }],
      VANDAAG);
    expect(w).toEqual([]);
  });

  it('zwijgt als er geen taak bij te vinden is', () => {
    const w = bepaalWaarschuwingen(taken, [], plan(taken),
      [{ id: 9, naam: 'ontkalker', levertijdTekst: '3 dagen', datumNodig: null }], VANDAAG);
    expect(w).toEqual([]);
  });

  it('zet het ergste bovenaan', () => {
    const gemengd = [
      taak(1, 'Badkamer meubel', { vasteStart: '2026-08-20', duurDagen: 1 }),
      taak(2, 'Stucwerk', { vasteStart: '2026-08-18', vasteEind: '2026-08-20', duurDagen: 7 }),
    ];
    const w = bepaalWaarschuwingen(gemengd, [], plan(gemengd),
      [{ id: 9, naam: 'Badkamer meubel', levertijdTekst: '4 weken', datumNodig: null }], VANDAAG);

    expect(w.map((x) => x.ernst)).toEqual(['kritiek', 'let-op']);
  });
});
