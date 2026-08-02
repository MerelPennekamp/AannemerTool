import { describe, it, expect } from 'vitest';
import { deelIn } from '../src/domein/classificatie.js';
import { leidAfhankelijkhedenAf, vindKringlopen, type TaakVoorRegels } from '../src/domein/regels.js';

/** De volledige takenlijst zoals hij nu in de bronsheet staat. */
const NAMEN = [
  // Fase A
  'Badkamer besteld hebben',
  'Badkamer moet ontworpen zijn',
  'Technische tekeningen badkamer opgeleverd',
  'Vloeren bovenverdieping uitzoeken en bestellen',
  'Vloerverwarming badkamer bestellen',
  'Stucador zoeken voor stucen badkamer en gehele 1e etage',
  'Klusjesman zoeken voor wc beneden zetten?',
  'Sloopcontainers bestellen/regelen?',
  'Loodgieter fixen',
  'Electricien fixen',
  'CV ketel uitzoeken en bestellen',
  // Fase B
  'Slopen van plafonds (1e etage)',
  'Slopen van wc en wasbak bovenverdieping',
  'Afvoeren sloopafval',
  'Leggen van leidingen voor de badkamer (boven) en wc (beneden)',
  'Leggen van alle elektra voor de bovenverdieping (excl uitbreiding van de meterkast? <- aanname)',
  'Stucwerk gehele 1e etage (muren en plafonds)',
  'Vloeren 1e etage eruit halen',
  'ondervloer leggen 1e etage',
  'Dekvloer leggen 1e etage',
  'Plinten leggen 1e etage',
  'Trap verzetten 1e etage?',
  'Badkamer installeren (boven) + stucen/betegelen',
  'Wc installeren (beneden)',
  'Wc muur + deur(frame)',
  'Wc betegelen',
  'Tijdelijke keuken maken',
  'Verhuizen',
  'Vloerverwarming badkamer (misschien nog niet aansluiten tot de cv ketel vervangen is)',
  'Schilderen muren en plafonds 1e etage',
  'Oud stucwerk verwijderen 1e etage',
  'Vloer badkamer',
  'Cv ketel installeren',
  // Fase ??
  'Vloerverwarming beneden',
  'Dekvloer beneden',
];

const taken: TaakVoorRegels[] = NAMEN.map((naam, i) => {
  const d = deelIn(naam);
  return { id: i + 1, naam, werksoort: d.werksoort, alternatieven: d.alternatieven, ruimtes: d.ruimtes };
});

const idVan = (naam: string) => taken.find((t) => t.naam === naam)!.id;
const koppelingen = leidAfhankelijkhedenAf(taken);

function gaatVoor(a: string, b: string): boolean {
  const doel = idVan(b);
  const start = idVan(a);
  const na = new Map<number, number[]>();
  for (const k of koppelingen) na.set(k.voorId, [...(na.get(k.voorId) ?? []), k.naId]);

  const gezien = new Set<number>([start]);
  const rij = [start];
  while (rij.length) {
    const huidig = rij.shift()!;
    for (const v of na.get(huidig) ?? []) {
      if (v === doel) return true;
      if (!gezien.has(v)) {
        gezien.add(v);
        rij.push(v);
      }
    }
  }
  return false;
}

describe('afgeleide volgorde', () => {
  it('levert geen kringlopen op', () => {
    expect(vindKringlopen(koppelingen)).toEqual([]);
  });

  it('sloopt voordat er gestuukt wordt, op dezelfde etage', () => {
    expect(gaatVoor('Slopen van plafonds (1e etage)', 'Stucwerk gehele 1e etage (muren en plafonds)')).toBe(true);
  });

  it('legt leidingen voor het stucwerk', () => {
    expect(gaatVoor('Leggen van leidingen voor de badkamer (boven) en wc (beneden)', 'Stucwerk gehele 1e etage (muren en plafonds)')).toBe(true);
  });

  it('houdt de vloeropbouw aan: vloerverwarming, ondervloer, dekvloer, plinten', () => {
    expect(gaatVoor('ondervloer leggen 1e etage', 'Dekvloer leggen 1e etage')).toBe(true);
    expect(gaatVoor('Dekvloer leggen 1e etage', 'Plinten leggen 1e etage')).toBe(true);
    expect(gaatVoor('Vloerverwarming beneden', 'Dekvloer beneden')).toBe(true);
  });

  it('bestelt de cv ketel voor hij geinstalleerd wordt, ook zonder gedeelde ruimte', () => {
    expect(gaatVoor('CV ketel uitzoeken en bestellen', 'Cv ketel installeren')).toBe(true);
  });

  it('regelt de vakman voor het werk begint', () => {
    expect(gaatVoor('Electricien fixen', 'Leggen van alle elektra voor de bovenverdieping (excl uitbreiding van de meterkast? <- aanname)')).toBe(true);
    expect(gaatVoor('Stucador zoeken voor stucen badkamer en gehele 1e etage', 'Stucwerk gehele 1e etage (muren en plafonds)')).toBe(true);
  });

  it('verhuist pas na de tijdelijke keuken en een werkend toilet', () => {
    expect(gaatVoor('Tijdelijke keuken maken', 'Verhuizen')).toBe(true);
    expect(gaatVoor('Wc installeren (beneden)', 'Verhuizen')).toBe(true);
  });

  it('houdt de afwerkingsvolgorde aan: stucwerk, schilderen, vloer', () => {
    expect(gaatVoor('Stucwerk gehele 1e etage (muren en plafonds)', 'Schilderen muren en plafonds 1e etage')).toBe(true);
    expect(gaatVoor('Schilderen muren en plafonds 1e etage', 'ondervloer leggen 1e etage')).toBe(true);
    expect(gaatVoor('Schilderen muren en plafonds 1e etage', 'Plinten leggen 1e etage')).toBe(true);
  });

  it('slaat een ontbrekende laag over: geen schilderwerk in de badkamer', () => {
    expect(gaatVoor('Badkamer installeren (boven) + stucen/betegelen', 'Vloer badkamer')).toBe(true);
  });

  it('betegelt de wc voor de pot erin gaat', () => {
    expect(gaatVoor('Wc betegelen', 'Wc installeren (beneden)')).toBe(true);
  });

  it('koppelt niets aan taken die de app niet herkent', () => {
    const onbekend = taken.filter((t) => t.werksoort === null);
    for (const t of onbekend) {
      expect(koppelingen.some((k) => k.voorId === t.id || k.naId === t.id)).toBe(false);
    }
  });
});
