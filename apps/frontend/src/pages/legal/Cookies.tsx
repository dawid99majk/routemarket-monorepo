import LegalLayout from '@/components/LegalLayout';

/**
 * Opisuje wyłącznie to, co aplikacja faktycznie zapisuje — klucze wypisane z kodu,
 * nie z szablonu. Poprzednia wersja miała rozdział „Your Consent and Cookie
 * Management" opisujący mechanizm zgody, którego w produkcie nie było wcale.
 */
export default function Cookies() {
  return (
    <LegalLayout docKey="cookies">
      <h1>Cookie Policy</h1>
      <p className="text-sm text-muted-foreground">RouteMarket — last updated 18 August 2026</p>

      <h2>1. What this is about</h2>
      <p>
        Like most websites, RouteMarket stores small amounts of data in your browser. Some of
        it is needed for the Service to work at all; the rest only appears if you agree to it.
      </p>
      <p>
        We use browser storage — <code>localStorage</code> and <code>sessionStorage</code> —
        rather than classic cookies for almost everything. The rules are the same, so this
        policy covers both.
      </p>

      <h2>2. Necessary storage</h2>
      <p>
        These entries are required for the Service to function. They cannot be switched off,
        because without them you could not stay logged in or the interface would forget what
        you were doing.
      </p>
      <table>
        <thead>
          <tr><th>Entry</th><th>What it holds</th><th>How long</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Login session</td>
            <td>Token confirming you are signed in, set by our authentication system</td>
            <td>Until you sign out or the session expires</td>
          </tr>
          <tr>
            <td><code>app-language</code></td>
            <td>The interface language you chose</td>
            <td>Until you clear browser data</td>
          </tr>
          <tr>
            <td><code>rm_ostatnia_tablica</code></td>
            <td>Which board you last had open, so the tabs bring you back to it</td>
            <td>Until you clear browser data</td>
          </tr>
          <tr>
            <td><code>rm_porzadek_tablic</code></td>
            <td>The sort order you picked for your list of boards</td>
            <td>Until you clear browser data</td>
          </tr>
          <tr>
            <td><code>rm_zamiar</code></td>
            <td>The city you typed before signing in, so it is not lost during registration</td>
            <td>Until the browser tab is closed</td>
          </tr>
          <tr>
            <td><code>rm_zgoda_cookies</code></td>
            <td>Your answer to the cookie banner, so we do not ask again</td>
            <td>12 months</td>
          </tr>
        </tbody>
      </table>
      <p>
        Under Art. 5(3) of the ePrivacy Directive these entries are strictly necessary to
        deliver a service you requested, so they do not require consent.
      </p>

      <h2>3. Analytics — only with your consent</h2>
      <p>
        If you accept analytics in the banner, we load Google Analytics. It tells us which
        parts of the Service are used and where people abandon a flow — for example how many
        people start planning a trip but never finish. We see aggregate patterns, not
        individual people's browsing.
      </p>
      <table>
        <thead>
          <tr><th>Entry</th><th>Set by</th><th>How long</th></tr>
        </thead>
        <tbody>
          <tr><td><code>_ga</code></td><td>Google Analytics — distinguishes browsers</td><td>up to 24 months</td></tr>
          <tr><td><code>_ga_*</code></td><td>Google Analytics — keeps session state</td><td>up to 24 months</td></tr>
        </tbody>
      </table>
      <p>
        If you refuse, the Google Analytics script is not loaded at all — it is not merely
        switched off after the fact.
      </p>

      <h2>4. Third parties we do not control</h2>
      <p>
        Displaying maps and place photographs means fetching files from other providers —
        CARTO and OpenTopoMap for map tiles, Wikimedia for photographs, unpkg and jsDelivr
        for shared libraries. Those requests reveal your IP address to them, as any web
        request does. We do not place tracking cookies through them, but we cannot control
        what they do on their own side; their own policies apply.
      </p>

      <h2>5. Changing your mind</h2>
      <p>
        You can withdraw or grant consent at any time by clearing site data for
        routemarket.io in your browser — the banner will then ask again on your next visit.
      </p>
      <p>
        You can also block or delete storage entirely in your browser settings. If you block
        the necessary entries, signing in will stop working.
      </p>

      <h2>6. Changes</h2>
      <p>
        If we add or remove anything stored in your browser, we update this page with a new
        date.
      </p>
      <p>
        Questions: <a href="mailto:contact@routemarket.io">contact@routemarket.io</a>.
      </p>
    </LegalLayout>
  );
}
