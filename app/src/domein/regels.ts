import type { Werksoort } from './fasen.js';
import { faseVan, faseRang } from './fasen.js';
import { normaliseer, type Ruimte } from './classificatie.js';

/**
 * Afhankelijkheden afleiden. De app verzint alleen koppelingen waar een regel
 * voor is; de rest blijft leeg en kan met de hand worden gelegd.
 *
 * Elke koppeling draagt zijn regel-id mee, zodat de taakdetailpagina kan laten
 * zien waaróm twee taken aan elkaar hangen, en zodat een handmatig verwijderde
 * koppeling niet bij de volgende doorrekening terugkomt.
 */

export interface TaakVoorRegels {
  id: number;
  naam: string;
  werksoort: Werksoort | null;
  alternatieven: Werksoort[];
  ruimtes: Ruimte[];
}

export interface Koppeling {
  voorId: number;
  naId: number;
  regelId: string;
  uitleg: string;
}

const sleutel = (k: Koppeling) => `${k.voorId}>${k.naId}:${k.regelId}`;

/** Regel 1 — de standaardvolgorde, per ruimte. */
function volgordePerRuimte(taken: TaakVoorRegels[]): Koppeling[] {
  const uit: Koppeling[] = [];
  const ruimtes = new Set(taken.flatMap((t) => t.ruimtes));

  for (const ruimte of ruimtes) {
    const inRuimte = taken.filter((t) => t.werksoort && t.ruimtes.includes(ruimte));

    // Per fase-rang bundelen, daarna alleen opeenvolgende gevulde lagen koppelen.
    const perRang = new Map<number, TaakVoorRegels[]>();
    for (const t of inRuimte) {
      const rang = faseRang(faseVan(t.werksoort!));
      const lijst = perRang.get(rang) ?? [];
      lijst.push(t);
      perRang.set(rang, lijst);
    }

    const rangen = [...perRang.keys()].sort((a, b) => a - b);
    for (let i = 0; i < rangen.length - 1; i++) {
      const eerder = perRang.get(rangen[i]!)!;
      const later = perRang.get(rangen[i + 1]!)!;
      for (const a of eerder) {
        for (const b of later) {
          if (a.id === b.id) continue;
          uit.push({
            voorId: a.id,
            naId: b.id,
            regelId: 'volgorde-per-ruimte',
            uitleg: `In de ${ruimte} komt ${faseVan(a.werksoort!)} voor ${faseVan(b.werksoort!)}.`,
          });
        }
      }
    }
  }
  return uit;
}

/** Regel 2 — asbestinspectie voor alle sloop, overal. */
function asbestVoorSloop(taken: TaakVoorRegels[]): Koppeling[] {
  const asbest = taken.filter((t) => /\basbest\w*/.test(normaliseer(t.naam)));
  const sloop = taken.filter((t) => t.werksoort === 'sloop');
  return asbest.flatMap((a) =>
    sloop.map((s) => ({
      voorId: a.id,
      naId: s.id,
      regelId: 'asbest-voor-sloop',
      uitleg: 'Asbestinspectie gaat voor alle sloop, in het hele huis.',
    })),
  );
}

/** Regel 3 — verzwaring meterkast voor alle elektra. */
function meterkastVoorElektra(taken: TaakVoorRegels[]): Koppeling[] {
  const meterkast = taken.filter((t) => {
    const n = normaliseer(t.naam);
    return /\bmeterkast\b/.test(n) && /\bverzwar\w*|\buitbreid\w*/.test(n);
  });
  const elektra = taken.filter((t) => t.werksoort === 'elektra' && !meterkast.includes(t));
  return meterkast.flatMap((m) =>
    elektra.map((e) => ({
      voorId: m.id,
      naId: e.id,
      regelId: 'meterkast-voor-elektra',
      uitleg: 'De meterkast moet verzwaard zijn voor er elektra bij komt.',
    })),
  );
}

/**
 * Regel 4 — wat besteld of geregeld moet worden, is er voor de taak die het
 * gebruikt. Werkt op de tweede werksoort van een voorbereidingstaak:
 * "CV ketel uitzoeken en bestellen" draagt `verwarming` mee en gaat daarmee
 * voor "Cv ketel installeren", ook al deelt het geen ruimte.
 */
function geregeldVoorGebruik(taken: TaakVoorRegels[]): Koppeling[] {
  const uit: Koppeling[] = [];
  const voorbereidingen = taken.filter((t) => t.werksoort === 'voorbereiding');

  for (const v of voorbereidingen) {
    const doelwerksoort = v.alternatieven[0];
    if (!doelwerksoort) continue;

    for (const t of taken) {
      if (t.id === v.id || t.werksoort !== doelwerksoort) continue;
      // Noemt de voorbereiding een ruimte, dan telt alleen die ruimte mee.
      if (v.ruimtes.length > 0 && !v.ruimtes.some((r) => t.ruimtes.includes(r))) continue;
      uit.push({
        voorId: v.id,
        naId: t.id,
        regelId: 'geregeld-voor-gebruik',
        uitleg: `"${v.naam}" moet rond zijn voor dit ${doelwerksoort}-werk begint.`,
      });
    }
  }
  return uit;
}

/** Regel 5 — verhuizen na de tijdelijke keuken en na een werkend toilet. */
function verhuizenAlsLaatste(taken: TaakVoorRegels[]): Koppeling[] {
  const verhuizen = taken.filter((t) => t.werksoort === 'verhuizing');
  const keuken = taken.filter((t) => t.werksoort === 'keuken');
  const toilet = taken.filter(
    (t) => t.werksoort === 'sanitair' && t.ruimtes.includes('wc') && /\binstalleren\b|\bplaatsen\b|\bzetten\b/.test(normaliseer(t.naam)),
  );

  return verhuizen.flatMap((v) => [
    ...keuken.map((k) => ({
      voorId: k.id,
      naId: v.id,
      regelId: 'verhuizen-na-keuken',
      uitleg: 'Er moet een tijdelijke keuken staan voor er verhuisd wordt.',
    })),
    ...toilet.map((w) => ({
      voorId: w.id,
      naId: v.id,
      regelId: 'verhuizen-na-toilet',
      uitleg: 'Er moet een werkend toilet zijn voor er verhuisd wordt.',
    })),
  ]);
}

/**
 * Regel 6 — vloerverwarming voor dekvloer, dekvloer voor de vloer zelf.
 * Binnen werksoort `vloer` zit nog een eigen volgorde: eerst de ondervloer,
 * dan de dekvloer, dan wat erop komt.
 */
function vloerOpbouw(taken: TaakVoorRegels[]): Koppeling[] {
  const laagVan = (t: TaakVoorRegels): number | null => {
    const n = normaliseer(t.naam);
    if (t.werksoort === 'vloerverwarming') return 0;
    if (t.werksoort !== 'vloer') return null;
    if (/\bondervloer\w*/.test(n)) return 1;
    if (/\bdekvloer\w*/.test(n)) return 2;
    return 3;
  };

  const uit: Koppeling[] = [];
  const relevant = taken.map((t) => ({ taak: t, laag: laagVan(t) })).filter((x) => x.laag !== null);
  const ruimtes = new Set(relevant.flatMap((x) => x.taak.ruimtes));

  for (const ruimte of ruimtes) {
    const inRuimte = relevant.filter((x) => x.taak.ruimtes.includes(ruimte));
    for (const a of inRuimte) {
      for (const b of inRuimte) {
        if (a.laag! >= b.laag!) continue;
        // Alleen direct opeenvolgende lagen, anders krijgen we dubbele randen.
        const ertussen = inRuimte.some((c) => c.laag! > a.laag! && c.laag! < b.laag!);
        if (ertussen) continue;
        uit.push({
          voorId: a.taak.id,
          naId: b.taak.id,
          regelId: 'vloeropbouw',
          uitleg: 'Vloerverwarming, dan ondervloer, dan dekvloer, dan de vloer zelf.',
        });
      }
    }
  }
  return uit;
}

/**
 * Regel 7 — binnen de afwerking zit nog een eigen volgorde. De standaardfases
 * zetten stucwerk, schilderwerk en vloer in dezelfde stap, terwijl ze in het
 * echt na elkaar komen: eerst de wanden af (stucwerk en tegelwerk), dan de
 * verf, dan pas de vloer.
 */
function afwerkingsvolgorde(taken: TaakVoorRegels[]): Koppeling[] {
  const laagVan = (t: TaakVoorRegels): number | null => {
    switch (t.werksoort) {
      case 'stucwerk': case 'tegelwerk': return 0;
      case 'schilderwerk': return 1;
      case 'vloer': return 2;
      default: return null;
    }
  };

  const uit: Koppeling[] = [];
  const relevant = taken.map((t) => ({ taak: t, laag: laagVan(t) })).filter((x) => x.laag !== null);
  const ruimtes = new Set(relevant.flatMap((x) => x.taak.ruimtes));

  for (const ruimte of ruimtes) {
    const inRuimte = relevant.filter((x) => x.taak.ruimtes.includes(ruimte));
    const lagen = [...new Set(inRuimte.map((x) => x.laag!))].sort((a, b) => a - b);

    for (let i = 0; i < lagen.length - 1; i++) {
      const eerder = inRuimte.filter((x) => x.laag === lagen[i]);
      const later = inRuimte.filter((x) => x.laag === lagen[i + 1]);
      for (const a of eerder) {
        for (const b of later) {
          uit.push({
            voorId: a.taak.id,
            naId: b.taak.id,
            regelId: 'afwerkingsvolgorde',
            uitleg: 'Eerst stucwerk en tegelwerk, dan schilderen, dan de vloer.',
          });
        }
      }
    }
  }
  return uit;
}

const REGELS = [
  volgordePerRuimte,
  afwerkingsvolgorde,
  asbestVoorSloop,
  meterkastVoorElektra,
  geregeldVoorGebruik,
  verhuizenAlsLaatste,
  vloerOpbouw,
];

export function leidAfhankelijkhedenAf(taken: TaakVoorRegels[]): Koppeling[] {
  const gezien = new Set<string>();
  const uit: Koppeling[] = [];
  for (const regel of REGELS) {
    for (const k of regel(taken)) {
      if (k.voorId === k.naId) continue;
      const s = sleutel(k);
      if (gezien.has(s)) continue;
      gezien.add(s);
      uit.push(k);
    }
  }
  return uit;
}

/**
 * Een kringloop betekent dat de regels elkaar tegenspreken. De app moet dat
 * melden in plaats van er stilletjes een volgorde uit te persen.
 */
export function vindKringlopen(koppelingen: Koppeling[]): number[][] {
  const na = new Map<number, number[]>();
  for (const k of koppelingen) {
    na.set(k.voorId, [...(na.get(k.voorId) ?? []), k.naId]);
  }

  const kringlopen: number[][] = [];
  const staat = new Map<number, 'bezig' | 'klaar'>();
  const pad: number[] = [];

  const loop = (id: number) => {
    staat.set(id, 'bezig');
    pad.push(id);
    for (const volgende of na.get(id) ?? []) {
      if (staat.get(volgende) === 'bezig') {
        kringlopen.push(pad.slice(pad.indexOf(volgende)));
      } else if (!staat.has(volgende)) {
        loop(volgende);
      }
    }
    pad.pop();
    staat.set(id, 'klaar');
  };

  for (const id of new Set(koppelingen.flatMap((k) => [k.voorId, k.naId]))) {
    if (!staat.has(id)) loop(id);
  }
  return kringlopen;
}
