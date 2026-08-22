import LegalLayout from '@/components/LegalLayout';

/**
 * Napisane pod planer, nie pod marketplace. Poprzednia wersja opisywała sprzedaż
 * „Route Packages", prowizję 35%, wypłaty przez Stripe Connect i weryfikację
 * tożsamości twórców — nic z tego nigdy nie istniało w tym produkcie i nie
 * istnieje w bazie. Obowiązki, których nie da się wykonać, są gorsze niż ich brak.
 */
export default function Terms() {
  return (
    <LegalLayout docKey="terms">
      <h1>Terms of Service</h1>
      <p className="text-sm text-muted-foreground">RouteMarket — last updated 18 August 2026</p>

      <h2>1. Who we are</h2>
      <p>
        RouteMarket (the "Service") is operated by Dawid Majka, ul. Czereśniowa 67/2,
        55-020 Medłów, Poland — referred to below as "we", "us" or "the Operator".
        You can reach us at <a href="mailto:contact@routemarket.io">contact@routemarket.io</a>.
      </p>
      <p>
        By creating an account or using the Service you accept these Terms. If you do not
        accept them, please do not use the Service.
      </p>

      <h2>2. What the Service does</h2>
      <p>
        RouteMarket is a trip planning tool. You collect places you might want to visit onto
        a board, sort them into "definitely", "maybe" and "no", and an automated assistant
        arranges the ones you kept into a realistic day-by-day plan. Plans can be exported
        as GPX files for use in other applications.
      </p>
      <p>
        The Service is provided free of charge. Nothing is sold through it, no goods or
        digital products are offered for sale, and no payment details are collected.
      </p>
      <p>
        We may change, suspend or discontinue any part of the Service. Where a change
        materially affects how you use it, we will give reasonable notice.
      </p>

      <h2>3. Your account</h2>
      <p>
        You need an account to save boards and generate plans. Keep your password to
        yourself — you are responsible for what happens through your account.
      </p>
      <p>
        Provide accurate details when registering, and keep them current. You may close your
        account at any time by writing to us; we will delete your content as described in
        the <a href="/legal/privacy">Privacy Policy</a>.
      </p>
      <p>
        The Service is not intended for children under 16. If you are under 16, please do
        not create an account.
      </p>

      <h2>4. Your content</h2>
      <p>
        Everything you add — board names, places, notes, plans — remains yours. We do not
        claim ownership of it.
      </p>
      <p>
        To run the Service we need permission to store your content, show it back to you,
        and process it in order to build plans. By using the Service you grant us that
        permission, limited to operating the Service and for as long as you keep the content
        with us.
      </p>
      <p>
        If you publish a board or a collection, it becomes readable by anyone who has the
        link — including people without an account, and including search engines. Publishing
        also makes visible the display name you sign it with. Copying it into an account, or
        marking it as liked, requires being signed in.
      </p>
      <p>
        Publishing is always your explicit choice and can be reversed at any time. Withdrawing
        it stops further access, but copies already made by others remain in their accounts,
        because they are their content from that moment on. A page that was public may also
        persist for a while in search engine caches, which we do not control.
      </p>
      <p>
        What you may and may not publish is set out in the{' '}
        <a href="/legal/acceptable-use">Acceptable Use Policy</a>. Rules on material belonging
        to someone else are in the <a href="/legal/copyright">Copyright Policy</a>.
      </p>

      <h2>5. Tokens</h2>
      <p>
        Some operations that cost us real computing resources — generating a day plan,
        calculating a walking route — consume tokens from your account balance.
      </p>
      <p>
        Tokens are an internal usage allowance. They are granted by us, cannot be bought,
        sold, transferred or exchanged for money, and have no monetary value. If your balance
        runs out, the affected operations become unavailable until we grant more; the rest of
        the Service keeps working.
      </p>

      <h2>6. What the Service is not</h2>
      <p>
        Plans are generated automatically from public data sources and from an AI language
        model. They are suggestions, not verified travel advice.
      </p>
      <p>
        Opening hours, admission rules, accessibility, safety conditions and the very
        existence of a place can change or simply be wrong in our sources. Always verify
        anything that matters — especially opening hours, bookings and local conditions —
        before you rely on it.
      </p>
      <p>
        Walking times and routes are estimates produced by routing software. They do not
        account for closures, terrain difficulty, weather or your own pace and condition.
        You are responsible for your own safety and for judging whether a route suits you.
      </p>

      <h2>7. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use the Service in a way that breaks the law or infringes anyone's rights;</li>
        <li>attempt to gain access to accounts, data or systems that are not yours;</li>
        <li>disrupt the Service or place a disproportionate load on it, including by
            automated scraping or mass requests;</li>
        <li>publish content prohibited by the <a href="/legal/acceptable-use">Acceptable Use Policy</a>.</li>
      </ul>
      <p>
        If you break these rules we may limit or close your account. Where it is reasonable
        to do so, we will tell you why first and give you a chance to respond.
      </p>

      <h2>8. Availability and liability</h2>
      <p>
        The Service is provided as it is. We work to keep it running and accurate, but we do
        not promise it will be uninterrupted, error-free, or that its suggestions will suit
        your circumstances.
      </p>
      <p>
        We are liable for damage caused intentionally or by gross negligence, and for harm to
        life, body or health, in each case as required by applicable law. Beyond that, and to
        the extent the law allows, our liability is excluded — in particular for indirect
        damage, lost profits, and consequences of relying on automatically generated plans
        without verifying them.
      </p>
      <p>
        Nothing in these Terms limits rights that consumer law grants you and that cannot be
        limited by agreement.
      </p>

      <h2>9. Complaints</h2>
      <p>
        If something does not work as described, write to{' '}
        <a href="mailto:contact@routemarket.io">contact@routemarket.io</a>. Tell us what you
        expected, what happened instead, and which account it concerns. We aim to reply within
        14 days.
      </p>
      <p>
        Consumers in the European Union may also use the European Commission's online dispute
        resolution platform at{' '}
        <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">
          ec.europa.eu/consumers/odr
        </a>.
      </p>

      <h2>10. Changes to these Terms</h2>
      <p>
        We may update these Terms — for example when the Service itself changes. We will
        publish the new version here with a new date, and for changes that materially affect
        your rights we will notify registered users at least 14 days in advance. Continuing to
        use the Service after that means you accept the new version.
      </p>

      <h2>11. Governing law</h2>
      <p>
        These Terms are governed by Polish law. This does not deprive consumers of the
        protection of mandatory provisions of the law of their country of habitual residence.
      </p>
    </LegalLayout>
  );
}
