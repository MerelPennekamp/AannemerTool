import { token_ } from './auth.js';
import type { Raster } from './waarden.js';

/**
 * De Google Sheets API, alleen de stukken die deze app gebruikt.
 *
 * In tegenstelling tot de download-link van een sheet stuurt deze API wel de
 * headers die een browser nodig heeft om hem rechtstreeks te mogen aanroepen.
 * Daarom kan de app zonder tussenserver.
 */

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

export class SheetsFout extends Error {
  override name = 'SheetsFout';
  constructor(readonly status: number, boodschap: string, readonly herstelbaar: boolean) {
    super(boodschap);
  }
}

async function verzoek<T>(pad: string, opties: RequestInit = {}): Promise<T> {
  const t = await token_();
  const antwoord = await fetch(`${API}${pad}`, {
    ...opties,
    headers: {
      Authorization: `Bearer ${t}`,
      'Content-Type': 'application/json',
      ...opties.headers,
    },
  });

  if (!antwoord.ok) {
    const tekst = await antwoord.text().catch(() => '');
    let boodschap = tekst;
    try {
      boodschap = (JSON.parse(tekst) as { error?: { message?: string } }).error?.message ?? tekst;
    } catch { /* geen json, laat de ruwe tekst staan */ }

    throw new SheetsFout(
      antwoord.status,
      verklaar(antwoord.status, boodschap),
      // 429 en 5xx mag je opnieuw proberen; 403 en 404 hebben geen zin.
      antwoord.status === 429 || antwoord.status >= 500,
    );
  }
  return (await antwoord.json()) as T;
}

/** Google's foutmeldingen zijn Engels en technisch; dit maakt ze bruikbaar. */
function verklaar(status: number, boodschap: string): string {
  if (status === 403) {
    return 'Geen toegang tot deze sheet. De app mag alleen bij bestanden die hij zelf '
      + 'heeft aangemaakt of die je zelf hebt aangewezen.';
  }
  if (status === 404) return 'Deze sheet bestaat niet (meer).';
  if (status === 429) return 'Google vindt het even te snel gaan. Probeer het zo nog eens.';
  if (status >= 500) return 'Google heeft een storing. Probeer het later nog eens.';
  return boodschap || `Sheets gaf status ${status}.`;
}

/** Meerdere tabbladen in een keer ophalen. */
export async function haalTabbladen(
  sheetId: string, tabbladen: string[],
): Promise<Record<string, Raster>> {
  const ranges = tabbladen.map((t) => `ranges=${encodeURIComponent(`'${t}'`)}`).join('&');
  const antwoord = await verzoek<{ valueRanges?: { range?: string; values?: unknown[][] }[] }>(
    `/${sheetId}/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
  );

  const uit: Record<string, Raster> = {};
  (antwoord.valueRanges ?? []).forEach((bereik, i) => {
    const naam = tabbladen[i];
    if (naam) uit[naam] = bereik.values ?? [];
  });
  return uit;
}

/** Welke tabbladen zitten er in deze sheet? */
export async function haalTabbladnamen(sheetId: string): Promise<string[]> {
  const antwoord = await verzoek<{ sheets?: { properties?: { title?: string } }[] }>(
    `/${sheetId}?fields=sheets.properties.title`,
  );
  return (antwoord.sheets ?? []).map((s) => s.properties?.title ?? '').filter(Boolean);
}

/** Een nieuwe sheet aanmaken. De app mag daar daarna bij, ook met de smalle permissie. */
export async function maakSheet(titel: string, tabbladen: string[]): Promise<string> {
  const antwoord = await verzoek<{ spreadsheetId?: string }>('', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: titel },
      sheets: tabbladen.map((t) => ({ properties: { title: t } })),
    }),
  });
  if (!antwoord.spreadsheetId) throw new SheetsFout(0, 'Aanmaken gaf geen sheet terug.', false);
  return antwoord.spreadsheetId;
}

/** Een tabblad in zijn geheel overschrijven. */
export async function schrijfTabblad(
  sheetId: string, tabblad: string, rijen: unknown[][],
): Promise<void> {
  // Eerst leegmaken, anders blijven oude rijen onderaan staan als het er minder worden.
  await verzoek(`/${sheetId}/values/${encodeURIComponent(`'${tabblad}'`)}:clear`, { method: 'POST' });
  await verzoek(
    `/${sheetId}/values/${encodeURIComponent(`'${tabblad}'!A1`)}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values: rijen }) },
  );
}

/** Rijen onderaan een tabblad plakken, zonder de rest aan te raken. */
export async function voegRijenToe(
  sheetId: string, tabblad: string, rijen: unknown[][],
): Promise<void> {
  if (!rijen.length) return;
  await verzoek(
    `/${sheetId}/values/${encodeURIComponent(`'${tabblad}'!A1`)}:append`
      + '?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
    { method: 'POST', body: JSON.stringify({ values: rijen }) },
  );
}

/** Ontbrekende tabbladen bijmaken in een bestaande sheet. */
export async function zorgVoorTabbladen(sheetId: string, gewenst: string[]): Promise<void> {
  const bestaand = new Set(await haalTabbladnamen(sheetId));
  const missend = gewenst.filter((t) => !bestaand.has(t));
  if (!missend.length) return;

  await verzoek(`/${sheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: missend.map((titel) => ({ addSheet: { properties: { title: titel } } })),
    }),
  });
}
