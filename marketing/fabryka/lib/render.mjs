/**
 * HTML → PNG przez Chromium (Playwright). Jedna przeglądarka na całą paczkę.
 *
 * Slajd zapisujemy najpierw jako plik .html obok wyniku i otwieramy go przez
 * file:// — strona z setContent() nie ma prawa wczytać lokalnych zdjęć.
 * Czekamy na kroje: Bricolage i Figtree idą z Google Fonts, a zrzut przed ich
 * wczytaniem wychodzi systemowym krojem i nikt tego nie zauważy do publikacji.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

let przegladarka = null;

export async function start() {
  przegladarka ??= await chromium.launch();
}

export async function stop() {
  await przegladarka?.close();
  przegladarka = null;
}

export async function png(html, plik, { w, h, przezroczyste = false }) {
  await start();
  const plikHtml = plik.replace(/\.png$/, '.html');
  fs.mkdirSync(path.dirname(plik), { recursive: true });
  fs.writeFileSync(plikHtml, html);
  const strona = await przegladarka.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  try {
    await strona.goto(pathToFileURL(plikHtml).href, { waitUntil: 'networkidle' });
    await strona.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
    });
    const kroje = await strona.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
    if (!kroje.some((k) => /Bricolage/.test(k))) throw new Error(`Krój Bricolage się nie wczytał (${plik}) — sprawdź połączenie z fonts.googleapis.com`);
    await strona.screenshot({ path: plik, omitBackground: przezroczyste });
  } finally {
    await strona.close();
  }
  fs.unlinkSync(plikHtml);
  return plik;
}
