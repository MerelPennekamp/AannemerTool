/**
 * De stukjes van Google's scripts die deze app gebruikt.
 *
 * Beide scripts hangen zichzelf aan hetzelfde `window.google`, dus de types
 * horen op een plek te staan. Twee losse declaraties in twee bestanden
 * spreken elkaar tegen.
 */

interface GoogleTokenAntwoord {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken(opties?: { prompt?: string }): void;
}

interface GooglePickerBouwer {
  setDeveloperKey(sleutel: string): GooglePickerBouwer;
  setOAuthToken(token: string): GooglePickerBouwer;
  /** Zonder dit weet Google niet welke app toegang moet krijgen tot het gekozen bestand. */
  setAppId(appId: string): GooglePickerBouwer;
  addView(weergave: unknown): GooglePickerBouwer;
  setTitle(titel: string): GooglePickerBouwer;
  setCallback(fn: (antwoord: GooglePickerAntwoord) => void): GooglePickerBouwer;
  build(): { setVisible(zichtbaar: boolean): void };
}

interface GooglePickerWeergave {
  /** true toont wat je zelf bezit, false wat een ander met je heeft gedeeld. */
  setOwnedByMe(eigen: boolean): GooglePickerWeergave;
  setLabel(tekst: string): GooglePickerWeergave;
}

interface GooglePickerAntwoord {
  action?: string;
  docs?: { id?: string; name?: string }[];
}

interface Window {
  gapi?: {
    load(naam: string, klaar: () => void): void;
  };
  google?: {
    accounts?: {
      oauth2: {
        initTokenClient(opties: {
          client_id: string;
          scope: string;
          prompt?: string;
          callback: (antwoord: GoogleTokenAntwoord) => void;
          error_callback?: (fout: { type?: string }) => void;
        }): GoogleTokenClient;
        revoke(token: string, klaar?: () => void): void;
      };
    };
    picker?: {
      PickerBuilder: new () => GooglePickerBouwer;
      DocsView: new (weergave?: unknown) => GooglePickerWeergave;
      ViewId: { SPREADSHEETS: unknown };
      Action: { PICKED: string; CANCEL: string };
      Feature: { SUPPORT_DRIVES: unknown };
    };
  };
}
