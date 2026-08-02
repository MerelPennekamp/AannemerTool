import { describe, it, expect } from 'vitest';
import { projectnummer } from '../src/data/picker.js';

/**
 * Zonder appId koppelt Google de toestemming voor een gekozen bestand aan geen
 * enkele app, en geeft de Sheets API daarna 404. Het projectnummer komt uit het
 * client-ID, dus dat mag niet stilletjes verkeerd gaan.
 */
describe('projectnummer uit het client-ID', () => {
  it('pakt het nummer voor het streepje', () => {
    expect(projectnummer('123456789012-abcdefg.apps.googleusercontent.com'))
      .toBe('123456789012');
  });

  it('klaagt als het client-ID niet die vorm heeft', () => {
    expect(() => projectnummer('zomaar-wat')).toThrow(/projectnummer/);
    expect(() => projectnummer('')).toThrow(/projectnummer/);
    expect(() => projectnummer('abc-123.apps.googleusercontent.com')).toThrow(/projectnummer/);
  });

  it('noemt de secret bij naam, zodat je weet waar je moet kijken', () => {
    expect(() => projectnummer('fout')).toThrow(/GOOGLE_CLIENT_ID/);
  });
});
