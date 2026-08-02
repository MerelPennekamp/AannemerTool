import { laadConfig, ConfigOntbreekt } from './data/config.js';
import { logIn, haalProfiel, isIngelogd, uitloggen, NietIngelogd } from './data/auth.js';
import { kiesSpreadsheet } from './data/picker.js';
import {
  haalTabbladen, haalTabbladnamen, maakSheet, zorgVoorTabbladen, schrijfTabblad,
  controleerToegang, SheetsFout,
} from './data/sheets.js';
import { leesInstellingen, bewaarInstellingen, wisInstellingen, isIngericht } from './data/instellingen.js';
import { leesBron, TABBLADEN } from './data/bron.js';
import { leesBackend, legeInhoud, BACKEND_TABBLADEN } from './data/backend.js';
import { bouwModel, type Model } from './model.js';

/**
 * De opstartkant van de app: inloggen, sheets aanwijzen, gegevens ophalen.
 *
 * Bewust klein gehouden. Zolang de inlog en de Sheets-koppeling niet op het
 * echte adres bewezen zijn, heeft het geen zin er schermen op te stapelen.
 */

const $ = (kies: string) => document.querySelector(kies) as HTMLElement;
const veilig = (s: unknown) =>
  String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));

const vandaag = () => new Date().toISOString().slice(0, 10);

let model: Model | null = null;

function toon(inhoud: string): void {
  $('#app').innerHTML = inhoud;
}

function meldFout(fout: unknown): string {
  if (fout instanceof ConfigOntbreekt) {
    return `<p class="fout">${veilig(fout.message)}</p>
      <p class="uitleg">Bij het bouwen hoort GitHub Actions dit bestand te schrijven uit de
      secrets <code>GOOGLE_CLIENT_ID</code> en <code>GOOGLE_API_KEY</code>. Draai je lokaal,
      maak dan <code>publiek/config.json</code> aan; zie config.voorbeeld.json.</p>`;
  }
  if (fout instanceof NietIngelogd) {
    return `<p class="fout">Inloggen is niet gelukt: ${veilig(fout.message)}</p>`;
  }
  if (fout instanceof SheetsFout) {
    return `<p class="fout">${veilig(fout.message)}</p>`;
  }
  return `<p class="fout">Er ging iets mis: ${veilig((fout as Error)?.message ?? fout)}</p>`;
}

// --- Schermen ---------------------------------------------------------------

function toonInloggen(): void {
  toon(`
    <h1>Verbouwing</h1>
    <p class="uitleg">Deze app leest je planning uit je eigen Google Sheets en houdt bij
    wat er af is. Er komt geen server aan te pas; je gegevens blijven in je eigen Drive.</p>
    <button class="knop" id="inloggen">Inloggen met Google</button>
    <p class="uitleg klein">De app vraagt alleen toegang tot bestanden die hij zelf aanmaakt
    of die jij aanwijst. Bij de rest van je Drive kan hij niet.</p>`);

  $('#inloggen').onclick = async () => {
    try {
      await logIn();
      await verder();
    } catch (fout) {
      toon(meldFout(fout) + '<button class="knop" id="opnieuw">Opnieuw</button>');
      $('#opnieuw').onclick = toonInloggen;
    }
  };
}

async function toonInrichten(): Promise<void> {
  const i = leesInstellingen();
  const profiel = await haalProfiel();

  toon(`
    <h1>Sheets aanwijzen</h1>
    <p class="uitleg">Ingelogd als ${veilig(profiel.naam)}.</p>

    <div class="stap">
      <h2>1. Je planning</h2>
      <p class="uitleg">De sheet met de tabbladen Fases, Belangrijke datums, Vaklui,
      Boodschappenlijst, Begroting en Afrekening. Hier wordt alleen uit gelezen.</p>
      <p class="gekozen">${i.bronSheetId
        ? `Gekozen: <strong>${veilig(i.bronSheetNaam)}</strong>` : 'Nog niet gekozen.'}</p>
      <button class="knop" id="kies-bron">${i.bronSheetId ? 'Andere kiezen' : 'Kiezen'}</button>
    </div>

    <div class="stap">
      <h2>2. Waar de app bijhoudt wat af is</h2>
      <p class="uitleg">Een aparte sheet die de app zelf beheert. Maak hem nieuw aan, of
      wijs de bestaande aan als de ander hem al heeft gemaakt.</p>
      <p class="gekozen">${i.backendSheetId
        ? `Gekozen: <strong>${veilig(i.backendSheetNaam)}</strong>` : 'Nog niet gekozen.'}</p>
      <button class="knop" id="maak-backend">Nieuwe aanmaken</button>
      <button class="knop rustig" id="kies-backend">Bestaande aanwijzen</button>
    </div>

    <div class="stap">
      <button class="knop" id="klaar" ${isIngericht(i) ? '' : 'disabled'}>Doorgaan</button>
      <button class="knop rustig" id="opnieuw-beginnen">Opnieuw beginnen</button>
    </div>`);

  const bezig = (knop: string, werk: () => Promise<void>) => {
    const el = $(knop) as HTMLButtonElement;
    el.onclick = async () => {
      el.disabled = true;
      try {
        await werk();
        await toonInrichten();
      } catch (fout) {
        toon(meldFout(fout) + '<button class="knop" id="terug">Terug</button>');
        $('#terug').onclick = () => void toonInrichten();
      }
    };
  };

  bezig('#kies-bron', async () => {
    const keuze = await kiesSpreadsheet('Kies de sheet met je planning');
    if (!keuze) return;
    // Direct controleren: een fout hier is te plaatsen, een scherm verderop niet.
    await controleerToegang(keuze.id);
    const namen = await haalTabbladnamen(keuze.id);
    const missend = TABBLADEN.filter((t) => !namen.includes(t));
    if (missend.length) {
      throw new Error(
        `In "${keuze.naam}" ontbreken deze tabbladen: ${missend.join(', ')}. `
        + 'Weet je zeker dat dit je planning-sheet is?',
      );
    }
    bewaarInstellingen({ bronSheetId: keuze.id, bronSheetNaam: keuze.naam });
  });

  bezig('#kies-backend', async () => {
    const keuze = await kiesSpreadsheet('Kies de sheet waarin de app bijhoudt');
    if (!keuze) return;
    // Ontbrekende tabbladen bijmaken, zodat een half opgezette sheet ook werkt.
    await zorgVoorTabbladen(keuze.id, BACKEND_TABBLADEN);
    bewaarInstellingen({ backendSheetId: keuze.id, backendSheetNaam: keuze.naam });
  });

  bezig('#maak-backend', async () => {
    const naam = `Verbouwing - voortgang`;
    const id = await maakSheet(naam, BACKEND_TABBLADEN);
    const leeg = legeInhoud();
    for (const tab of BACKEND_TABBLADEN) await schrijfTabblad(id, tab, leeg[tab]!);
    bewaarInstellingen({ backendSheetId: id, backendSheetNaam: naam });
  });

  $('#klaar').onclick = () => void laadEnToon();
  $('#opnieuw-beginnen').onclick = () => {
    wisInstellingen();
    void toonInrichten();
  };
}

async function laadEnToon(): Promise<void> {
  const i = leesInstellingen();
  toon('<p class="uitleg">Bezig met ophalen...</p>');

  try {
    const [bronRasters, backendRasters] = await Promise.all([
      haalTabbladen(i.bronSheetId, [...TABBLADEN]),
      haalTabbladen(i.backendSheetId, BACKEND_TABBLADEN),
    ]);

    model = bouwModel(leesBron(bronRasters), leesBackend(backendRasters), vandaag());
    toonOverzicht(model);
  } catch (fout) {
    toon(meldFout(fout)
      + '<button class="knop" id="nogmaals">Opnieuw proberen</button>'
      + '<button class="knop rustig" id="instellen">Sheets opnieuw aanwijzen</button>');
    $('#nogmaals').onclick = () => void laadEnToon();
    $('#instellen').onclick = () => void toonInrichten();
  }
}

function toonOverzicht(m: Model): void {
  const kritiek = m.taken.filter((t) => t.gepland?.kritiek);
  const klaar = m.taken.filter((t) => t.status === 'klaar').length;

  toon(`
    <h1>Verbouwing</h1>
    <p class="uitleg">${m.taken.length} taken, ${klaar} af.
      Loopt van ${veilig(m.begin)} tot ${veilig(m.einde)}.
      Sleuteldatum ${veilig(m.sleuteldatum)}.</p>

    <h2>Waarschuwingen</h2>
    ${m.waarschuwingen.length
      ? m.waarschuwingen.map((w) => `
        <div class="melding ${veilig(w.ernst)}">
          <strong>${veilig(w.kop)}</strong>
          <span class="uitleg">${veilig(w.uitleg)}</span>
        </div>`).join('')
      : '<p class="goed">Niets aan de hand: volgorde, planning en levertijden kloppen.</p>'}

    <h2>Kritiek pad</h2>
    <p class="uitleg">Schuift hier iets, dan schuift het einde mee.</p>
    <ol class="pad">${kritiek.map((t) =>
      `<li>${veilig(t.naam)} <span class="uitleg">${veilig(t.gepland!.start)} tot
        ${veilig(t.gepland!.eind)}</span></li>`).join('')}</ol>

    ${m.nietIngedeeld.length ? `<h2>Niet ingedeeld</h2>
      <p class="uitleg">Hier heeft de app niets van gemaakt; dat is beter dan iets verzinnen.</p>
      <ul>${m.nietIngedeeld.map((t) => `<li>${veilig(t.naam)}</li>`).join('')}</ul>` : ''}

    <div class="stap">
      <button class="knop" id="verversen">Verversen</button>
      <button class="knop rustig" id="instellingen">Sheets wijzigen</button>
      <button class="knop rustig" id="uitloggen">Uitloggen</button>
    </div>`);

  $('#verversen').onclick = () => void laadEnToon();
  $('#instellingen').onclick = () => void toonInrichten();
  $('#uitloggen').onclick = () => { uitloggen(); toonInloggen(); };
}

// --- Opstarten --------------------------------------------------------------

async function verder(): Promise<void> {
  if (!isIngericht()) return toonInrichten();
  return laadEnToon();
}

async function begin(): Promise<void> {
  try {
    await laadConfig();
  } catch (fout) {
    return toon(meldFout(fout));
  }

  if (isIngelogd()) return void verder();
  toonInloggen();
}

void begin();
