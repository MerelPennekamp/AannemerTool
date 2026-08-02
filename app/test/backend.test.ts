import { describe, it, expect } from 'vitest';
import {
  leesTaken, schrijfTaken, leesAfhankelijkheden, schrijfAfhankelijkheden,
  leesNotities, notitieRij, leesSync, schrijfSync, leesBackend, legeInhoud,
  voegSamen, BACKEND_TABBLADEN, TAB_TAKEN, TAB_NOTITIES,
  type TaakStand,
} from '../src/data/backend.js';

const taak = (sleutel: string, extra: Partial<TaakStand> = {}): TaakStand => ({
  sleutel, status: 'te-doen', werksoort: '', ruimtes: [],
  gewijzigdOp: '2026-08-02T10:00:00Z', gewijzigdDoor: 'iemand', ...extra,
});

describe('taken heen en terug', () => {
  it('schrijft en leest dezelfde taken', () => {
    const taken = [
      taak('slopen van plafonds 1e etage', { status: 'klaar' }),
      taak('wc betegelen', { werksoort: 'tegelwerk', ruimtes: ['wc', 'beneden'] }),
    ];
    expect(leesTaken(schrijfTaken(taken))).toEqual(taken);
  });

  it('zet een kopregel bovenaan', () => {
    expect(schrijfTaken([])[0]).toContain('sleutel');
    expect(leesTaken(schrijfTaken([]))).toEqual([]);
  });

  it('slaat rijen zonder sleutel over', () => {
    const raster = [['sleutel', 'status'], ['', 'klaar'], ['wc betegelen', 'bezig'], [undefined]];
    expect(leesTaken(raster).map((t) => t.sleutel)).toEqual(['wc betegelen']);
  });

  it('valt terug op te-doen bij een status die niet bestaat', () => {
    const raster = [['sleutel', 'status'], ['iets', 'halverwege']];
    expect(leesTaken(raster)[0]?.status).toBe('te-doen');
  });

  it('bewaart meerdere ruimtes in een cel', () => {
    const rijen = schrijfTaken([taak('leidingen', { ruimtes: ['badkamer', 'wc', 'beneden'] })]);
    expect(rijen[1]?.[3]).toBe('badkamer,wc,beneden');
    expect(leesTaken(rijen)[0]?.ruimtes).toEqual(['badkamer', 'wc', 'beneden']);
  });
});

describe('afhankelijkheden, notities en sync', () => {
  it('bewaart handmatige en onderdrukte koppelingen', () => {
    const lijst = [
      { voorSleutel: 'a', naSleutel: 'b', herkomst: 'handmatig' as const, regelId: '' },
      { voorSleutel: 'c', naSleutel: 'd', herkomst: 'onderdrukt' as const, regelId: 'vloeropbouw' },
    ];
    expect(leesAfhankelijkheden(schrijfAfhankelijkheden(lijst))).toEqual(lijst);
  });

  it('maakt van een notitie een rij die onderaan geplakt kan worden', () => {
    const n = { sleutel: 'wc plaatsen', tekst: 'pot besteld', auteur: 'iemand', gemaaktOp: '2026-08-02' };
    expect(leesNotities([[...'abcd'], notitieRij(n)])).toEqual([n]);
  });

  it('leest de sync-stand met rijaantallen als getal', () => {
    const lijst = [{ tabblad: 'Fases', hash: 'abc123', rijen: 26, laatsteVerversOp: '2026-08-02' }];
    expect(leesSync(schrijfSync(lijst))).toEqual(lijst);
  });
});

describe('een verse backend-sheet', () => {
  it('heeft vier tabbladen die alleen een kopregel bevatten', () => {
    const leeg = legeInhoud();
    expect(Object.keys(leeg).sort()).toEqual([...BACKEND_TABBLADEN].sort());
    for (const rijen of Object.values(leeg)) expect(rijen).toHaveLength(1);
  });

  it('leest leeg terug zonder te struikelen', () => {
    const inhoud = leesBackend(legeInhoud());
    expect(inhoud).toEqual({ taken: [], afhankelijkheden: [], notities: [], sync: [] });
  });

  it('overleeft een tabblad dat helemaal ontbreekt', () => {
    expect(leesBackend({}).taken).toEqual([]);
    expect(leesBackend({ [TAB_TAKEN]: [] }).notities).toEqual([]);
  });

  it('gebruikt dezelfde tabbladnamen als de kopregels', () => {
    expect(BACKEND_TABBLADEN).toContain(TAB_NOTITIES);
  });
});

describe('twee telefoons die tegelijk wijzigen', () => {
  it('laat de laatste wijziging winnen', () => {
    const oud = [taak('wc betegelen', { status: 'bezig', gewijzigdOp: '2026-08-02T09:00:00Z' })];
    const nieuw = [taak('wc betegelen', { status: 'klaar', gewijzigdOp: '2026-08-02T11:00:00Z' })];

    expect(voegSamen(nieuw, oud)[0]?.status).toBe('klaar');
    // en andersom net zo goed
    expect(voegSamen(oud, nieuw)[0]?.status).toBe('klaar');
  });

  it('houdt taken die maar aan een kant bestaan', () => {
    const mijn = [taak('a'), taak('b')];
    const hunne = [taak('b'), taak('c')];
    expect(voegSamen(mijn, hunne).map((t) => t.sleutel)).toEqual(['a', 'b', 'c']);
  });
});
