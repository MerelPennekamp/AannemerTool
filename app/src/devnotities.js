/**
 * Suggesties doorgeven, getypt of ingesproken.
 *
 * De issue vroeg om automatisch een GitHub-issue aanmaken. Dat kan niet zonder
 * een GitHub-token in de pagina te zetten, en deze pagina is openbaar: iedereen
 * zou dat token kunnen lezen en ermee in de repo schrijven. In plaats daarvan
 * opent de knop GitHub met de issue al ingevuld. Een klik extra, geen sleutel
 * op straat.
 *
 * Inspreken gaat via de spraakherkenning van de browser. Die zit in Chrome en
 * Edge, niet in Firefox; ontbreekt hij, dan verdwijnt de microfoonknop en kun
 * je gewoon typen.
 */

const REPO = 'https://github.com/MerelPennekamp/AannemerTool';

const Herkenning = window.SpeechRecognition ?? window.webkitSpeechRecognition;

let herkenner = null;
let luistert = false;

function maakHerkenner(opTekst, opEinde) {
  const h = new Herkenning();
  h.lang = 'nl-NL';
  h.continuous = true;
  h.interimResults = true;

  let vast = '';
  h.onresult = (e) => {
    let voorlopig = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const stuk = e.results[i][0].transcript;
      if (e.results[i].isFinal) vast += stuk;
      else voorlopig += stuk;
    }
    opTekst(vast, voorlopig);
  };
  h.onerror = (e) => opEinde(e.error);
  h.onend = () => opEinde(null);
  return h;
}

export function toonDevNotitie() {
  const venster = document.querySelector('#dev-venster');

  venster.innerHTML = `
    <h3>Suggestie voor de app</h3>
    <p class="meta">Wat kan er beter? Typ het, of spreek het in en pas het daarna aan.</p>
    <textarea id="dev-tekst" rows="6"
      placeholder="Bijvoorbeeld: ik wil per taak kunnen zien wie eraan werkt"></textarea>
    <p class="meta" id="dev-stand"></p>
    <div class="knoprij">
      ${Herkenning ? '<button class="actie" id="dev-spreek">Inspreken</button>' : ''}
      <button class="actie" id="dev-verstuur">Versturen</button>
      <span style="flex:1"></span>
      <button class="actie" id="dev-sluit">Sluiten</button>
    </div>
    <p class="meta">Versturen opent GitHub met je tekst er al in; daar klik je op
      "Submit new issue". Dat gaat met opzet zo: automatisch versturen zou een
      sleutel in deze pagina vereisen, en die is voor iedereen te lezen.</p>`;

  const tekstvak = venster.querySelector('#dev-tekst');
  const stand = venster.querySelector('#dev-stand');
  const spreekKnop = venster.querySelector('#dev-spreek');

  const stoppen = () => {
    if (herkenner) herkenner.stop();
    luistert = false;
    if (spreekKnop) spreekKnop.textContent = 'Inspreken';
  };

  if (spreekKnop) {
    // Wat er al stond blijft staan; ingesproken tekst komt erachteraan.
    let begintekst = '';

    spreekKnop.onclick = () => {
      if (luistert) {
        stoppen();
        stand.textContent = 'Gestopt. Je kunt de tekst nu aanpassen.';
        return;
      }
      begintekst = tekstvak.value ? `${tekstvak.value.trim()} ` : '';
      herkenner = maakHerkenner(
        (vast, voorlopig) => { tekstvak.value = begintekst + vast + voorlopig; },
        (fout) => {
          luistert = false;
          spreekKnop.textContent = 'Inspreken';
          stand.textContent = fout
            ? `Inspreken lukte niet (${fout}). Typen kan altijd.`
            : 'Klaar. Je kunt de tekst nu aanpassen.';
        },
      );
      herkenner.start();
      luistert = true;
      spreekKnop.textContent = 'Stoppen';
      stand.textContent = 'Aan het luisteren...';
    };
  }

  venster.querySelector('#dev-verstuur').onclick = () => {
    stoppen();
    const tekst = tekstvak.value.trim();
    if (!tekst) {
      stand.textContent = 'Er staat nog niets in.';
      return;
    }
    // Eerste regel als titel, de hele tekst als toelichting.
    const eersteRegel = tekst.split('\n')[0].slice(0, 70);
    const url = `${REPO}/issues/new?title=${encodeURIComponent(eersteRegel)}`
      + `&body=${encodeURIComponent(tekst)}`;
    window.open(url, '_blank', 'noopener');
    venster.close();
  };

  venster.querySelector('#dev-sluit').onclick = () => { stoppen(); venster.close(); };
  venster.addEventListener('close', stoppen, { once: true });
  venster.showModal();
}

export function koppelDevKnop() {
  const knop = document.querySelector('#dev-knop');
  if (knop) knop.onclick = toonDevNotitie;
}
