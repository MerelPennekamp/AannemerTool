import { defineConfig } from 'vite';

/**
 * De app draait op GitHub Pages onder een submap, niet op de hoofdmap van het
 * domein. Vandaar het basispad; laat je dat weg, dan zoekt de pagina zijn
 * scripts op de verkeerde plek.
 *
 * Lokaal draaien met `npm run dev` gebruikt poort 5173 - datzelfde adres moet
 * in het Google Cloud-project staan, anders weigert de inlog.
 */
export default defineConfig({
  base: process.env['BASISPAD'] ?? '/AannemerTool/',
  // Alles hierin gaat ongewijzigd mee naar de gebouwde map, waaronder de
  // config.json die de bouwstap uit de GitHub-secrets schrijft.
  publicDir: 'publiek',
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});
