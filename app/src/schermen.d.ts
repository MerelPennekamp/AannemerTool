import type { Model } from './model.js';

/** Wat de schermen nodig hebben om te kunnen opslaan en verversen. */
export interface SchermHulp {
  naam: string;
  herlaad: () => Promise<Model>;
  schrijfStatus: (sleutel: string, status: string) => Promise<void>;
  schrijfNotitie: (sleutel: string, tekst: string) => Promise<void>;
}

export function toonSchermen(model: Model, hulp: SchermHulp): void;
