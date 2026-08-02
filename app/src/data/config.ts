/**
 * De sleutels van het Google Cloud-project.
 *
 * Deze horen niet in de repo: ze zijn van dit ene project, niet van de app.
 * Bij het bouwen schrijft GitHub Actions ze uit repository-secrets naar
 * `config.json` naast de pagina. Lokaal maak je dat bestand met de hand aan;
 * zie `config.voorbeeld.json`.
 *
 * Dat ze in de gepubliceerde pagina belanden is geen probleem en hoort zo:
 * een client-ID voor een browser-app is openbaar. De beveiliging zit erin dat
 * Google alleen inloggen toestaat vanaf de adressen die jij in het project
 * hebt opgegeven, en dat de API-sleutel aan diezelfde adressen vastzit.
 */
export interface Config {
  /** OAuth-client-ID van het type "Webapplicatie". */
  clientId: string;
  /** API-sleutel, nodig voor Google's bestandskiezer. */
  apiKey: string;
}

/**
 * Wat de app aan Google vraagt. Alle drie niet-gevoelig, dus publiceren kan
 * zonder goedkeuringstraject:
 *
 * - drive.file  alleen bestanden die de app zelf aanmaakt of die jij aanwijst
 * - userinfo.profile  je naam, om notities op naam te kunnen zetten
 * - openid  hoort bij het inloggen zelf
 *
 * Er staat met opzet geen bredere Drive- of Sheets-permissie bij: die zijn wel
 * gevoelig, en dan eist Google een verificatietraject.
 */
export const SCOPE = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.profile',
  'openid',
].join(' ');

let geladen: Config | null = null;

export async function laadConfig(): Promise<Config> {
  if (geladen) return geladen;

  // Relatief pad: de app draait op GitHub Pages onder een submap.
  const antwoord = await fetch('./config.json', { cache: 'no-store' }).catch(() => null);

  if (!antwoord?.ok) {
    throw new ConfigOntbreekt(
      'config.json ontbreekt. Zonder client-ID kan de app niet inloggen bij Google.',
    );
  }

  const c = (await antwoord.json()) as Partial<Config>;
  if (!c.clientId || !c.apiKey) {
    throw new ConfigOntbreekt('config.json mist clientId of apiKey.');
  }

  geladen = { clientId: c.clientId, apiKey: c.apiKey };
  return geladen;
}

export class ConfigOntbreekt extends Error {
  override name = 'ConfigOntbreekt';
}
