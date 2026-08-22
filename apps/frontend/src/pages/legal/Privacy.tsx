import LegalLayout from '@/components/LegalLayout';

/**
 * Lista odbiorców danych wzięta z kodu, nie z szablonu: Google (Gemini i Analytics),
 * OpenStreetMap (Nominatim, Overpass), CARTO i OpenTopoMap (kafle map), unpkg
 * i jsDelivr (biblioteki). Poprzednia wersja wymieniała Stripe, konta twórców
 * i dane bankowe — kategorie, których ta aplikacja nigdy nie zbierała.
 */
export default function Privacy() {
  return (
    <LegalLayout docKey="privacy">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">RouteMarket — last updated 18 August 2026</p>

      <h2>1. Who is responsible for your data</h2>
      <p>
        The controller of your personal data is Dawid Majka, ul. Czereśniowa 67/2,
        55-020 Medłów, Poland. For any privacy matter write to{' '}
        <a href="mailto:contact@routemarket.io">contact@routemarket.io</a>.
      </p>
      <p>
        We have not appointed a Data Protection Officer; the controller handles these
        matters directly.
      </p>

      <h2>2. What we collect and why</h2>
      <table>
        <thead>
          <tr><th>Data</th><th>Why we have it</th><th>Legal basis</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Email address and password</td>
            <td>To create and secure your account. Passwords are stored only as
                cryptographic hashes — we cannot read them.</td>
            <td>Performance of our agreement with you (Art. 6(1)(b) GDPR)</td>
          </tr>
          <tr>
            <td>Display name, if you set one</td>
            <td>To sign boards you publish, so other users see an author rather than an
                email address.</td>
            <td>Performance of our agreement (Art. 6(1)(b))</td>
          </tr>
          <tr>
            <td>Your boards, places, notes, saved places and generated plans</td>
            <td>This is the content of the Service. Without storing it there is nothing
                to come back to.</td>
            <td>Performance of our agreement (Art. 6(1)(b))</td>
          </tr>
          <tr>
            <td>Trip preferences — pace, popularity, effort, crowds and similar</td>
            <td>To shape the plans the assistant builds for you.</td>
            <td>Performance of our agreement (Art. 6(1)(b))</td>
          </tr>
          <tr>
            <td>Starting point of a trip, including device location if you choose to use it</td>
            <td>So plans start and end where you actually stay. Location is read from your
                browser only after you press the button and your browser asks for
                permission. We store the resulting coordinates with the trip, not a
                continuous location history.</td>
            <td>Your consent (Art. 6(1)(a)), withdrawable by deleting the starting point</td>
          </tr>
          <tr>
            <td>Token balance and usage history</td>
            <td>To account for operations that consume computing resources.</td>
            <td>Performance of our agreement (Art. 6(1)(b))</td>
          </tr>
          <tr>
            <td>Server logs — IP address, time, requested address, error details</td>
            <td>To keep the Service running, diagnose faults and detect abuse.</td>
            <td>Our legitimate interest in a secure, working service (Art. 6(1)(f))</td>
          </tr>
          <tr>
            <td>Usage statistics through Google Analytics</td>
            <td>To see which parts of the Service are used and where people get stuck.</td>
            <td>Your consent (Art. 6(1)(a)), given or refused in the cookie banner</td>
          </tr>
        </tbody>
      </table>
      <p>
        We do not collect payment details, identity documents, bank data or any special
        categories of data. Nothing in the Service asks for them.
      </p>

      <h2>3. Who else sees your data</h2>
      <p>
        The Service runs on our own server in Berlin, Germany, operated by IONOS SE. The
        database — including your account and all your content — is hosted there and is not
        entrusted to any external database provider.
      </p>
      <p>Beyond that, data leaves our server only in these situations:</p>
      <table>
        <thead>
          <tr><th>Recipient</th><th>What they receive</th><th>When</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Google (Gemini API)</td>
            <td>The destination city, your trip preferences, names of places on your board
                and the time window for the day. Not your email address, account identifier
                or password.</td>
            <td>When you generate a plan, ask the assistant for a hint, or search for places
                in natural language</td>
          </tr>
          <tr>
            <td>Google (Analytics)</td>
            <td>Pseudonymous usage statistics and technical browser data</td>
            <td>Only if you accept analytics cookies</td>
          </tr>
          <tr>
            <td>OpenStreetMap Foundation (Nominatim, Overpass)</td>
            <td>The place or city name being searched, and map area coordinates</td>
            <td>When places are searched for or geocoded</td>
          </tr>
          <tr>
            <td>CARTO and OpenTopoMap</td>
            <td>Coordinates of the map fragment being displayed, and your IP address as with
                any web request</td>
            <td>Whenever a map is shown</td>
          </tr>
          <tr>
            <td>Wikimedia Foundation</td>
            <td>Names of places, in order to fetch a description and photograph</td>
            <td>When a place card is filled in</td>
          </tr>
          <tr>
            <td>unpkg and jsDelivr</td>
            <td>Your IP address, as with any request for a file</td>
            <td>When the page loads shared libraries</td>
          </tr>
        </tbody>
      </table>
      <p>
        We may also disclose data where the law requires it — for instance to a court or an
        authorised public authority acting within its powers.
      </p>
      <p>
        We do not sell your data and do not share it for anyone else's marketing.
      </p>

      <h2>4. Transfers outside the European Economic Area</h2>
      <p>
        Our server and database are inside the EEA. Google is based in the United States;
        when we call the Gemini API or when analytics runs, data may be processed outside the
        EEA. These transfers rely on the European Commission's standard contractual clauses
        and on the EU–US Data Privacy Framework, to which Google LLC is certified.
      </p>

      <h2>5. How long we keep things</h2>
      <ul>
        <li><strong>Account and your content</strong> — for as long as the account exists.
            After you ask us to delete it, up to 30 days, which is the time needed to remove
            it from backups as well.</li>
        <li><strong>Boards you published</strong> — a published board, together with the
            display name signing it, is readable by anyone with the link, including without an
            account. Withdrawing publication stops further access, but copies already made by
            others stay in their accounts as their content, and search engine caches may hold
            the page for a time beyond our control.</li>
        <li><strong>Server logs</strong> — up to 90 days.</li>
        <li><strong>Token usage history</strong> — for the lifetime of the account, as a
            record of operations performed.</li>
        <li><strong>Analytics</strong> — according to Google Analytics settings, currently
            14 months.</li>
      </ul>

      <h2>6. Your rights</h2>
      <p>Under the GDPR you have the right to:</p>
      <ul>
        <li>access your data and receive a copy of it;</li>
        <li>have inaccurate data corrected;</li>
        <li>have your data erased;</li>
        <li>restrict processing;</li>
        <li>receive your data in a machine-readable format and transfer it elsewhere;</li>
        <li>object to processing based on our legitimate interest;</li>
        <li>withdraw consent at any time, without affecting processing carried out before
            the withdrawal.</li>
      </ul>
      <p>
        To exercise any of these, write to{' '}
        <a href="mailto:contact@routemarket.io">contact@routemarket.io</a>. We reply within
        one month; if a request is complex we may extend that by a further two months and
        will tell you if so.
      </p>
      <p>
        You also have the right to lodge a complaint with a supervisory authority. In Poland
        that is the President of the Personal Data Protection Office,{' '}
        <a href="https://uodo.gov.pl" target="_blank" rel="noopener noreferrer">uodo.gov.pl</a>.
        If you live in another EU country, you may complain to your local authority.
      </p>

      <h2>7. Automated processing</h2>
      <p>
        Plans are built automatically, using an AI language model, from the places you
        collected and the preferences you set. This affects the content of a suggestion — it
        does not produce any decision with legal effect or similarly significant consequences
        for you within the meaning of Art. 22 GDPR.
      </p>
      <p>
        We do not build advertising profiles and do not use your content to train AI models.
      </p>

      <h2>8. Security</h2>
      <p>
        Traffic is encrypted with TLS. Passwords are stored as hashes. Access to data in the
        database is limited at row level, so one account cannot read another's content.
        Backups are encrypted and kept separately from the server.
      </p>
      <p>
        No safeguard is absolute. If a breach occurs that is likely to result in a high risk
        to your rights, we will inform you and the supervisory authority as required by
        Art. 33 and 34 GDPR.
      </p>

      <h2>9. Changes</h2>
      <p>
        When this policy changes we publish the new version here with a new date. For changes
        that materially affect your rights we notify registered users in advance.
      </p>
    </LegalLayout>
  );
}
