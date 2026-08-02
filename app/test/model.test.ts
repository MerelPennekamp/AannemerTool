import { describe, it, expect } from 'vitest';
import rasters from './fixtures/bron-voorbeeld.json';
import { leesBron, type Rasters } from '../src/data/bron.js';
import { bouwModel } from '../src/model.js';
import { legeInhoud, leesBackend, type BackendInhoud } from '../src/data/backend.js';

/**
 * Het hele rekenwerk in een keer, op de vorm van een echte sheet. Dit is wat de
 * server vroeger deed; nu is het een functie zonder netwerk.
 */
const bron = leesBron(rasters as unknown as Rasters);
const VANDAAG = '2026-08-01';
const leeg = (): BackendInhoud => leesBackend(legeInhoud());

describe('model uit bron en backend', () => {
  const model = bouwModel(bron, leeg(), VANDAAG);

  it('kent elke taak uit allebei de tabbladen, zonder dubbelen', () => {
    expect(model.taken).toHaveLength(62);
    expect(new Set(model.taken.map((t) => t.sleutel)).size).toBe(62);
  });

  it('vindt de sleuteldatum in de bronsheet', () => {
    expect(model.sleuteldatum).toBe('2026-08-17');
  });

  it('geeft elke taak een berekende start en eind', () => {
    expect(model.taken.every((t) => t.gepland !== null)).toBe(true);
    expect(model.kringloop).toBe(false);
  });

  it('houdt twee taken over die het niet herkent', () => {
    expect(model.nietIngedeeld.map((t) => t.naam).sort())
      .toEqual(['Bezoek de architect', 'Sleutel overdracht']);
  });

  it('deelt taken zonder werksoort niet in een fase in', () => {
    for (const t of model.nietIngedeeld) {
      expect(['mijlpaal', 'afspraak', 'onbekend']).toContain(t.categorie);
    }
  });

  it('koppelt de stucadoor aan het stucwerk', () => {
    const stuc = model.taken.find((t) => t.naam.startsWith('Stucwerk gehele'))!;
    expect(stuc.functies).toContain('Stucadoor');
  });

  it('meldt dat de trap te laat besteld is', () => {
    const levertijd = model.waarschuwingen.filter((w) => w.soort === 'levertijd');
    expect(levertijd.length).toBeGreaterThan(0);
    expect(levertijd.some((w) => w.kop.includes('Trap'))).toBe(true);
  });
});

describe('wat in de backend-sheet staat, wint', () => {
  it('neemt de status over', () => {
    const backend = leeg();
    backend.taken.push({
      sleutel: 'verhuizen', status: 'klaar', werksoort: '', ruimtes: [],
      gewijzigdOp: '2026-08-01T10:00:00Z', gewijzigdDoor: 'iemand',
    });
    const model = bouwModel(bron, backend, VANDAAG);
    expect(model.taken.find((t) => t.sleutel === 'verhuizen')?.status).toBe('klaar');
  });

  it('laat een handmatige indeling voorgaan op wat de app afleidt', () => {
    const zonder = bouwModel(bron, leeg(), VANDAAG);
    expect(zonder.taken.find((t) => t.sleutel === 'sleutel overdracht')?.werksoort).toBeNull();

    const backend = leeg();
    backend.taken.push({
      sleutel: 'sleutel overdracht', status: 'te-doen', werksoort: 'onderzoek',
      ruimtes: ['beneden'], gewijzigdOp: '2026-08-01T10:00:00Z', gewijzigdDoor: 'iemand',
    });
    const model = bouwModel(bron, backend, VANDAAG);
    const taak = model.taken.find((t) => t.sleutel === 'sleutel overdracht')!;
    expect(taak.werksoort).toBe('onderzoek');
    expect(taak.ruimtes).toEqual(['beneden']);
    expect(taak.handmatigIngedeeld).toBe(true);
  });

  it('telt notities per taak', () => {
    const backend = leeg();
    backend.notities.push(
      { sleutel: 'verhuizen', tekst: 'bus geregeld', auteur: 'a', gemaaktOp: '2026-08-01' },
      { sleutel: 'verhuizen', tekst: 'dozen gehaald', auteur: 'b', gemaaktOp: '2026-08-01' },
    );
    const model = bouwModel(bron, backend, VANDAAG);
    expect(model.taken.find((t) => t.sleutel === 'verhuizen')?.notities).toBe(2);
  });

  it('laat een onderdrukte koppeling los', () => {
    const metKoppeling = bouwModel(bron, leeg(), VANDAAG);
    const stucStart = metKoppeling.taken.find((t) => t.naam.startsWith('Stucwerk gehele'))!.gepland!.start;

    const backend = leeg();
    // stucwerk hing achter het leidingwerk aan; die koppeling weghalen
    backend.afhankelijkheden.push({
      voorSleutel: 'leggen van leidingen voor de badkamer boven en wc beneden',
      naSleutel: 'stucwerk gehele 1e etage muren en plafonds',
      herkomst: 'onderdrukt', regelId: 'volgorde-per-ruimte',
    });
    const zonder = bouwModel(bron, backend, VANDAAG);
    const nieuweStart = zonder.taken.find((t) => t.naam.startsWith('Stucwerk gehele'))!.gepland!.start;
    expect(nieuweStart <= stucStart).toBe(true);
  });

  it('neemt een handmatige koppeling mee in de planning', () => {
    const backend = leeg();
    backend.afhankelijkheden.push({
      voorSleutel: 'verhuizen',
      naSleutel: 'camera inspectie',
      herkomst: 'handmatig', regelId: '',
    });
    const model = bouwModel(bron, backend, VANDAAG);
    const verhuizen = model.taken.find((t) => t.sleutel === 'verhuizen')!.gepland!;
    const camera = model.taken.find((t) => t.sleutel === 'camera inspectie')!.gepland!;
    // camera heeft een vaste datum uit de sheet, dus dit levert een botsing op
    expect(camera.start < verhuizen.eind).toBe(true);
    expect(model.waarschuwingen.some((w) => w.soort === 'volgorde')).toBe(true);
  });
});
