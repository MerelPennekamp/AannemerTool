/**
 * De Sheets API geeft rijen met kale waarden terug: tekst, getallen, en datums
 * als serienummer. Hier wordt dat omgezet naar iets waar het domein op kan
 * rekenen.
 */

/** Google telt dagen vanaf 30 december 1899. */
const EPOCH = Date.UTC(1899, 11, 30);
const DAG = 86_400_000;

export function tekst(waarde: unknown): string {
  if (waarde === null || waarde === undefined) return '';
  if (typeof waarde === 'string') return waarde.trim();
  if (typeof waarde === 'number' || typeof waarde === 'boolean') return String(waarde);
  return String(waarde).trim();
}

export function getal(waarde: unknown): number | null {
  if (typeof waarde === 'number') return Number.isFinite(waarde) ? waarde : null;
  const t = tekst(waarde);
  if (!t) return null;
  // "1937.8", "1.937,80", "Ongeveer 1000" -> het eerste getal dat er staat
  const m = t.replace(/\s/g, '').match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Serienummer naar ISO-datum. Kapotte formules in de sheet leveren jaartallen
 * als 1773 op; die zijn geen datum en komen er als null uit.
 */
export function isoDatum(waarde: unknown): string | null {
  if (typeof waarde !== 'number' || !Number.isFinite(waarde)) return null;
  const d = new Date(EPOCH + Math.round(waarde) * DAG);
  const jaar = d.getUTCFullYear();
  if (jaar < 2000 || jaar > 2100) return null;
  return d.toISOString().slice(0, 10);
}

/** Datum terug naar serienummer, voor als de app naar de sheet schrijft. */
export function naarSerie(iso: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - EPOCH) / DAG);
}

export type Raster = unknown[][];

/** Cel uit een rij, met een kolomindex die er ook niet kan zijn. */
export const cel = (rij: unknown[] | undefined, index: number): unknown =>
  index < 0 || !rij ? '' : rij[index] ?? '';

/**
 * Kolommen opzoeken op hun kopnaam in plaats van op positie. De sheet wordt met
 * de hand bijgehouden, dus er kan zomaar een kolom tussen geschoven worden.
 */
export function kolommen<K extends string>(
  raster: Raster, koppen: Record<K, string>,
): Record<K, number> {
  const kop = (raster[0] ?? []).map((c) => tekst(c).toLowerCase());
  const uit = {} as Record<K, number>;
  for (const [sleutel, titel] of Object.entries(koppen) as [K, string][]) {
    uit[sleutel] = kop.findIndex((c) => c === (titel as string).toLowerCase());
  }
  return uit;
}
