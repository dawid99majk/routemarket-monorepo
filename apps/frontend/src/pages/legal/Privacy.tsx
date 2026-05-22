import LegalLayout from '@/components/LegalLayout';

export default function Privacy() {
  return (
    <LegalLayout docKey="privacy">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">RouteMarket.io — Last updated: April 03, 2026</p>

      <h2>1. Data Controller</h2>
      <p>The data controller for your personal data is the operator of RouteMarket.io:</p>
      <p>Dawid Majka<br />
      Address: ul. Czeresniowa 67/2, Medlow, 55-020, Poland<br />
      Email: <a href="mailto:contact@routemarket.io">contact@routemarket.io</a><br />
      Tax ID (NIP): N/A (unregistered business activity)</p>
      <p>Personal data is processed in accordance with Regulation (EU) 2016/679 (General Data Protection Regulation, "GDPR"), the Polish Act on Protection of Personal Data, and other applicable data protection laws.</p>

      <h2>2. Data We Collect</h2>
      <h3>2.1 Data You Provide</h3>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr><th>Data Category</th><th>Specific Data</th><th>When Collected</th></tr>
          </thead>
          <tbody>
            <tr><td>Account Data</td><td>Email address, display name, password (hashed)</td><td>Registration</td></tr>
            <tr><td>Creator Profile</td><td>Full name, address, bank account (via Stripe Connect), tax ID, profile bio, photo</td><td>Creator onboarding</td></tr>
            <tr><td>Purchase Data</td><td>Transaction history, purchased items, payment method (last 4 digits only)</td><td>Each purchase</td></tr>
            <tr><td>Content Data</td><td>GPX files, PDF guides, images, route descriptions, tags</td><td>Creator uploads</td></tr>
            <tr><td>Communication Data</td><td>Support messages, complaint details, feedback</td><td>When you contact us</td></tr>
            <tr><td>Review Data</td><td>Star ratings, written reviews</td><td>When you leave a review</td></tr>
          </tbody>
        </table>
      </div>

      <h3>2.2 Data Collected Automatically</h3>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr><th>Data Category</th><th>Specific Data</th><th>Purpose</th></tr>
          </thead>
          <tbody>
            <tr><td>Technical Data</td><td>IP address, browser type, device type, OS</td><td>Security &amp; analytics</td></tr>
            <tr><td>Usage Data</td><td>Pages visited, clicks, search queries, time on page</td><td>Service improvement</td></tr>
          </tbody>
        </table>
      </div>

      <h2>3. Legal Bases and Purposes of Processing</h2>
      <p>We process your personal data only when we have a valid legal basis under GDPR Article 6(1).</p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr><th>Purpose</th><th>Legal Basis (GDPR)</th><th>Details</th></tr>
          </thead>
          <tbody>
            <tr><td>Account creation &amp; management</td><td>Art. 6(1)(b) - Contract performance</td><td>Necessary to provide the Service</td></tr>
            <tr><td>Processing payments</td><td>Art. 6(1)(b) - Contract performance</td><td>Via Stripe; necessary to complete purchases</td></tr>
            <tr><td>Creator identity verification</td><td>Art. 6(1)(c) - Legal obligation</td><td>DSA Art. 30 KYBC requirements</td></tr>
            <tr><td>Service communications</td><td>Art. 6(1)(b) - Contract performance</td><td>Order confirmations, delivery notifications</td></tr>
            <tr><td>Customer support &amp; complaints</td><td>Art. 6(1)(b) - Contract performance</td><td>Handling your requests and complaints</td></tr>
            <tr><td>Analytics &amp; service improvement</td><td>Art. 6(1)(f) - Legitimate interest</td><td>Understanding usage to improve the Platform</td></tr>
            <tr><td>Security &amp; fraud prevention</td><td>Art. 6(1)(f) - Legitimate interest</td><td>Protecting users and the Platform</td></tr>
            <tr><td>Marketing (with consent)</td><td>Art. 6(1)(a) - Consent</td><td>Newsletters, promotions; only with opt-in</td></tr>
          </tbody>
        </table>
      </div>

      <h2>4. Data Recipients and Processors</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr><th>Recipient</th><th>Purpose</th><th>Data Shared</th><th>Location</th></tr>
          </thead>
          <tbody>
            <tr><td>Stripe, Inc.</td><td>Payment processing, Creator payouts</td><td>Transaction data, payment details</td><td>USA (SCC)</td></tr>
            <tr><td>Supabase, Inc.</td><td>Database hosting, file storage</td><td>All account and content data</td><td>EU / USA (SCC)</td></tr>
            <tr><td>Mapbox, Inc.</td><td>Map display, route visualization</td><td>IP address, usage data</td><td>USA (SCC)</td></tr>
            <tr><td>Email service provider</td><td>Transactional emails</td><td>Email address, name</td><td>EU / USA (SCC)</td></tr>
            <tr><td>Google LLC (Google Analytics)</td><td>Website analytics</td><td>Anonymized usage data, IP address</td><td>USA (SCC / DPF)</td></tr>
          </tbody>
        </table>
      </div>

      <h2>5. International Data Transfers</h2>
      <p>Some of our service providers are located outside the European Economic Area (EEA), particularly in the United States. We ensure appropriate safeguards for such transfers through:</p>
      <ul>
        <li>EU-US Data Privacy Framework (where the recipient is certified)</li>
        <li>Standard Contractual Clauses (SCCs) approved by the European Commission (Decision 2021/914)</li>
        <li>Adequacy decisions by the European Commission where applicable</li>
      </ul>
      <p>You may request a copy of the applicable safeguards by contacting us at <a href="mailto:contact@routemarket.io">contact@routemarket.io</a>.</p>

      <h2>6. Data Retention</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr><th>Purpose</th><th>Legal Basis (GDPR)</th><th>Details</th></tr>
          </thead>
          <tbody>
            <tr><td>Account creation &amp; management</td><td>Art. 6(1)(b) - Contract performance</td><td>Necessary to provide the Service</td></tr>
            <tr><td>Processing payments</td><td>Art. 6(1)(b) - Contract performance</td><td>Via Stripe; necessary to complete purchases</td></tr>
            <tr><td>Creator identity verification</td><td>Art. 6(1)(c) - Legal obligation</td><td>DSA Art. 30 KYBC requirements</td></tr>
            <tr><td>Service communications</td><td>Art. 6(1)(b) - Contract performance</td><td>Order confirmations, delivery notifications</td></tr>
            <tr><td>Customer support &amp; complaints</td><td>Art. 6(1)(b) - Contract performance</td><td>Handling your requests and complaints</td></tr>
          </tbody>
        </table>
      </div>

      <h2>7. Your Rights (GDPR)</h2>
      <p>Under GDPR, you have the following rights regarding your personal data:</p>
      <ul>
        <li><strong>Right of access (Art. 15):</strong> Obtain a copy of your personal data and information about how it is processed.</li>
        <li><strong>Right to rectification (Art. 16):</strong> Request correction of inaccurate or incomplete data.</li>
        <li><strong>Right to erasure (Art. 17):</strong> Request deletion of your data ("right to be forgotten"), subject to legal retention obligations.</li>
        <li><strong>Right to restriction (Art. 18):</strong> Request that we limit processing of your data in certain circumstances.</li>
        <li><strong>Right to data portability (Art. 20):</strong> Receive your data in a structured, commonly used, machine-readable format.</li>
        <li><strong>Right to object (Art. 21):</strong> Object to processing based on legitimate interest, including profiling.</li>
        <li><strong>Right to withdraw consent (Art. 7(3)):</strong> Withdraw consent at any time, without affecting the lawfulness of prior processing.</li>
        <li><strong>Right to lodge a complaint:</strong> File a complaint with the Polish DPA (UODO, uodo.gov.pl) or your local supervisory authority.</li>
      </ul>
      <p>To exercise any of these rights, contact us at <a href="mailto:contact@routemarket.io">contact@routemarket.io</a>. We will respond within 30 days (GDPR Art. 12(3)). We may request identity verification before processing your request.</p>

      <h2>8. Automated Decision-Making and Profiling</h2>
      <p>RouteMarket.io may use automated systems to recommend routes based on your browsing history, location preferences, and category interests. These recommendations do not produce legal effects or similarly significantly affect you (GDPR Art. 22). You may opt out of personalized recommendations in your account settings.</p>

      <h2>9. Children's Privacy</h2>
      <p>The Service is not directed to children under 18 years of age (or the age of majority in your jurisdiction). We do not knowingly collect personal data from children. If we become aware that we have collected personal data from a child, we will take steps to delete such data promptly.</p>

      <h2>10. Additional Rights for California Residents (CCPA/CPRA)</h2>
      <p>If you are a California resident, the California Consumer Privacy Act (CCPA) as amended by the California Privacy Rights Act (CPRA) provides you with additional rights:</p>
      <ul>
        <li><strong>Right to Know:</strong> You may request details about the categories and specific pieces of personal information we have collected about you, the sources, business purposes, and third parties we share it with.</li>
        <li><strong>Right to Delete:</strong> You may request deletion of your personal information, subject to certain exceptions.</li>
        <li><strong>Right to Correct:</strong> You may request correction of inaccurate personal information.</li>
        <li><strong>Right to Opt-Out:</strong> You have the right to opt out of the "sale" or "sharing" of your personal information. We do not sell personal information in the traditional sense, but certain data sharing with analytics providers may constitute "sharing" under CCPA.</li>
        <li><strong>Right to Non-Discrimination:</strong> We will not discriminate against you for exercising your CCPA rights.</li>
      </ul>
      <p>To exercise these rights, email <a href="mailto:contact@routemarket.io">contact@routemarket.io</a> with subject "CCPA Request" or use the "Do Not Sell or Share My Personal Information" link in the Platform footer. We honor Global Privacy Control (GPC) browser signals as valid opt-out requests.</p>

      <h2>11. Additional Information for UK Residents</h2>
      <p>If you are a resident of the United Kingdom, your personal data is protected under the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018. Your rights are substantially the same as those listed in Section 7. The relevant supervisory authority is the Information Commissioner's Office (ICO): ico.org.uk.</p>

      <h2>12. Cookies and Tracking Technologies</h2>
      <p>We use cookies and similar technologies to operate the Platform. For detailed information about the cookies we use and how to manage your preferences, please see our <a href="/legal/cookies">Cookie Policy</a>.</p>

      <h2>13. Security Measures</h2>
      <p>We implement appropriate technical and organizational measures to protect your personal data, including encryption in transit (TLS/SSL), secure authentication, access controls, regular security reviews, and incident response procedures. However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.</p>

      <h2>14. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on the Platform and, where required, by sending you an email notification. The "Last updated" date at the top of this policy indicates when it was last revised.</p>

      <h2>15. Contact and DPO</h2>
      <p>For any questions or requests regarding your personal data, please contact:</p>
      <p>Data Protection Contact: <a href="mailto:contact@routemarket.io">contact@routemarket.io</a><br />
      Operator: Dawid Majka<br />
      Address: ul. Czeresniowa 67/2, Medlow, 55-020, Poland<br />
      Polish Data Protection Authority (UODO): ul. Stawki 2, 00-193 Warsaw, <a href="https://uodo.gov.pl" target="_blank" rel="noopener noreferrer">uodo.gov.pl</a></p>
    </LegalLayout>
  );
}
