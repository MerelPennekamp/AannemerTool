import { tekst, getal, type Raster } from './waarden.js';

/**
 * De backend-sheet: wat de app zelf bijhoudt en wat niet in de bronsheets staat.
 * Vier tabbladen, precies zoals in het plan.
 *
 * De sleutel van een taak is zijn genormaliseerde naam, niet een nummer.
 * Nummers zouden per apparaat verschillen; namen niet. Dat is ook waar de
 * ververs op matcht als er iets in de bronsheet verandert.
 *
 * Alles hieronder is losse omzetting tussen rijen en records - geen netwerk,
 * dus volledig te testen.
 */

export const TAB_TAKEN = 'Taken';
export const TAB_AFHANKELIJKHEDEN = 'Afhankelijkheden';
export const TAB_NOTITIES = 'Notities';
export const TAB_SYNC = 'Sync';

export const BACKEND_TABBLADEN = [TAB_TAKEN, TAB_AFHANKELIJKHEDEN, TAB_NOTITIES, TAB_SYNC];

export interface TaakStand {
  sleutel: string;
  status: 'te-doen' | 'bezig' | 'klaar' | 'vervallen';
  /** Met de hand gezette indeling; leeg betekent: laat de app het afleiden. */
  werksoort: string;
  ruimtes: string[];
  gewijzigdOp: string;
  gewijzigdDoor: string;
}

export interface AfhankelijkheidStand {
  voorSleutel: string;
  naSleutel: string;
  herkomst: 'handmatig' | 'onderdrukt';
  regelId: string;
}

export interface Notitie {
  sleutel: string;
  tekst: string;
  auteur: string;
  gemaaktOp: string;
}

export interface SyncStand {
  tabblad: string;
  hash: string;
  rijen: number;
  laatsteVerversOp: string;
}

export interface BackendInhoud {
  taken: TaakStand[];
  afhankelijkheden: AfhankelijkheidStand[];
  notities: Notitie[];
  sync: SyncStand[];
}

const KOP = {
  [TAB_TAKEN]: ['sleutel', 'status', 'werksoort', 'ruimtes', 'gewijzigd_op', 'gewijzigd_door'],
  [TAB_AFHANKELIJKHEDEN]: ['voor_sleutel', 'na_sleutel', 'herkomst', 'regel_id'],
  [TAB_NOTITIES]: ['sleutel', 'tekst', 'auteur', 'gemaakt_op'],
  [TAB_SYNC]: ['tabblad', 'hash', 'rijen', 'laatste_ververs'],
} as const;

const STATUSSEN = ['te-doen', 'bezig', 'klaar', 'vervallen'] as const;

/** Rijen zonder sleutel zijn leeg of half ingetypt; die slaan we over. */
const metSleutel = (raster: Raster, kolom = 0) =>
  raster.slice(1).filter((rij) => tekst(rij?.[kolom]));

export function leesTaken(raster: Raster): TaakStand[] {
  return metSleutel(raster).map((rij) => {
    const status = tekst(rij[1]) as TaakStand['status'];
    return {
      sleutel: tekst(rij[0]),
      status: STATUSSEN.includes(status) ? status : 'te-doen',
      werksoort: tekst(rij[2]),
      ruimtes: tekst(rij[3]).split(',').map((r) => r.trim()).filter(Boolean),
      gewijzigdOp: tekst(rij[4]),
      gewijzigdDoor: tekst(rij[5]),
    };
  });
}

export function schrijfTaken(taken: TaakStand[]): unknown[][] {
  return [
    [...KOP[TAB_TAKEN]],
    ...taken.map((t) => [
      t.sleutel, t.status, t.werksoort, t.ruimtes.join(','), t.gewijzigdOp, t.gewijzigdDoor,
    ]),
  ];
}

export function leesAfhankelijkheden(raster: Raster): AfhankelijkheidStand[] {
  return metSleutel(raster).map((rij) => ({
    voorSleutel: tekst(rij[0]),
    naSleutel: tekst(rij[1]),
    herkomst: tekst(rij[2]) === 'onderdrukt' ? 'onderdrukt' : 'handmatig',
    regelId: tekst(rij[3]),
  }));
}

export function schrijfAfhankelijkheden(lijst: AfhankelijkheidStand[]): unknown[][] {
  return [
    [...KOP[TAB_AFHANKELIJKHEDEN]],
    ...lijst.map((a) => [a.voorSleutel, a.naSleutel, a.herkomst, a.regelId]),
  ];
}

export function leesNotities(raster: Raster): Notitie[] {
  return metSleutel(raster).map((rij) => ({
    sleutel: tekst(rij[0]),
    tekst: tekst(rij[1]),
    auteur: tekst(rij[2]),
    gemaaktOp: tekst(rij[3]),
  }));
}

/** Een nieuwe notitie als losse rij, om onderaan te plakken. */
export function notitieRij(n: Notitie): unknown[] {
  return [n.sleutel, n.tekst, n.auteur, n.gemaaktOp];
}

export function leesSync(raster: Raster): SyncStand[] {
  return metSleutel(raster).map((rij) => ({
    tabblad: tekst(rij[0]),
    hash: tekst(rij[1]),
    rijen: getal(rij[2]) ?? 0,
    laatsteVerversOp: tekst(rij[3]),
  }));
}

export function schrijfSync(lijst: SyncStand[]): unknown[][] {
  return [
    [...KOP[TAB_SYNC]],
    ...lijst.map((s) => [s.tabblad, s.hash, s.rijen, s.laatsteVerversOp]),
  ];
}

/** Kopregels voor een nog lege backend-sheet. */
export function legeInhoud(): Record<string, unknown[][]> {
  return {
    [TAB_TAKEN]: schrijfTaken([]),
    [TAB_AFHANKELIJKHEDEN]: schrijfAfhankelijkheden([]),
    [TAB_NOTITIES]: [[...KOP[TAB_NOTITIES]]],
    [TAB_SYNC]: schrijfSync([]),
  };
}

export function leesBackend(rasters: Record<string, Raster>): BackendInhoud {
  return {
    taken: leesTaken(rasters[TAB_TAKEN] ?? []),
    afhankelijkheden: leesAfhankelijkheden(rasters[TAB_AFHANKELIJKHEDEN] ?? []),
    notities: leesNotities(rasters[TAB_NOTITIES] ?? []),
    sync: leesSync(rasters[TAB_SYNC] ?? []),
  };
}

/**
 * Twee telefoons kunnen tegelijk iets wijzigen. De sheet kent geen
 * transacties, dus bij gelijke sleutel wint de laatste wijziging. Dat is voor
 * twee mensen die samen verbouwen ruim voldoende, en het verliest nooit een
 * notitie: die worden alleen toegevoegd, nooit overschreven.
 */
export function voegSamen(mijn: TaakStand[], hunne: TaakStand[]): TaakStand[] {
  const perSleutel = new Map<string, TaakStand>();
  for (const t of [...hunne, ...mijn]) {
    const bestaand = perSleutel.get(t.sleutel);
    if (!bestaand || t.gewijzigdOp >= bestaand.gewijzigdOp) perSleutel.set(t.sleutel, t);
  }
  return [...perSleutel.values()].sort((a, b) => a.sleutel.localeCompare(b.sleutel));
}
