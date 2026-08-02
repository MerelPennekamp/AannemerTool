import { haalTabbladen, schrijfTabblad, voegRijenToe } from './sheets.js';
import {
  leesTaken, schrijfTaken, notitieRij, voegSamen,
  TAB_TAKEN, TAB_NOTITIES, type TaakStand, type Notitie,
} from './backend.js';

/**
 * Wat de app naar de backend-sheet schrijft. Er gaat nooit iets naar de
 * bronsheet: die blijft van jou.
 *
 * Voor het bijwerken van een taak wordt het tabblad eerst opnieuw gelezen en
 * daarna in zijn geheel teruggeschreven. Dat is trager dan een enkele cel
 * aanpassen, maar het voorkomt dat je de wijziging van de ander overschrijft
 * die er tussendoor bij kwam.
 */

export async function bewaarStatus(
  backendSheetId: string,
  sleutel: string,
  status: TaakStand['status'],
  door: string,
): Promise<void> {
  const rasters = await haalTabbladen(backendSheetId, [TAB_TAKEN]);
  const huidig = leesTaken(rasters[TAB_TAKEN] ?? []);
  const bestaand = huidig.find((t) => t.sleutel === sleutel);

  const bijgewerkt: TaakStand = {
    sleutel,
    status,
    werksoort: bestaand?.werksoort ?? '',
    ruimtes: bestaand?.ruimtes ?? [],
    gewijzigdOp: new Date().toISOString(),
    gewijzigdDoor: door,
  };

  await schrijfTabblad(backendSheetId, TAB_TAKEN, schrijfTaken(voegSamen([bijgewerkt], huidig)));
}

/** De indeling van een taak met de hand vastzetten. */
export async function bewaarIndeling(
  backendSheetId: string,
  sleutel: string,
  werksoort: string,
  ruimtes: string[],
  door: string,
): Promise<void> {
  const rasters = await haalTabbladen(backendSheetId, [TAB_TAKEN]);
  const huidig = leesTaken(rasters[TAB_TAKEN] ?? []);
  const bestaand = huidig.find((t) => t.sleutel === sleutel);

  const bijgewerkt: TaakStand = {
    sleutel,
    status: bestaand?.status ?? 'te-doen',
    werksoort,
    ruimtes,
    gewijzigdOp: new Date().toISOString(),
    gewijzigdDoor: door,
  };

  await schrijfTabblad(backendSheetId, TAB_TAKEN, schrijfTaken(voegSamen([bijgewerkt], huidig)));
}

/**
 * Notities worden alleen toegevoegd, nooit herschreven. Daardoor kan een
 * notitie van de ander niet verdwijnen doordat jullie tegelijk typen.
 */
export async function bewaarNotitie(
  backendSheetId: string,
  sleutel: string,
  tekst: string,
  auteur: string,
): Promise<Notitie> {
  const notitie: Notitie = {
    sleutel, tekst, auteur, gemaaktOp: new Date().toISOString(),
  };
  await voegRijenToe(backendSheetId, TAB_NOTITIES, [notitieRij(notitie)]);
  return notitie;
}
