import { laadConfig, SCOPE } from './config.js';

/**
 * Inloggen met je eigen Google-account.
 *
 * De app krijgt een toegangstoken dat ongeveer een uur geldig is en alleen in
 * het geheugen van de pagina staat - niet in localStorage, want daar kan andere
 * code op dezelfde pagina bij. Verloopt het token, dan wordt er stilletjes een
 * nieuw gevraagd; alleen de allereerste keer ziet de gebruiker het
 * toestemmingsscherm van Google.
 */

export interface Profiel {
  naam: string;
  email: string;
}

const GIS = 'https://accounts.google.com/gsi/client';

let script: Promise<void> | null = null;
function laadGoogleScript(): Promise<void> {
  script ??= new Promise((klaar, mislukt) => {
    if (window.google?.accounts?.oauth2) return klaar();
    const el = document.createElement('script');
    el.src = GIS;
    el.async = true;
    el.onload = () => klaar();
    el.onerror = () => mislukt(new Error('Google-inlogscript kon niet geladen worden.'));
    document.head.appendChild(el);
  });
  return script;
}

let client: GoogleTokenClient | null = null;
let token: string | null = null;
let verlooptOp = 0;
let profiel: Profiel | null = null;

/** Een halve minuut marge, zodat een verzoek niet halverwege verloopt. */
const MARGE_MS = 30_000;

async function maakClient(): Promise<GoogleTokenClient> {
  if (client) return client;
  const config = await laadConfig();
  await laadGoogleScript();

  const oauth2 = window.google?.accounts.oauth2;
  if (!oauth2) throw new Error('Google-inlog is niet beschikbaar.');

  // De callback wordt per aanvraag opnieuw gezet; zie vraagToken.
  client = oauth2.initTokenClient({
    client_id: config.clientId,
    scope: SCOPE,
    callback: () => {},
  });
  return client;
}

/**
 * Een geldig toegangstoken. `stil` vraagt het zonder de gebruiker iets te
 * tonen; dat lukt alleen als er al eerder toestemming is gegeven.
 */
export async function token_(stil = true): Promise<string> {
  if (token && Date.now() < verlooptOp - MARGE_MS) return token;

  const config = await laadConfig();
  await laadGoogleScript();
  const oauth2 = window.google!.accounts.oauth2;

  return new Promise<string>((klaar, mislukt) => {
    const c = oauth2.initTokenClient({
      client_id: config.clientId,
      scope: SCOPE,
      prompt: stil ? '' : 'consent',
      callback: (antwoord) => {
        if (!antwoord.access_token) {
          mislukt(new NietIngelogd(antwoord.error_description ?? antwoord.error ?? 'geen toegang'));
          return;
        }
        token = antwoord.access_token;
        verlooptOp = Date.now() + (antwoord.expires_in ?? 3600) * 1000;
        klaar(token);
      },
      error_callback: (fout) => mislukt(new NietIngelogd(fout.type ?? 'inloggen afgebroken')),
    });
    client = c;
    c.requestAccessToken();
  });
}

/** Inloggen op verzoek van de gebruiker; toont het scherm van Google. */
export async function logIn(): Promise<Profiel> {
  await token_(false);
  return haalProfiel();
}

export function isIngelogd(): boolean {
  return token !== null && Date.now() < verlooptOp;
}

export function uitloggen(): void {
  if (token) window.google?.accounts.oauth2.revoke(token);
  token = null;
  verlooptOp = 0;
  profiel = null;
}

/**
 * Naam en e-mailadres van wie er is ingelogd. Wordt gebruikt om notities op
 * naam te zetten, zodat je van elkaar ziet wie wat geschreven heeft.
 */
export async function haalProfiel(): Promise<Profiel> {
  if (profiel) return profiel;
  const t = await token_();
  const antwoord = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (!antwoord.ok) {
    // Het profiel is een extraatje: zonder naam werkt de app gewoon door.
    profiel = { naam: 'onbekend', email: '' };
    return profiel;
  }
  const p = (await antwoord.json()) as { name?: string; email?: string };
  profiel = { naam: p.name ?? p.email ?? 'onbekend', email: p.email ?? '' };
  return profiel;
}

export function huidigProfiel(): Profiel | null {
  return profiel;
}

export class NietIngelogd extends Error {
  override name = 'NietIngelogd';
}

/** Alleen voor tests: de bewaarde toestand wissen. */
export function _reset(): void {
  client = null;
  token = null;
  verlooptOp = 0;
  profiel = null;
  script = null;
}
