import type { Bron } from './domein/types.js';
import { deelIn, sleutelVan, normaliseer, type Ruimte } from './domein/classificatie.js';
import { faseVan, type Werksoort } from './domein/fasen.js';
import { leidAfhankelijkhedenAf, vindKringlopen, type TaakVoorRegels } from './domein/regels.js';
import { berekenPlanning, type Gepland } from './domein/planning.js';
import { bepaalWaarschuwingen, type Waarschuwing } from './domein/waarschuwingen.js';
import { functiesVoorTaak, keuzePerFunctie } from './domein/vaklui.js';
import type { BackendInhoud, TaakStand } from './data/backend.js';

/**
 * Bronsheet en backend-sheet samenvoegen tot wat de schermen tonen.
 *
 * Dit deed eerder de server. Het is met opzet een gewone functie zonder
 * netwerk: alles wat de app uitrekent is hiermee te testen zonder Google.
 */

export interface Taak {
  sleutel: string;
  naam: string;
  fase: string | null;
  werksoort: Werksoort | null;
  ruimtes: Ruimte[];
  duurDagen: number | null;
  vasteStart: string | null;
  vasteEind: string | null;
  status: TaakStand['status'];
  handmatigIngedeeld: boolean;
  notities: number;
  /** Welke vaklui-functies voor deze taak in aanmerking komen. */
  functies: string[];
  gepland: Gepland | null;
  categorie: string;
}

export interface Model {
  taken: Taak[];
  waarschuwingen: Waarschuwing[];
  kringloop: boolean;
  sleuteldatum: string;
  begin: string;
  einde: string;
  nietIngedeeld: Taak[];
  vaklui: ReturnType<typeof keuzePerFunctie>;
  bron: Bron;
}

/** Waar een taak in de weergave onder valt: zijn fase, of iets dat geen werk is. */
function categorieVan(t: { werksoort: Werksoort | null; duurDagen: number | null; vasteStart: string | null }): string {
  if (t.werksoort) return faseVan(t.werksoort);
  if (!t.vasteStart) return 'onbekend';
  return (t.duurDagen ?? 0) > 0 ? 'afspraak' : 'mijlpaal';
}

export function bouwModel(bron: Bron, backend: BackendInhoud, vandaag: string): Model {
  // Fases eerst, Belangrijke datums daarna: die is leidend bij dezelfde naam.
  const binnen = new Map<string, Omit<Taak, 'gepland' | 'functies' | 'categorie' | 'notities' | 'status' | 'handmatigIngedeeld'>>();

  for (const t of bron.fases) {
    const d = deelIn(t.naam);
    binnen.set(sleutelVan(t.naam), {
      sleutel: sleutelVan(t.naam), naam: t.naam, fase: t.fase,
      werksoort: d.werksoort, ruimtes: d.ruimtes,
      duurDagen: t.duurDagen, vasteStart: null, vasteEind: null,
    });
  }
  for (const r of bron.datums) {
    const d = deelIn(r.naam);
    binnen.set(sleutelVan(r.naam), {
      sleutel: sleutelVan(r.naam), naam: r.naam, fase: null,
      werksoort: d.werksoort, ruimtes: d.ruimtes,
      duurDagen: r.duurDagen, vasteStart: r.start, vasteEind: r.eind,
    });
  }

  const standPerSleutel = new Map(backend.taken.map((t) => [t.sleutel, t]));
  const notitiesPerSleutel = new Map<string, number>();
  for (const n of backend.notities) {
    notitiesPerSleutel.set(n.sleutel, (notitiesPerSleutel.get(n.sleutel) ?? 0) + 1);
  }

  const taken: Taak[] = [...binnen.values()].map((t) => {
    const stand = standPerSleutel.get(t.sleutel);
    // Een handmatige indeling wint van wat de app zelf afleidt.
    const handmatig = Boolean(stand?.werksoort);
    const werksoort = (handmatig ? (stand!.werksoort as Werksoort) : t.werksoort) || null;
    const ruimtes = handmatig && stand!.ruimtes.length ? (stand!.ruimtes as Ruimte[]) : t.ruimtes;

    return {
      ...t,
      werksoort,
      ruimtes,
      status: stand?.status ?? 'te-doen',
      handmatigIngedeeld: handmatig,
      notities: notitiesPerSleutel.get(t.sleutel) ?? 0,
      functies: functiesVoorTaak({ naam: t.naam, werksoort, ruimtes }, normaliseer(t.naam)),
      gepland: null,
      categorie: categorieVan({ ...t, werksoort }),
    };
  });

  // --- Volgorde ------------------------------------------------------------
  const nummers = new Map(taken.map((t, i) => [t.sleutel, i + 1]));
  const voorRegels: TaakVoorRegels[] = taken.map((t) => ({
    id: nummers.get(t.sleutel)!,
    naam: t.naam,
    werksoort: t.werksoort,
    alternatieven: deelIn(t.naam).alternatieven,
    ruimtes: t.ruimtes,
  }));

  const onderdrukt = new Set(
    backend.afhankelijkheden.filter((a) => a.herkomst === 'onderdrukt')
      .map((a) => `${a.voorSleutel}>${a.naSleutel}`),
  );

  const uitRegels = leidAfhankelijkhedenAf(voorRegels)
    .filter((k) => {
      const voor = taken[k.voorId - 1]?.sleutel, na = taken[k.naId - 1]?.sleutel;
      return !onderdrukt.has(`${voor}>${na}`);
    });

  const handmatigeKoppels = backend.afhankelijkheden
    .filter((a) => a.herkomst === 'handmatig')
    .flatMap((a) => {
      const voor = nummers.get(a.voorSleutel), na = nummers.get(a.naSleutel);
      return voor && na ? [{ voorId: voor, naId: na }] : [];
    });

  const koppels = [
    ...uitRegels.map((k) => ({ voorId: k.voorId, naId: k.naId })),
    ...handmatigeKoppels,
  ];

  // --- Planning ------------------------------------------------------------
  const sleuteldatum = taken.find((t) => /\bsleutel\b/.test(normaliseer(t.naam)) && t.vasteStart)
    ?.vasteStart ?? vandaag;

  const voorPlanning = taken.map((t) => ({
    id: nummers.get(t.sleutel)!,
    naam: t.naam,
    duurDagen: t.duurDagen,
    vasteStart: t.vasteStart,
    vasteEind: t.vasteEind,
    fase: t.fase,
    status: t.status,
  }));

  const { planning, kringloop } = berekenPlanning(voorPlanning, koppels, { sleuteldatum, vandaag });
  for (const t of taken) t.gepland = planning.get(nummers.get(t.sleutel)!) ?? null;

  // --- Waarschuwingen ------------------------------------------------------
  const waarschuwingen = bepaalWaarschuwingen(
    voorPlanning.map((t) => ({
      id: t.id, naam: t.naam, vasteStart: t.vasteStart, vasteEind: t.vasteEind,
      duurDagen: t.duurDagen, status: t.status,
    })),
    koppels,
    planning,
    bron.bestellingen.map((b, i) => ({
      id: i + 1, naam: b.naam, levertijdTekst: b.levertijd, datumNodig: b.datumNodig,
    })),
    vandaag,
  );

  const gepland = taken.map((t) => t.gepland).filter((g): g is Gepland => g !== null);

  return {
    taken: taken.sort((a, b) =>
      (a.gepland?.start ?? '').localeCompare(b.gepland?.start ?? '') || a.naam.localeCompare(b.naam)),
    waarschuwingen,
    kringloop,
    sleuteldatum,
    begin: gepland.reduce((a, g) => (g.start < a ? g.start : a), gepland[0]?.start ?? vandaag),
    einde: gepland.reduce((a, g) => (g.eind > a ? g.eind : a), sleuteldatum),
    nietIngedeeld: taken.filter((t) => t.werksoort === null),
    vaklui: keuzePerFunctie(bron.vaklui),
    bron,
  };
}

/** Kringlopen als leesbare ketens van taaknamen, voor als de regels botsen. */
export function beschrijfKringlopen(model: Model, koppels: { voorId: number; naId: number }[]): string[] {
  return vindKringlopen(koppels.map((k) => ({ ...k, regelId: '', uitleg: '' })))
    .map((ring) => ring.map((id) => model.taken[id - 1]?.naam ?? `#${id}`).join(' -> '));
}
