import { describe, it, expect } from 'vitest';
import { berekenPlanning, plusDagen, dagenTussen, type TaakVoorPlanning } from '../src/domein/planning.js';

const OPTIES = { sleuteldatum: '2026-08-17', vandaag: '2026-08-01' };

const taak = (id: number, naam: string, duur: number | null, extra: Partial<TaakVoorPlanning> = {}):
  TaakVoorPlanning => ({
  id, naam, duurDagen: duur, vasteStart: null, vasteEind: null,
  fase: 'Fase B - (eerste 6 weken)', status: 'te-doen', ...extra,
});

describe('datumrekenen', () => {
  it('telt dagen op en af', () => {
    expect(plusDagen('2026-08-17', 5)).toBe('2026-08-22');
    expect(plusDagen('2026-08-31', 1)).toBe('2026-09-01');
    expect(dagenTussen('2026-08-17', '2026-08-22')).toBe(5);
  });

  it('kent geen weekenden: alle dagen tellen mee', () => {
    // 2026-08-21 is een vrijdag; drie dagen later is maandag 24, geen dinsdag.
    expect(plusDagen('2026-08-21', 3)).toBe('2026-08-24');
  });
});

describe('vroegste datums', () => {
  it('zet een taak zonder voorganger op de sleuteldatum', () => {
    const { planning } = berekenPlanning([taak(1, 'Slopen', 3)], [], OPTIES);
    expect(planning.get(1)).toMatchObject({ start: '2026-08-17', eind: '2026-08-19', duur: 3 });
  });

  it('laat Fase A al voor de sleutel beginnen', () => {
    const t = taak(1, 'Badkamer bestellen', 2, { fase: 'Fase A - (voordat we de sleutel hebben)' });
    expect(berekenPlanning([t], [], OPTIES).planning.get(1)?.start).toBe('2026-08-01');
  });

  it('schuift een opvolger achter zijn voorganger aan', () => {
    const taken = [taak(1, 'Slopen', 3), taak(2, 'Stucwerk', 2)];
    const { planning } = berekenPlanning(taken, [{ voorId: 1, naId: 2 }], OPTIES);
    expect(planning.get(1)?.eind).toBe('2026-08-19');
    expect(planning.get(2)?.start).toBe('2026-08-20');
  });

  it('wacht op de laatste van meerdere voorgangers', () => {
    const taken = [taak(1, 'Kort', 1), taak(2, 'Lang', 6), taak(3, 'Daarna', 1)];
    const { planning } = berekenPlanning(
      taken, [{ voorId: 1, naId: 3 }, { voorId: 2, naId: 3 }], OPTIES);
    expect(planning.get(3)?.start).toBe('2026-08-23');
  });

  it('houdt een datum uit de sheet aan, ook als die later is dan nodig', () => {
    const taken = [taak(1, 'Slopen', 3), taak(2, 'Inspectie', 1, { vasteStart: '2026-09-10' })];
    const { planning } = berekenPlanning(taken, [{ voorId: 1, naId: 2 }], OPTIES);
    expect(planning.get(2)?.start).toBe('2026-09-10');
    expect(planning.get(2)?.startVast).toBe(true);
  });

  it('gebruikt een dag als de sheet geen duur geeft, en zegt dat erbij', () => {
    const { planning } = berekenPlanning([taak(1, 'Aanbouw', null)], [], OPTIES);
    expect(planning.get(1)).toMatchObject({ duur: 1, duurGeschat: true });
  });

  it('laat een taak van nul dagen op een dag staan', () => {
    const { planning } = berekenPlanning([taak(1, 'Afvoeren', 0)], [], OPTIES);
    expect(planning.get(1)?.start).toBe(planning.get(1)?.eind);
  });
});

describe('kritiek pad en speling', () => {
  //  1 (3d) -> 2 (6d) -> 4 (1d)
  //  1 (3d) -> 3 (1d) -> 4 (1d)      3 heeft speling
  const taken = [taak(1, 'Sloop', 3), taak(2, 'Lang', 6), taak(3, 'Kort', 1), taak(4, 'Slot', 1)];
  const koppels = [
    { voorId: 1, naId: 2 }, { voorId: 1, naId: 3 },
    { voorId: 2, naId: 4 }, { voorId: 3, naId: 4 },
  ];

  it('markeert het langste pad als kritiek', () => {
    const { planning } = berekenPlanning(taken, koppels, OPTIES);
    expect(planning.get(1)?.kritiek).toBe(true);
    expect(planning.get(2)?.kritiek).toBe(true);
    expect(planning.get(4)?.kritiek).toBe(true);
  });

  it('geeft de korte tak speling in plaats van kritiek', () => {
    const { planning } = berekenPlanning(taken, koppels, OPTIES);
    expect(planning.get(3)?.kritiek).toBe(false);
    expect(planning.get(3)?.speling).toBe(5);
  });
});

describe('kringlopen', () => {
  it('meldt een kringloop in plaats van er datums uit te persen', () => {
    const taken = [taak(1, 'A', 1), taak(2, 'B', 1)];
    const { planning, kringloop } = berekenPlanning(
      taken, [{ voorId: 1, naId: 2 }, { voorId: 2, naId: 1 }], OPTIES);
    expect(kringloop).toBe(true);
    expect(planning.size).toBe(0);
  });
});
