/**
 * Maakt van de echte bronsheet een testbestand zonder persoonsgegevens.
 *
 * Wat blijft: de vorm. Aantal rijen en kolommen, waar de koppen staan, welke
 * kolommen leeg zijn, de kapotte formuledatums, de dubbele bestelling, de
 * optelrij onderaan Fases. Dat is wat de lezers moeten aankunnen.
 *
 * Wat weggaat: bedrijfsnamen en telefoonnummers van vaklui (dat zijn gegevens
 * van derden), alle bedragen, en alles uit namen.local.json - dat bestand
 * bevat de persoonsnamen en adressen en blijft buiten git.
 *
 * Draaien:  node test/fixtures/opschonen.mjs <echte.json> <uit.json>
 * Het echte bestand hoort niet in git.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [, , invoer, uitvoer] = process.argv;
if (!invoer || !uitvoer) {
  console.error('gebruik: node opschonen.mjs <echte.json> <uit.json>');
  process.exit(1);
}

const d = JSON.parse(readFileSync(invoer, 'utf8'));
const tekst = (v) => (v === null || v === undefined ? '' : String(v));

// Vaste verzonnen waarden, geen toeval: het bestand moet reproduceerbaar zijn.
const BEDRIJVEN = [
  'Bouwbedrijf Aardvark', 'Timmerwerk Bosman', 'Van Dalen Bouw', 'Eiken & Zn',
  'Fundament Groep', 'Grondig Bouwen', 'Hoeksteen Bouw', 'Stucwerk Iep',
  'Jansen Stukadoors', 'Kalk & Kwast', 'Lijmen en Laten', 'Muurvast Stuc',
  'Nivo Stucwerk', 'Asbestcheck Oost', 'Pandinspectie Pluim', 'Quickscan Asbest',
  'Rapport & Advies', 'Dakwerken Spits', 'Tegel en Dak', 'Uilenspiegel Dak',
  'Rioolservice Veen', 'Waterloop Inspectie', 'Containerdienst Xantus',
  'Installatie Ypsilon', 'Elektro Zonnehoek', 'Warmte Anders', 'Ketelservice Beek',
];
const VIA = ['buren', 'google', 'via familie', 'via collega', 'zoekmachine'];
const REACTIES = [
  'heeft pas plek in het najaar', 'offerte toegestuurd', 'wacht op antwoord',
  'kan volgende maand langskomen', 'is te druk dit jaar', 'belt nog terug',
];

const telefoon = (i) => `06 ${String(10000000 + i * 1111).slice(0, 8)}`;
const website = (naam) => `https://voorbeeld.nl/${naam.toLowerCase().replace(/[^a-z]+/g, '-')}`;

// --- Vaklui: functie blijft, de rest wordt verzonnen ------------------------
{
  const r = d['Vaklui'];
  const k = r[0].map((c) => tekst(c).toLowerCase());
  const kol = (naam) => k.indexOf(naam);
  let n = 0;
  for (let i = 1; i < r.length; i++) {
    if (!tekst(r[i][kol('naam bedrijf')])) continue;
    const bedrijf = BEDRIJVEN[n % BEDRIJVEN.length];
    r[i][kol('naam bedrijf')] = bedrijf;
    if (kol('telefoonnummer') >= 0 && tekst(r[i][kol('telefoonnummer')])) {
      r[i][kol('telefoonnummer')] = telefoon(n);
    }
    if (kol('link') >= 0 && tekst(r[i][kol('link')])) r[i][kol('link')] = website(bedrijf);
    if (kol('reactie') >= 0 && tekst(r[i][kol('reactie')])) {
      r[i][kol('reactie')] = REACTIES[n % REACTIES.length];
    }
    if (kol('prijs') >= 0 && tekst(r[i][kol('prijs')])) r[i][kol('prijs')] = `ongeveer ${500 + n * 125}`;
    if (kol('via') >= 0 && tekst(r[i][kol('via')])) r[i][kol('via')] = VIA[n % VIA.length];
    // kolom 9 heeft geen kop en bevat een losse offertelink
    if (tekst(r[i][9])) r[i][9] = 'https://voorbeeld.nl/offerte';
    n++;
  }
}

// --- Afrekening: ontvangers, omschrijvingen, bedragen, facturen -------------
{
  const r = d['Afrekening'];
  const k = r[0].map((c) => tekst(c).toLowerCase());
  const kol = (naam) => k.indexOf(naam);
  let n = 0;
  for (let i = 1; i < r.length; i++) {
    if (!tekst(r[i][kol('ontvanger')])) continue;
    const bedrijf = BEDRIJVEN[(n + 3) % BEDRIJVEN.length];
    r[i][kol('ontvanger')] = bedrijf;
    r[i][kol('bedrag')] = 100 + n * 250;   // oplopend, geen echte bedragen
    r[i][kol('omschrijving')] = `Werkzaamheden ${n + 1}`;
    if (kol('bron') >= 0) r[i][kol('bron')] = 'Gezamenlijke rekening';
    if (kol('betaler') >= 0 && tekst(r[i][kol('betaler')])) r[i][kol('betaler')] = '50/50';
    if (kol('factuur') >= 0 && tekst(r[i][kol('factuur')])) r[i][kol('factuur')] = `factuur-${n + 1}.pdf`;
    n++;
  }
  // de totaalrij onderaan meetellen zoals de sheet dat zelf doet
  const totaal = r.slice(1).filter((rij) => tekst(rij[kol('ontvanger')]))
    .reduce((a, rij) => a + Number(rij[kol('bedrag')]), 0);
  const laatste = r.at(-1);
  if (laatste && !tekst(laatste[kol('ontvanger')])) laatste[kol('bedrag')] = totaal;
  console.log('Afrekening: nieuw totaal =', totaal);
}

// --- Begroting: alle bedragen weg -------------------------------------------
// De labels ("3. Badkamer") blijven; namen erin worden door de slotronde
// hieronder opgeruimd.
{
  const r = d['Begroting'];
  for (const rij of r) {
    for (let j = 0; j < rij.length; j++) {
      if (typeof rij[j] === 'number' && rij[j] !== 0) {
        // bedragen vervangen, maar de blokstructuur intact laten
        rij[j] = Math.max(500, Math.round((1000 + r.indexOf(rij) * 250 + j * 125) / 50) * 50);
      }
    }
  }
}

// --- Boodschappenlijst: leveranciers en productlinks -----------------------
// De kolom Levertijd blijft woordelijk staan: daar test de levertijd-lezer op
// ("Volgende dag in huis", "langste 4 weken", "Begin september").
{
  const r = d['Boodschappenlijst'];
  const k = r[0].map((c) => tekst(c).toLowerCase());
  const kol = (naam) => k.indexOf(naam);
  const WINKELS = ['Webshop Alfa', 'Bouwmarkt Beta', 'Sanitair Gamma', 'Woonwinkel Delta'];
  let n = 0;
  for (let i = 1; i < r.length; i++) {
    if (!tekst(r[i][kol('naam item')])) continue;
    const winkel = WINKELS[n % WINKELS.length];
    if (kol('leveraar') >= 0) r[i][kol('leveraar')] = winkel;
    if (kol('link') >= 0 && tekst(r[i][kol('link')])) {
      r[i][kol('link')] = `https://voorbeeld.nl/${winkel.toLowerCase().replace(/\W+/g, '-')}/artikel-${n + 1}`;
    }
    if (kol('prijs') >= 0 && tekst(r[i][kol('prijs')])) r[i][kol('prijs')] = `Ongeveer ${200 + n * 150}`;
    n++;
  }
}

// --- Slotronde: namen en adres uit elke cel van elk tabblad -----------------
// De per-tabblad stappen hierboven raken alleen de kolommen die ze kennen.
// Persoonsnamen duiken ook op in vrije tekst en zelfs in categorielabels, dus
// hier gaat er nog een ronde over elke cel van elk tabblad.
const NAMENLIJST = new URL('./namen.local.json', import.meta.url);
let OPSCHONEN = [];
if (existsSync(NAMENLIJST)) {
  // [[patroon, vervanging], ...] - staat niet in git, want de lijst zelf
  // verklapt precies wie en wat er weggehaald moet worden.
  OPSCHONEN = JSON.parse(readFileSync(NAMENLIJST, 'utf8'))
    .map(([p, v]) => [new RegExp(p, 'gi'), v]);
} else {
  console.warn('Let op: namen.local.json ontbreekt, er worden geen namen vervangen.');
}

for (const tab of Object.keys(d)) {
  const r = d[tab];
  for (let i = 0; i < r.length; i++) {
    for (let j = 0; j < r[i].length; j++) {
      if (typeof r[i][j] !== 'string') continue;
      let s = r[i][j];
      for (const [patroon, vervanging] of OPSCHONEN) s = s.replace(patroon, vervanging);
      r[i][j] = s;
    }
  }
}

writeFileSync(uitvoer, JSON.stringify(d));
console.log('geschreven:', uitvoer);
