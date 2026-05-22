import LegalLayout from '@/components/LegalLayout';

export default function Cookies() {
  return (
    <LegalLayout docKey="cookies">
      <h1>Cookie Policy</h1>
      <p className="text-sm text-muted-foreground">RouteMarket.io — Last updated: April 03, 2026</p>

      <h2>1. What Are Cookies?</h2>
      <p>Cookies are small text files placed on your device when you visit a website. They are widely used to make websites work efficiently, provide information to website owners, and enhance user experience. Similar technologies include pixels, web beacons, and local storage.</p>

      <h2>2. How We Use Cookies</h2>
      <p>RouteMarket.io uses cookies and similar technologies for the following purposes: ensuring the Platform functions correctly, remembering your preferences, understanding how you use our Platform, processing payments securely, and improving our services.</p>

      <h2>3. Cookie Categories</h2>
      <p>We classify cookies into four categories. Only Strictly Necessary cookies are loaded without your consent. All other categories require your explicit opt-in consent before being activated.</p>

      <h3>3.1 Strictly Necessary Cookies</h3>
      <p>These cookies are essential for the Platform to function. They cannot be disabled. Legal basis: GDPR Art. 6(1)(f) — legitimate interest; ePrivacy Directive Art. 5(3) — exemption for essential cookies.</p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr><th>Cookie Name</th><th>Provider</th><th>Purpose</th><th>Duration</th><th>Type</th></tr>
          </thead>
          <tbody>
            <tr><td>sb-*-auth-token</td><td>Supabase</td><td>User authentication session</td><td>Session / 7 days</td><td>First-party</td></tr>
            <tr><td>sb-*-auth-token-code-verifier</td><td>Supabase</td><td>PKCE authentication flow security</td><td>Session</td><td>First-party</td></tr>
            <tr><td>__stripe_mid</td><td>Stripe</td><td>Fraud prevention during payments</td><td>1 year</td><td>Third-party</td></tr>
            <tr><td>__stripe_sid</td><td>Stripe</td><td>Payment session identifier</td><td>30 minutes</td><td>Third-party</td></tr>
          </tbody>
        </table>
      </div>

      <h3>3.2 Functional Cookies</h3>
      <p>These cookies remember your preferences and settings to provide a more personalized experience. Legal basis: GDPR Art. 6(1)(a) — your consent.</p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr><th>Cookie Name</th><th>Provider</th><th>Purpose</th><th>Duration</th><th>Type</th></tr>
          </thead>
          <tbody>
            <tr><td>rm_lang</td><td>RouteMarket.io</td><td>Language preference</td><td>1 year</td><td>First-party</td></tr>
            <tr><td>rm_currency</td><td>RouteMarket.io</td><td>Currency preference</td><td>1 year</td><td>First-party</td></tr>
            <tr><td>rm_map_prefs</td><td>RouteMarket.io</td><td>Map display settings (zoom, style)</td><td>6 months</td><td>First-party</td></tr>
          </tbody>
        </table>
      </div>

      <h3>3.3 Analytics Cookies</h3>
      <p>These cookies help us understand how visitors interact with the Platform by collecting anonymous statistical information. Legal basis: GDPR Art. 6(1)(a) — your consent.</p>
      <p><em>Note: RouteMarket.io uses Google Analytics 4 (GA4) by Google LLC.</em></p>

      <h3>3.4 Marketing Cookies</h3>
      <p>These cookies are used to track visitors across websites to display relevant advertisements. RouteMarket.io does not currently use marketing cookies. If we introduce them in the future, this policy will be updated and your consent will be requested. Legal basis: GDPR Art. 6(1)(a) — your consent.</p>

      <h2>4. Third-Party Cookies</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr><th>Cookie Name</th><th>Provider</th><th>Purpose</th><th>Duration</th><th>Type</th></tr>
          </thead>
          <tbody>
            <tr><td>_ga</td><td>Google Analytics (GA4)</td><td>Distinguishes users; used to calculate session and campaign data for analytics reports</td><td>2 years</td><td>Third-party</td></tr>
            <tr><td>_ga_*</td><td>Google Analytics (GA4)</td><td>Persists session state across page requests</td><td>2 years</td><td>Third-party</td></tr>
            <tr><td>_gid</td><td>Google Analytics (GA4)</td><td>Distinguishes users; stores and updates a unique value for each page visited</td><td>24 hours</td><td>Third-party</td></tr>
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr><th>Third Party</th><th>Purpose</th><th>Privacy Policy</th></tr>
          </thead>
          <tbody>
            <tr><td>Stripe, Inc.</td><td>Payment processing, fraud prevention</td><td><a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">stripe.com/privacy</a></td></tr>
            <tr><td>Mapbox, Inc.</td><td>Map rendering, route display</td><td><a href="https://www.mapbox.com/legal/privacy" target="_blank" rel="noopener noreferrer">mapbox.com/legal/privacy</a></td></tr>
            <tr><td>Google Analytics (Google LLC)</td><td>Website analytics, user behaviour tracking</td><td><a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">policies.google.com/privacy</a></td></tr>
          </tbody>
        </table>
      </div>

      <h2>5. Your Consent and Cookie Management</h2>
      <h3>5.1 Consent Banner</h3>
      <p>When you first visit RouteMarket.io, a cookie consent banner will appear, allowing you to accept or reject each category of non-essential cookies. You can change your preferences at any time by clicking the "Cookie Settings" link in the Platform footer.</p>
      <h3>5.2 Browser Settings</h3>
      <p>You can also control cookies through your browser settings. Most browsers allow you to block or delete cookies. However, blocking Strictly Necessary cookies may impair the functionality of the Platform. Instructions for common browsers:</p>
      <ul>
        <li>Chrome: Settings &gt; Privacy and Security &gt; Cookies</li>
        <li>Firefox: Settings &gt; Privacy &amp; Security &gt; Cookies and Site Data</li>
        <li>Safari: Preferences &gt; Privacy &gt; Manage Website Data</li>
        <li>Edge: Settings &gt; Cookies and Site Permissions</li>
      </ul>
      <h3>5.3 Global Privacy Control (GPC)</h3>
      <p>We honor Global Privacy Control (GPC) signals from your browser. If your browser sends a GPC signal, we will treat it as a request to opt out of non-essential cookies and any "sale" or "sharing" of personal information under the California Consumer Privacy Act (CCPA/CPRA).</p>
      <h3>5.4 "Do Not Sell or Share" (California Residents)</h3>
      <p>If you are a California resident, you have the right to opt out of the "sale" or "sharing" of your personal information (CCPA Sec. 1798.120). While we do not sell personal information in the traditional sense, certain analytics cookies may constitute "sharing" under CCPA. You can opt out by rejecting Analytics cookies in our cookie banner, using the "Do Not Sell or Share My Personal Information" link in the footer, or enabling GPC in your browser.</p>

      <h2>6. Cookie Retention Periods</h2>
      <p>Session cookies are automatically deleted when you close your browser. Persistent cookies remain on your device for the duration specified in the tables above, or until you manually delete them. We review our cookie usage regularly and remove cookies that are no longer necessary.</p>

      <h2>7. Updates to This Policy</h2>
      <p>We may update this Cookie Policy from time to time to reflect changes in our practices or applicable laws. The "Last updated" date at the top indicates when this policy was last revised. If we make material changes, we will notify you through the cookie consent banner or by other appropriate means.</p>

      <h2>8. Contact</h2>
      <p>For questions about this Cookie Policy or our use of cookies, please contact:</p>
      <p>Email: <a href="mailto:contact@routemarket.io">contact@routemarket.io</a><br />
      Operator: Dawid Majka<br />
      Address: ul. Czeresniowa 67/2, Medlow, 55-020, Poland</p>
      <p>For more information about how we process your personal data, see our <a href="/legal/privacy">Privacy Policy</a>.</p>
    </LegalLayout>
  );
}
