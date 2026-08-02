/**
 * Welke sheets deze app gebruikt, per apparaat onthouden.
 *
 * De adressen staan met opzet niet in de code: dan zou deze openbare repo
 * verklappen waar de gegevens van de eigenaar staan. Elke gebruiker wijst zijn
 * eigen sheets een keer aan; daarna weet de app het.
 */

const SLEUTEL = 'renovatie.instellingen.v1';

export interface Instellingen {
  bronSheetId: string;
  bronSheetNaam: string;
  backendSheetId: string;
  backendSheetNaam: string;
}

const LEEG: Instellingen = {
  bronSheetId: '', bronSheetNaam: '', backendSheetId: '', backendSheetNaam: '',
};

export function leesInstellingen(): Instellingen {
  try {
    const ruw = localStorage.getItem(SLEUTEL);
    if (!ruw) return { ...LEEG };
    return { ...LEEG, ...(JSON.parse(ruw) as Partial<Instellingen>) };
  } catch {
    // Kapotte of geblokkeerde opslag mag de app niet tegenhouden.
    return { ...LEEG };
  }
}

export function bewaarInstellingen(instellingen: Partial<Instellingen>): Instellingen {
  const nieuw = { ...leesInstellingen(), ...instellingen };
  try {
    localStorage.setItem(SLEUTEL, JSON.stringify(nieuw));
  } catch { /* privémodus: dan geldt het alleen deze sessie */ }
  return nieuw;
}

export function wisInstellingen(): void {
  try {
    localStorage.removeItem(SLEUTEL);
  } catch { /* niets aan te doen */ }
}

/** Is de app klaar voor gebruik, of moet er nog iets aangewezen worden? */
export function isIngericht(i: Instellingen = leesInstellingen()): boolean {
  return Boolean(i.bronSheetId && i.backendSheetId);
}
