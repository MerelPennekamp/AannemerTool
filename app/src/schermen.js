/**
 * De schermen: planning met Gantt, week en maand, plus taken, vaklui,
 * bestellingen en budget.
 *
 * Overgezet van de serverversie. De tekenfuncties zijn ongewijzigd gebleven;
 * alleen waar ze gegevens ophaalden bij /api/... lezen ze nu uit het model dat
 * uit de sheets is opgebouwd. Bewust nog gewoon JavaScript: het is werkende,
 * geteste code, en die overtypen naar TypeScript zou risico toevoegen zonder
 * dat er iets beter van wordt. De randen zijn getypeerd in schermen.d.ts.
 */

let model = null;
let opnieuwLaden = async () => model;
let ingelogdeNaam = () => 'onbekend';
let schrijfStatus = async () => {};
let schrijfNotitie = async () => {};

const $ = (s) => document.querySelector(s);
const veilig = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));

const DAG = 86400000;
const dat = (s) => new Date(s + 'T00:00:00Z');
const iso = (d) => d.toISOString().slice(0, 10);
const plus = (s, n) => iso(new Date(dat(s).getTime() + n * DAG));
const tussen = (a, b) => Math.round((dat(b) - dat(a)) / DAG);
const VANDAAG = iso(new Date());

const kort = (s) => dat(s).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dagNaam = (s) => dat(s).toLocaleDateString('nl-NL', { weekday: 'long', timeZone: 'UTC' });
const maandNaam = (s) => dat(s).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const TABS = [['planning','Planning'],['taken','Taken'],['vaklui','Vaklui'],
              ['bestellingen','Bestellingen'],['budget','Budget']];
let actief = 'planning';
let weergave = 'gantt';
let anker = VANDAAG;
const loopt = (t, dag) => t.start <= dag && dag <= t.eind;

function tekenTabs() {
  $('#tabs').innerHTML = TABS.map(([id, label]) =>
    `<button data-tab="${id}" aria-selected="${id === actief}">${label}</button>`).join('');
  $('#tabs').onclick = (e) => {
    const tab = e.target.closest('button')?.dataset.tab;
    if (tab) { actief = tab; tekenTabs(); teken(); }
  };
}

function kop() {
  const klaar = model.taken.filter((t) => t.status === 'klaar').length;
  const stukjes = [`${model.taken.length} taken`, `${klaar} klaar`];
  if (model.nietIngedeeld.length) {
    stukjes.push(`<span class="let-op">${model.nietIngedeeld.length} niet ingedeeld</span>`);
  }
  $('#kop').innerHTML = `${stukjes.join(' &middot; ')} &middot; ingelogd als ${veilig(ingelogdeNaam())}
    <button class="actie" id="ververs" style="margin-left:6px">Verversen</button>`;
  $('#ververs').onclick = async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Bezig...';
    try {
      model = await opnieuwLaden();
      kop(); teken();
    } catch (fout) {
      e.target.disabled = false;
      e.target.textContent = 'Verversen';
      alert(`Verversen mislukt: ${fout?.message ?? fout}`);
    }
  };
}

/** De planning in de vorm die de tekenfuncties verwachten: plat, niet genest. */
function haalPlanning() {
  return {
    begin: model.begin,
    einde: model.einde,
    kringloop: model.kringloop,
    taken: model.taken.filter((t) => t.gepland).map((t) => ({
      id: t.sleutel,
      naam: t.naam,
      status: t.status,
      werksoort: t.werksoort,
      ruimtes: t.ruimtes.join(','),
      categorie: t.categorie,
      start: t.gepland.start,
      eind: t.gepland.eind,
      duur: t.gepland.duur,
      duurGeschat: t.gepland.duurGeschat,
      kritiek: t.gepland.kritiek,
      speling: t.gepland.speling,
    })),
  };
}

function haalWaarschuwingen() {
  return model.waarschuwingen.map((w) => ({
    ...w,
    taakId: w.taakId === null ? null : model.taken[w.taakId - 1]?.sleutel ?? null,
  }));
}

const SOORT_LABEL = { volgorde: 'volgorde', 'krappe-planning': 'krap', levertijd: 'levertijd' };

function tekenPlanning() {
  const p = haalPlanning();
  const meldingen = haalWaarschuwingen();
  const knoppen = [['gantt','Gantt'],['week','Week'],['maand','Maand']]
    .map(([id, l]) => `<button data-weergave="${id}" aria-selected="${weergave === id}">${l}</button>`).join('');

  const waarschuwing = p.kringloop
    ? `<p class="let-op">De regels spreken elkaar tegen: er zit een kringloop in de volgorde.
       De planning hieronder is daardoor onvolledig.</p>` : '';

  const meldingblok = meldingen.length
    ? meldingen.map((m) => `
        <button class="melding ${m.ernst}" ${m.taakId ? `data-id="${m.taakId}"` : ''}>
          <b><span class="soort">${SOORT_LABEL[m.soort] ?? m.soort}</span>${veilig(m.kop)}</b>
          <small>${veilig(m.uitleg)}</small>
        </button>`).join('')
    : '<p class="rustig">Geen waarschuwingen: volgorde, planning en levertijden kloppen.</p>';

  $('#inhoud').innerHTML = `
    <div class="balkrij">
      <div class="schakel" id="weergaven">${knoppen}</div>
      <span style="flex:1"></span>
      <span class="meta" id="bereik"></span>
    </div>
    ${waarschuwing}
    <div id="meldingen" style="margin-bottom:14px">${meldingblok}</div>
    <div id="weergavevak"></div>`;

  $('#weergaven').onclick = (e) => {
    const w = e.target.closest('button')?.dataset.weergave;
    if (w) { weergave = w; anker = VANDAAG; tekenPlanning(); }
  };

  $('#meldingen').onclick = (e) => {
    const id = e.target.closest('.melding')?.dataset.id;
    if (id) toonDetail(id);
  };

  if (weergave === 'gantt') tekenGantt(p);
  if (weergave === 'week') tekenWeek(p);
  if (weergave === 'maand') tekenMaand(p);
}

function tekenGantt(p) {
  const begin = p.begin, einde = p.einde;
  const dagen = tussen(begin, einde) + 1;
  const smal = window.innerWidth < 700;
  const bd = smal ? 12 : 22;
  const naamBreedte = smal ? 120 : 230;

  $('#bereik').textContent = `${kort(begin)} tot ${kort(einde)}, ${dagen} dagen`;

  const maanden = [];
  for (let i = 0; i < dagen; i++) {
    const d = plus(begin, i);
    const sleutel = d.slice(0, 7);
    if (!maanden.length || maanden.at(-1).sleutel !== sleutel) {
      maanden.push({ sleutel, label: maandNaam(d), dagen: 1 });
    } else maanden.at(-1).dagen++;
  }

  const dagkoppen = Array.from({ length: dagen }, (_, i) => {
    const d = plus(begin, i);
    return `<div class="dagkop" style="width:${bd}px">${smal ? '' : dat(d).getUTCDate()}</div>`;
  }).join('');

  const rijen = p.taken.map((t) => {
    const links = tussen(begin, t.start) * bd;
    const breed = Math.max(bd * Math.max(t.duur, 1), 8);
    const klassen = ['balk', t.kritiek ? 'op-pad' : '', t.status === 'klaar' ? 'af' : '',
                     t.duurGeschat ? 'geschat' : ''].filter(Boolean).join(' ');
    return `<div class="rij" style="--cat:var(--cat-${t.categorie})">
      <div class="rij-naam" style="width:${naamBreedte}px" data-id="${t.id}"
           title="${veilig(t.naam)}"><i></i>${veilig(t.naam)}</div>
      <div class="spoor" style="width:${dagen * bd}px">
        <div class="${klassen}" style="left:${links}px;width:${breed}px" data-id="${t.id}"
             title="${veilig(t.naam)} (${t.start} tot ${t.eind})"></div>
      </div>
    </div>`;
  }).join('');

  const nuLinks = VANDAAG >= begin && VANDAAG <= einde
    ? `<div class="nu" style="left:${naamBreedte + tussen(begin, VANDAAG) * bd}px"></div>` : '';

  $('#weergavevak').innerHTML = `
    <div class="gantt"><div class="gantt-binnen" style="width:${naamBreedte + dagen * bd}px">
      <div class="as">
        <div class="as-naam" style="width:${naamBreedte}px">
          <div class="maandkop">taak</div><div class="dagkop">&nbsp;</div>
        </div>
        <div>
          <div style="display:flex">${maanden.map((m) =>
            `<div class="maandkop" style="width:${m.dagen * bd}px">${m.label}</div>`).join('')}</div>
          <div style="display:flex">${dagkoppen}</div>
        </div>
      </div>
      ${nuLinks}
      ${rijen}
    </div></div>
    ${legenda()}
    <p class="meta" style="margin-top:6px">
      Gestreept betekent dat de duur niet in de sheet stond en op een dag is gezet.</p>`;

  $('#weergavevak').onclick = (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (id) toonDetail(id);
  };
}

const CATEGORIEN = [
  ['onderzoek', 'Onderzoek en voorbereiding'],
  ['sloop', 'Sloop'],
  ['ruwbouw', 'Ruwbouw'],
  ['installatie', 'Installatie'],
  ['afwerking', 'Afwerking'],
  ['inrichting', 'Inrichting'],
];
const GEEN_WERK = new Set(['mijlpaal', 'afspraak', 'onbekend']);

function legenda() {
  return `<div class="legenda">
    ${CATEGORIEN.map(([id, label]) =>
      `<span style="--cat:var(--cat-${id})"><i></i>${label}</span>`).join('')}
    <span><i class="omlijnd"></i>Mijlpaal of afspraak</span>
    <span><i class="pad"></i>Kritiek pad</span>
  </div>`;
}

/** Een kaartje draagt zijn eigen naam, dus de kleur hoeft niets alleen te dragen. */
function kaartje(t, dag, beknopt) {
  const klassen = ['kaart-taak',
    GEEN_WERK.has(t.categorie) ? 'geen-werk' : '',
    t.status === 'klaar' ? 'af' : '',
    t.kritiek ? 'op-pad' : ''].filter(Boolean).join(' ');

  const fase = dag && t.start === dag ? 'start' : dag && t.eind === dag ? 'klaar' : 'loopt';
  const bij = [fase, veilig(t.werksoort ?? ''), veilig(t.ruimtes ?? '')]
    .filter(Boolean).join(' &middot; ');

  return `<button class="${klassen}" style="--cat:var(--cat-${veilig(t.categorie)})"
    data-id="${t.id}" title="${veilig(t.naam)} (${t.start} tot ${t.eind})">
    <b>${veilig(t.naam)}</b>${beknopt ? '' : `<small>${bij}</small>`}</button>`;
}

function tekenWeek(p) {
  const maandag = plus(anker, -((dat(anker).getUTCDay() + 6) % 7));
  $('#bereik').textContent = `${kort(maandag)} tot ${kort(plus(maandag, 6))}`;

  const kolommen = Array.from({ length: 7 }, (_, i) => plus(maandag, i)).map((d, i) => {
    const bezig = p.taken.filter((t) => loopt(t, d));
    return `<div class="kolom ${i > 4 ? 'weekend' : ''} ${d === VANDAAG ? 'nu-dag' : ''}">
      <h3>${dagNaam(d).slice(0, 2)} ${dat(d).getUTCDate()}</h3>
      ${bezig.map((t) => kaartje(t, d, false)).join('')
        || '<p class="leeg" style="font-size:12px;margin:0">niets</p>'}
    </div>`;
  }).join('');

  $('#weergavevak').innerHTML = `
    <div class="balkrij">
      <button class="actie" data-stap="-7">Vorige</button>
      <button class="actie" data-stap="0">Deze week</button>
      <button class="actie" data-stap="7">Volgende</button>
    </div>
    <div class="week">${kolommen}</div>
    ${legenda()}`;
  koppelNavigatie('week');
}

function tekenMaand(p) {
  const eerste = anker.slice(0, 8) + '01';
  $('#bereik').textContent = maandNaam(eerste);

  const start = plus(eerste, -((dat(eerste).getUTCDay() + 6) % 7));
  const cellen = Array.from({ length: 42 }, (_, i) => plus(start, i)).map((d) => {
    const bezig = p.taken.filter((t) => loopt(t, d));
    const buiten = d.slice(0, 7) !== eerste.slice(0, 7);
    return `<div class="cel ${buiten ? 'buiten' : ''} ${d === VANDAAG ? 'nu-dag' : ''}" data-dag="${d}">
      <b>${dat(d).getUTCDate()}</b>
      ${bezig.slice(0, 3).map((t) => kaartje(t, d, true)).join('')}
      ${bezig.length > 3 ? `<div class="meer">nog ${bezig.length - 3}</div>` : ''}
    </div>`;
  }).join('');

  $('#weergavevak').innerHTML = `
    <div class="balkrij">
      <button class="actie" data-stap="-1">Vorige</button>
      <button class="actie" data-stap="0">Deze maand</button>
      <button class="actie" data-stap="1">Volgende</button>
    </div>
    <div class="maand">
      ${['ma','di','wo','do','vr','za','zo'].map((d) => `<div class="kop">${d}</div>`).join('')}
      ${cellen}
    </div>
    ${legenda()}
    <div id="dagdetail"></div>`;

  koppelNavigatie('maand');

  $('.maand').onclick = (e) => {
    if (e.target.closest('.kaart-taak')) return;   // dat opent het taakdetail
    const d = e.target.closest('.cel')?.dataset.dag;
    if (!d) return;
    const bezig = p.taken.filter((t) => loopt(t, d));
    $('#dagdetail').innerHTML = `<div class="groep" style="margin-top:16px">
      <h2>${dagNaam(d)} ${kort(d)}</h2>
      ${bezig.map((t) => kaartje(t, d, false)).join('') || '<p class="leeg">Niets gepland.</p>'}
    </div>`;
  };
}

function koppelNavigatie(soort) {
  const vak = $('#weergavevak');
  vak.querySelectorAll('[data-stap]').forEach((knop) => {
    knop.onclick = () => {
      const n = Number(knop.dataset.stap);
      if (n === 0) anker = VANDAAG;
      else if (soort === 'maand') {
        const d = dat(anker.slice(0, 8) + '01');
        d.setUTCMonth(d.getUTCMonth() + n);
        anker = iso(d);
      } else anker = plus(anker, n);
      tekenPlanning();
    };
  });
  vak.addEventListener('click', (e) => {
    const id = e.target.closest('.kaart-taak')?.dataset.id;
    if (id) toonDetail(id);
  });
}

function tekenTaken() {
  const perRuimte = new Map();
  for (const t of model.taken) {
    const s = t.ruimtes.join(',') || 'geen ruimte';
    perRuimte.set(s, [...(perRuimte.get(s) ?? []), t]);
  }
  const volgorde = [...perRuimte.keys()].sort((a, b) =>
    (a === 'geen ruimte') - (b === 'geen ruimte') || a.localeCompare(b));

  $('#inhoud').innerHTML = volgorde.map((ruimte) => `
    <section class="groep">
      <h2>${veilig(ruimte.replaceAll(',', ' + '))}</h2>
      ${perRuimte.get(ruimte).map((t) => `
        <div class="taak" data-id="${veilig(t.sleutel)}">
          <span class="stip ${veilig(t.status)}"></span>
          <span class="naam">${veilig(t.naam)}
            <small>${t.werksoort ? veilig(t.werksoort)
              : '<span class="let-op">niet ingedeeld</span>'}${
              t.notities ? ` &middot; ${t.notities} notitie(s)` : ''}</small></span>
          <span class="duur">${t.duurDagen != null ? `${t.duurDagen} d` : ''}</span>
        </div>`).join('')}
    </section>`).join('');

  $('#inhoud').onclick = (e) => {
    const id = e.target.closest('.taak')?.dataset.id;
    if (id) toonDetail(id);
  };
}

async function toonDetail(sleutel) {
  const t = model.taken.find((x) => x.sleutel === sleutel);
  if (!t) return;

  const naamVan = (s) => model.taken.find((x) => x.sleutel === s)?.naam ?? s;
  const statusVan = (s) => model.taken.find((x) => x.sleutel === s)?.status ?? 'te-doen';
  const ervoor = model.koppelingen.filter((k) => k.naSleutel === sleutel);
  const erna = model.koppelingen.filter((k) => k.voorSleutel === sleutel);
  const notities = model.notities.filter((n) => n.sleutel === sleutel)
    .sort((a, b) => b.gemaaktOp.localeCompare(a.gemaaktOp));

  const lijst = (items, kant, leeg) => items.length
    ? `<ul>${items.map((k) => {
        const s2 = kant === 'voor' ? k.voorSleutel : k.naSleutel;
        return `<li>${veilig(naamVan(s2))}${statusVan(s2) === 'klaar' ? ' &#10003;' : ''}
          <br><span class="meta">${veilig(k.uitleg)}</span></li>`;
      }).join('')}</ul>`
    : `<p class="leeg">${leeg}</p>`;

  const g = t.gepland;
  $('#detail').innerHTML = `
    <h3>${veilig(t.naam)}</h3>
    <div class="meta">${veilig(t.werksoort ?? 'niet ingedeeld')}${
      t.ruimtes.length ? ' &middot; ' + veilig(t.ruimtes.join(', ')) : ''}</div>
    ${g ? `<div class="meta">${kort(g.start)} tot ${kort(g.eind)} &middot;
      ${g.duur} dag(en)${g.duurGeschat ? ' (geschat)' : ''} &middot;
      ${g.kritiek ? '<span class="let-op">kritiek pad</span>'
        : `${g.speling} dagen speling`}</div>` : ''}
    ${t.functies.length ? `<div class="meta">Vakman: ${veilig(t.functies.join(', '))}</div>` : ''}
    <div class="knoprij">
      ${['te-doen','bezig','klaar'].map((st) =>
        `<button class="actie" data-status="${st}"${
          st === t.status ? ' style="border-color:var(--accent)"' : ''}>${st}</button>`).join('')}
    </div>
    <p class="meta"><strong>Moet hiervoor klaar zijn</strong></p>${lijst(ervoor, 'voor', 'Niets, dit kan meteen.')}
    <p class="meta" style="margin-top:10px"><strong>Wacht hierop</strong></p>${lijst(erna, 'na', 'Niets.')}
    <p class="meta" style="margin-top:10px"><strong>Notities</strong></p>
    ${notities.map((n) => `<p style="font-size:14px;margin:4px 0">${veilig(n.tekst)}<br>
      <span class="meta">${veilig(n.auteur)} &middot; ${veilig(n.gemaaktOp.slice(0, 16).replace('T', ' '))}</span></p>`).join('')
      || '<p class="leeg">Nog geen notities.</p>'}
    <textarea id="nieuwe-notitie" rows="2" placeholder="Notitie toevoegen"></textarea>
    <div class="knoprij">
      <button class="actie" id="notitie-opslaan">Opslaan als ${veilig(ingelogdeNaam())}</button>
      <span style="flex:1"></span>
      <button class="actie" id="sluit">Sluiten</button>
    </div>
    <p class="meta" id="detail-melding"></p>`;

  const melden = (tekst) => { $('#detail-melding').textContent = tekst; };

  $('#detail').onclick = async (e) => {
    const knop = e.target.closest('button');
    if (!knop) return;

    if (knop.dataset.status) {
      knop.disabled = true;
      melden('Bezig met opslaan...');
      try {
        await schrijfStatus(sleutel, knop.dataset.status);
        // Opnieuw ophalen: de sheet is de waarheid, en de ander kan er
        // ondertussen ook iets in hebben gezet.
        model = await opnieuwLaden();
        $('#detail').close();
        kop(); teken();
      } catch (fout) {
        knop.disabled = false;
        melden(`Opslaan mislukt: ${fout?.message ?? fout}`);
      }
    }

    if (knop.id === 'notitie-opslaan') {
      const tekst = $('#nieuwe-notitie').value.trim();
      if (!tekst) return;
      knop.disabled = true;
      melden('Bezig met opslaan...');
      try {
        await schrijfNotitie(sleutel, tekst);
        model = await opnieuwLaden();
        $('#detail').close();
        kop(); teken();
      } catch (fout) {
        knop.disabled = false;
        melden(`Opslaan mislukt: ${fout?.message ?? fout}`);
      }
    }

    if (knop.id === 'sluit') $('#detail').close();
  };
  $('#detail').showModal();
}

function tekenVaklui() {
  const groepen = [...model.vaklui.values()];
  $('#inhoud').innerHTML = groepen.map((g) => `
    <section class="groep">
      <h2>${veilig(g.functie)}</h2>
      <table><tbody>${g.kandidaten.map((v) => `<tr>
        <td><strong>${veilig(v.bedrijf)}</strong><br>
          <span class="meta">${veilig(v.status || v.benaderd || '')}</span></td>
        <td class="meta">${veilig(v.telefoon || '')}</td>
      </tr>`).join('')}</tbody></table>
      <p class="meta" style="margin-top:5px">${
        g.gekozen ? `Gekozen: <strong>${veilig(g.gekozen.bedrijf)}</strong>`
                  : `${g.kandidaten.length} kandidaat(en), nog niemand aangekruist.`}</p>
    </section>`).join('');
}

function tekenBestellingen() {
  $('#inhoud').innerHTML = `<table>
    <thead><tr><th>Item</th><th>Leverancier</th><th>Levertijd</th><th>Nodig op</th></tr></thead>
    <tbody>${model.bron.bestellingen.map((b) => `<tr>
      <td>${b.link ? `<a href="${veilig(b.link)}" target="_blank" rel="noopener">${veilig(b.naam)}</a>`
        : veilig(b.naam)}<br><span class="meta">${veilig(b.prijs || '')}</span></td>
      <td>${veilig(b.leverancier || '')}</td>
      <td class="meta">${veilig(b.levertijd || '')}</td>
      <td>${b.datumNodig ? veilig(b.datumNodig) : '<span class="let-op">niet ingevuld</span>'}</td>
    </tr>`).join('')}</tbody></table>`;
}

function tekenBudget() {
  const uitgavenPer = new Map();
  for (const u of model.bron.uitgaven) {
    if (!u.categorieCode) continue;
    uitgavenPer.set(u.categorieCode, (uitgavenPer.get(u.categorieCode) ?? 0) + u.bedrag);
  }
  const euro = (n) => n == null ? '' : `&euro; ${Math.round(n).toLocaleString('nl-NL')}`;

  $('#inhoud').innerHTML = ['verbouwkosten', 'allocatie'].map((blok) => {
    const rij = model.bron.begroting.filter((c) => c.blok === blok);
    if (!rij.length) return '';
    const begroot = rij.reduce((a, c) => a + (c.herzien ?? c.begroot ?? 0), 0);
    const uit = rij.reduce((a, c) => a + (uitgavenPer.get(c.code) ?? 0), 0);
    return `<section class="groep">
      <h2>${blok} &mdash; ${euro(uit)} van ${euro(begroot)}</h2>
      <table><thead><tr><th>Categorie</th><th>Begroot</th><th>Uitgegeven</th><th></th></tr></thead>
      <tbody>${rij.map((c) => {
        const doel = c.herzien ?? c.begroot ?? 0;
        const gedaan = uitgavenPer.get(c.code) ?? 0;
        const deel = doel ? Math.min(100, (gedaan / doel) * 100) : 0;
        return `<tr><td>${veilig(c.naam)}</td><td class="meta">${euro(doel)}</td>
          <td${gedaan > doel ? ' class="let-op"' : ''}>${euro(gedaan)}</td>
          <td><div class="staaf"><div style="width:${deel}%"></div></div></td></tr>`;
      }).join('')}</tbody></table>
    </section>`;
  }).join('');
}

const tekenaars = { planning: tekenPlanning, taken: tekenTaken, vaklui: tekenVaklui,
                    bestellingen: tekenBestellingen, budget: tekenBudget };
const teken = () => tekenaars[actief]();

let hertekenTimer;
window.addEventListener('resize', () => {
  if (actief !== 'planning' || weergave !== 'gantt') return;
  clearTimeout(hertekenTimer);
  hertekenTimer = setTimeout(tekenPlanning, 150);
});

/** Aanroepen zodra het model geladen is. */
export function toonSchermen(nieuwModel, hulp) {
  model = nieuwModel;
  opnieuwLaden = hulp.herlaad;
  ingelogdeNaam = () => hulp.naam;
  schrijfStatus = hulp.schrijfStatus;
  schrijfNotitie = hulp.schrijfNotitie;
  tekenTabs();
  kop();
  teken();
}
