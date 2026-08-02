import { laadConfig } from './config.js';
import { token_ } from './auth.js';

/**
 * Google's eigen bestandskiezer.
 *
 * Nodig omdat de app de smalle permissie gebruikt: hij mag alleen bij bestanden
 * die hij zelf heeft aangemaakt, of die je hier aanwijst. Wijs je een sheet aan,
 * dan geeft Google de app toegang tot precies dat ene bestand - en tot niets
 * anders in je Drive.
 *
 * Dit is ook hoe de tweede persoon bij de backend-sheet komt: die is door de
 * telefoon van de ander aangemaakt, dus onbekend tot hij hem een keer aanwijst.
 */

const GAPI = 'https://apis.google.com/js/api.js';

let gapiGeladen: Promise<void> | null = null;
function laadGapi(): Promise<void> {
  gapiGeladen ??= new Promise((klaar, mislukt) => {
    if (window.gapi) return klaar();
    const el = document.createElement('script');
    el.src = GAPI;
    el.async = true;
    el.onload = () => klaar();
    el.onerror = () => mislukt(new Error('De bestandskiezer van Google kon niet geladen worden.'));
    document.head.appendChild(el);
  });
  return gapiGeladen;
}

let pickerGeladen: Promise<void> | null = null;
function laadPicker(): Promise<void> {
  pickerGeladen ??= laadGapi().then(
    () => new Promise<void>((klaar) => window.gapi!.load('picker', () => klaar())),
  );
  return pickerGeladen;
}

export interface GekozenBestand {
  id: string;
  naam: string;
}

/**
 * Het projectnummer uit een client-ID. Die hebben de vorm
 * "123456789-letters.apps.googleusercontent.com"; het stuk voor het streepje
 * is het nummer van het Cloud-project.
 */
export function projectnummer(clientId: string): string {
  const nummer = clientId.split('-')[0] ?? '';
  if (!/^\d+$/.test(nummer)) {
    throw new Error(
      `Uit het client-ID is geen projectnummer te halen ("${clientId}"). `
      + 'Klopt de waarde van GOOGLE_CLIENT_ID?',
    );
  }
  return nummer;
}

/**
 * Laat de gebruiker een spreadsheet aanwijzen. Geeft null terug als hij het
 * venster wegklikt - dat is geen fout, dat is een keuze.
 */
export async function kiesSpreadsheet(titel: string): Promise<GekozenBestand | null> {
  const config = await laadConfig();
  const t = await token_();
  await laadPicker();

  const picker = window.google?.picker;
  if (!picker) throw new Error('De bestandskiezer is niet beschikbaar.');

  return new Promise((klaar) => {
    // Twee tabbladen in de kiezer. Zonder de tweede zie je alleen wat je zelf
    // bezit, en dus niet de sheet die je partner met je heeft gedeeld - precies
    // het geval dat hier speelt.
    const eigen = new picker.DocsView(picker.ViewId.SPREADSHEETS)
      .setOwnedByMe(true).setLabel('Van mij');
    const gedeeld = new picker.DocsView(picker.ViewId.SPREADSHEETS)
      .setOwnedByMe(false).setLabel('Gedeeld met mij');

    new picker.PickerBuilder()
      .setDeveloperKey(config.apiKey)
      .setOAuthToken(t)
      // Zonder appId koppelt Google de toestemming aan geen enkele app: je kiest
      // wel een bestand, maar de app mag er daarna nog steeds niet bij en krijgt
      // een 404. Het projectnummer staat vooraan in het client-ID.
      .setAppId(projectnummer(config.clientId))
      .addView(eigen)
      .addView(gedeeld)
      .setTitle(titel)
      .setCallback((antwoord) => {
        if (antwoord.action === picker.Action.CANCEL) return klaar(null);
        if (antwoord.action !== picker.Action.PICKED) return;
        const doc = antwoord.docs?.[0];
        klaar(doc?.id ? { id: doc.id, naam: doc.name ?? 'naamloos' } : null);
      })
      .build()
      .setVisible(true);
  });
}
