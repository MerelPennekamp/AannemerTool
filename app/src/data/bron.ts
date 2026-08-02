import { tekst, getal, isoDatum, cel, kolommen, type Raster } from './waarden.js';
import type {
  Bron, FaseTaak, DatumRegel, Vakman, Bestelling, BudgetCategorie, Uitgave,
} from '../domein/types.js';

/**
 * De zes tabbladen uit het plan omzetten naar records. Twee tabbladen die er
 * ook in staan (Liquiditeit, Hypotheek berekeningen) blijven met rust.
 *
 * Hier wordt niets aangenomen over vaste rijnummers: koppen worden opgezocht,
 * niet geteld. De bronsheet is met de hand bijgehouden.
 */

export const TABBLADEN = [
  'Fases', 'Belangrijke datums', 'Vaklui', 'Boodschappenlijst', 'Begroting', 'Afrekening',
] as const;

export type Rasters = Record<string, Raster>;

// --- Fases -----------------------------------------------------------------

/**
 * Fases is geen lijst maar een matrix: elke kolom is een fase, en een kolom
 * "dagen" hoort bij de fase links ervan.
 */
export function leesFases(raster: Raster): FaseTaak[] {
  const kop = (raster[0] ?? []).map(tekst);

  const faseKolommen: { index: number; naam: string; dagenIndex: number | null }[] = [];
  kop.forEach((titel, i) => {
    if (!titel || /^dagen$/i.test(titel)) return;
    faseKolommen.push({
      index: i,
      naam: titel,
      dagenIndex: /^dagen$/i.test(kop[i + 1] ?? '') ? i + 1 : null,
    });
  });

  const taken: FaseTaak[] = [];
  for (const rij of raster.slice(1)) {
    for (const kolom of faseKolommen) {
      const naam = tekst(cel(rij, kolom.index));
      if (!naam) continue;
      // De optelrij onderaan zet zijn gemiddelde in de laatste fasekolom.
      // Een taak heet nooit alleen maar een getal.
      if (/^-?\d+([.,]\d+)?$/.test(naam)) continue;

      taken.push({
        naam,
        fase: kolom.naam,
        duurDagen: kolom.dagenIndex === null ? null : getal(cel(rij, kolom.dagenIndex)),
      });
    }
  }
  return taken;
}

// --- Belangrijke datums ----------------------------------------------------

/**
 * De kolom "Aantal dagen tot einddatum" blijft ongebruikt: die bevat een
 * formule die bij lege datums een jaartal uit 1773 teruggeeft.
 */
export function leesBelangrijkeDatums(raster: Raster): DatumRegel[] {
  const k = kolommen(raster, {
    start: 'Datum', eind: 'Eind datum', naam: 'Reden', duur: 'Dagen werk',
  });

  return raster.slice(1).flatMap((rij) => {
    const naam = tekst(cel(rij, k.naam));
    if (!naam) return [];
    return [{
      naam,
      start: isoDatum(cel(rij, k.start)),
      eind: isoDatum(cel(rij, k.eind)),
      duurDagen: getal(cel(rij, k.duur)),
    }];
  });
}

// --- Vaklui ----------------------------------------------------------------

/** "x", "ja", "waar" -> true. Leeg of iets anders -> false. */
const jaNee = (waarde: string) => /^(x|v|ja|waar|true|1)$/i.test(waarde.trim());

export function leesVaklui(raster: Raster): Vakman[] {
  const k = kolommen(raster, {
    functie: 'Functie', bedrijf: 'Naam bedrijf', benaderd: 'Benaderd',
    status: 'Status', reactie: 'Reactie', telefoon: 'Telefoonnummer',
    link: 'link', prijs: 'prijs', via: 'Via', gekozen: 'Gekozen',
  });

  return raster.slice(1).flatMap((rij) => {
    const bedrijf = tekst(cel(rij, k.bedrijf));
    if (!bedrijf) return [];
    return [{
      functie: tekst(cel(rij, k.functie)),
      bedrijf,
      benaderd: tekst(cel(rij, k.benaderd)),
      status: tekst(cel(rij, k.status)),
      reactie: tekst(cel(rij, k.reactie)),
      telefoon: tekst(cel(rij, k.telefoon)),
      link: tekst(cel(rij, k.link)),
      prijs: tekst(cel(rij, k.prijs)),
      via: tekst(cel(rij, k.via)),
      gekozen: jaNee(tekst(cel(rij, k.gekozen))),
    }];
  });
}

// --- Boodschappenlijst -----------------------------------------------------

export function leesBoodschappenlijst(raster: Raster): Bestelling[] {
  const k = kolommen(raster, {
    naam: 'Naam item', leverancier: 'Leveraar', levertijd: 'Levertijd',
    link: 'Link', prijs: 'Prijs', datumNodig: 'Datum nodig',
  });

  return raster.slice(1).flatMap((rij) => {
    const naam = tekst(cel(rij, k.naam));
    if (!naam) return [];
    return [{
      naam,
      leverancier: tekst(cel(rij, k.leverancier)),
      levertijd: tekst(cel(rij, k.levertijd)),
      link: tekst(cel(rij, k.link)),
      prijs: tekst(cel(rij, k.prijs)),
      datumNodig: isoDatum(cel(rij, k.datumNodig)),
    }];
  });
}

// --- Begroting -------------------------------------------------------------

/**
 * Begroting is een financieel model met meerdere blokken naast elkaar, geen
 * tabel. De twee blokken die de app nodig heeft worden opgezocht aan hun
 * kopcel ("Allocatie" links, "Verbouwkosten" rechts).
 */
export function leesBegroting(raster: Raster): BudgetCategorie[] {
  const vindBlok = (titel: string) => {
    for (let r = 0; r < raster.length; r++) {
      const kolom = (raster[r] ?? []).findIndex(
        (c) => tekst(c).toLowerCase() === titel.toLowerCase());
      if (kolom >= 0) return { rij: r, kolom };
    }
    return null;
  };

  const uit: BudgetCategorie[] = [];
  const blokken: [string, BudgetCategorie['blok']][] = [
    ['Verbouwkosten', 'verbouwkosten'],
    ['Allocatie', 'allocatie'],
  ];

  for (const [titel, blok] of blokken) {
    const pos = vindBlok(titel);
    if (!pos) continue;

    // Onder de bloktitel staat een kopregel, daaronder de categorieen.
    for (let r = pos.rij + 2; r < raster.length; r++) {
      const rij = raster[r];
      const label = tekst(cel(rij, pos.kolom));
      if (!label || /^totaal/i.test(label)) break;

      // Categorieen heten "3. Badkamer"; alles zonder nummer is een tussenregel.
      const m = label.match(/^(\d+)\.\s*(.+)$/);
      if (!m) continue;
      uit.push({
        code: m[1]!,
        naam: m[2]!.trim(),
        blok,
        begroot: getal(cel(rij, pos.kolom + 1)),
        herzien: getal(cel(rij, pos.kolom + 2)),
      });
    }
  }
  return uit;
}

// --- Afrekening ------------------------------------------------------------

export function leesAfrekening(raster: Raster): Uitgave[] {
  const k = kolommen(raster, {
    datum: 'Datum', bedrag: 'Bedrag', ontvanger: 'Ontvanger', categorie: 'Categorie',
    omschrijving: 'Omschrijving', bron: 'Bron', betaler: 'Betaler', factuur: 'Factuur',
  });

  return raster.slice(1).flatMap((rij) => {
    const ontvanger = tekst(cel(rij, k.ontvanger));
    const bedrag = getal(cel(rij, k.bedrag));
    // De onderste rij is een totaal: wel een bedrag, geen ontvanger.
    if (bedrag === null || !ontvanger) return [];

    const categorieRuw = tekst(cel(rij, k.categorie));
    return [{
      datum: isoDatum(cel(rij, k.datum)),
      bedrag,
      ontvanger,
      categorieRuw,
      categorieCode: categorieRuw.match(/^(\d+)\./)?.[1] ?? null,
      omschrijving: tekst(cel(rij, k.omschrijving)),
      bron: tekst(cel(rij, k.bron)),
      betaler: tekst(cel(rij, k.betaler)),
      factuur: tekst(cel(rij, k.factuur)),
    }];
  });
}

/** Alle zes tabbladen in een keer. */
export function leesBron(rasters: Rasters): Bron {
  const blad = (naam: string): Raster => {
    const r = rasters[naam];
    if (!r) throw new Error(`Tabblad "${naam}" ontbreekt in de bronsheet.`);
    return r;
  };

  return {
    fases: leesFases(blad('Fases')),
    datums: leesBelangrijkeDatums(blad('Belangrijke datums')),
    vaklui: leesVaklui(blad('Vaklui')),
    bestellingen: leesBoodschappenlijst(blad('Boodschappenlijst')),
    begroting: leesBegroting(blad('Begroting')),
    uitgaven: leesAfrekening(blad('Afrekening')),
  };
}
