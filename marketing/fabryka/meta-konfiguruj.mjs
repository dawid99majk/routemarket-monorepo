#!/usr/bin/env node
/**
 * Jednorazowa konfiguracja publikatora: token → plik /root/.routemarket-meta.env (chmod 600).
 *
 * Uruchamiać NA VPS w terminalu interaktywnym (ssh -t), nigdy przez czat:
 *   ssh -t leadminer-vps 'cd /root/routemarket-workspace/marketing/fabryka && node meta-konfiguruj.mjs'
 *
 * Pyta o: ID aplikacji, klucz tajny aplikacji i krótkotrwały token użytkownika z Graph API Explorer
 * (znaki tokenu i klucza nie są pokazywane). Potem sam:
 *   1. wymienia token na długoterminowy (fb_exchange_token),
 *   2. pobiera token STRONY (nie wygasa, gdy pochodzi z długoterminowego tokenu użytkownika),
 *   3. znajduje stronę i powiązane konto Instagram,
 *   4. sprawdza uprawnienia (debug_token) i wypisuje, czego brakuje,
 *   5. zapisuje TYLKO token strony i identyfikatory. Klucz aplikacji i token użytkownika znikają.
 *
 * Nic nie trafia do repozytorium ani do logów; skrypt nie wypisuje tokenów.
 */
import fs from 'node:fs';
import readline from 'node:readline';

const WERSJA = process.env.META_API_VERSION || 'v23.0';
const PLIK = process.env.META_ENV || '/root/.routemarket-meta.env';
const WYMAGANE = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish'];
const ZALECANE = ['instagram_manage_comments'];

function zapytaj(pytanie, { ukryj = false } = {}) {
  return new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (ukryj) {
      rl._writeToOutput = (s) => { if (s.includes(pytanie)) rl.output.write(s); else rl.output.write(''); };
    }
    rl.question(pytanie, (odp) => { rl.close(); if (ukryj) process.stdout.write('\n'); res(odp.trim()); });
  });
}

async function graph(sciezka, parametry = {}, token) {
  const url = new URL(`https://graph.facebook.com/${WERSJA}/${sciezka}`);
  for (const [k, v] of Object.entries(parametry)) url.searchParams.set(k, v);
  const odp = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  const dane = await odp.json();
  if (dane.error) throw new Error(`${sciezka}: ${dane.error.message}`);
  return dane;
}

const appId = await zapytaj('ID aplikacji Mety: ');
const sekret = await zapytaj('Klucz tajny aplikacji (ukryty): ', { ukryj: true });
const krotki = await zapytaj('Token użytkownika z Graph API Explorer (ukryty): ', { ukryj: true });

const dlugi = (await graph('oauth/access_token', { grant_type: 'fb_exchange_token', client_id: appId, client_secret: sekret, fb_exchange_token: krotki })).access_token;
const strony = (await graph('me/accounts', { fields: 'id,name,access_token,instagram_business_account{id,username}', limit: '25' }, dlugi)).data;
if (!strony?.length) throw new Error('Token nie widzi żadnej strony (brak pages_show_list albo zła strona wybrana w oknie zgody)');
console.log('\nStrony dostępne dla tokenu:');
strony.forEach((s, i) => console.log(`  ${i + 1}. ${s.name} (${s.id}) — Instagram: ${s.instagram_business_account?.username ?? 'niepowiązany'}`));
const numer = strony.length === 1 ? 1 : Number(await zapytaj('Numer strony do publikacji: '));
const strona = strony[numer - 1];
if (!strona) throw new Error('Nie ma takiej strony');
if (!strona.instagram_business_account) throw new Error('Ta strona nie ma powiązanego konta Instagram (Instagram → Ustawienia → Konto profesjonalne → Strona na Facebooku)');

const app = `${appId}|${sekret}`;
const debug = (await graph('debug_token', { input_token: strona.access_token }, app)).data;
const brak = WYMAGANE.filter((u) => !debug.scopes?.includes(u));
const brakZal = ZALECANE.filter((u) => !debug.scopes?.includes(u));
console.log(`\nToken strony: ważny=${debug.is_valid}, wygasa=${debug.expires_at ? new Date(debug.expires_at * 1000).toISOString().slice(0, 10) : 'nigdy'}`);
if (brak.length) { console.error(`BRAKUJE uprawnień: ${brak.join(', ')} — wygeneruj token ponownie z tymi uprawnieniami.`); process.exit(3); }
if (brakZal.length) console.log(`Uwaga: brak ${brakZal.join(', ')} — pierwszy komentarz ze źródłami zdjęć nie będzie dodawany automatycznie.`);

fs.writeFileSync(PLIK, [
  `META_PAGE_ID=${strona.id}`,
  `META_PAGE_TOKEN=${strona.access_token}`,
  `META_IG_USER_ID=${strona.instagram_business_account.id}`,
  'PROMO_BASE_URL=https://routemarket.io/promo',
  '',
].join('\n'), { mode: 0o600 });
fs.chmodSync(PLIK, 0o600);
console.log(`\nZapisano ${PLIK} (600): strona „${strona.name}”, Instagram @${strona.instagram_business_account.username}.`);
console.log('Klucz aplikacji i token użytkownika nie zostały zapisane.');
console.log('Sprawdzenie: node publikuj.mjs --stan   (a potem --sucho)');
