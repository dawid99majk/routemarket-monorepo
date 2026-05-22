import LegalLayout from '@/components/LegalLayout';

export default function Copyright() {
  return (
    <LegalLayout docKey="copyright">
      <h1>Copyright &amp; DMCA Policy</h1>
      <p className="text-sm text-muted-foreground">RouteMarket.io — Last updated: April 03, 2026</p>

      <h2>1. Respect for Intellectual Property</h2>
      <p>RouteMarket.io respects intellectual property rights and expects all users to do the same. This policy outlines how we handle allegations of copyright infringement on the Platform, in compliance with the EU Digital Services Act (2022/2065), the US Digital Millennium Copyright Act (17 U.S.C. § 512), and the EU Copyright Directive (2019/790).</p>

      <h2>2. Reporting Copyright Infringement</h2>

      <h3>2.1 How to Submit a Notice</h3>
      <p>If you believe that content on RouteMarket.io infringes your copyright, please send a notice to our designated copyright agent at: <a href="mailto:copyright@routemarket.io">copyright@routemarket.io</a> (or <a href="mailto:contact@routemarket.io">contact@routemarket.io</a>).</p>

      <h3>2.2 Required Information (DMCA Notice / DSA Art. 16)</h3>
      <p>Your notice must include:</p>
      <ul>
        <li>Your full legal name and contact information (address, phone, email).</li>
        <li>A description of the copyrighted work you claim has been infringed.</li>
        <li>A description of where the allegedly infringing material is located on the Platform (URL or listing ID).</li>
        <li>An explanation of why you believe the use is not authorized by the copyright owner, its agent, or the law.</li>
        <li>A statement under penalty of perjury (for DMCA) that the information in your notice is accurate and that you are the copyright owner or authorized to act on behalf of the owner.</li>
        <li>Your physical or electronic signature.</li>
      </ul>

      <h3>2.3 What Happens After We Receive a Notice</h3>
      <ol>
        <li>We will acknowledge receipt of your notice within 48 hours.</li>
        <li>We will review the notice to determine if it is complete and substantiated.</li>
        <li>If the notice is valid, we will promptly remove or disable access to the allegedly infringing content.</li>
        <li>We will notify the Creator whose content was removed, providing a clear statement of reasons (DSA Art. 17).</li>
        <li>We will inform the reporting party of the action taken.</li>
      </ol>

      <h2>3. Counter-Notice (Creator's Right to Respond)</h2>

      <h3>3.1 Filing a Counter-Notice</h3>
      <p>If you are a Creator and believe your content was removed in error or that you have the right to use the material, you may submit a counter-notice to <a href="mailto:contact@routemarket.io">contact@routemarket.io</a>.</p>

      <h3>3.2 Required Information</h3>
      <p>Your counter-notice must include:</p>
      <ul>
        <li>Your full legal name and contact information.</li>
        <li>Identification of the content that was removed and its former location on the Platform.</li>
        <li>A statement under penalty of perjury that you have a good faith belief that the content was removed as a result of mistake or misidentification.</li>
        <li>A statement that you consent to the jurisdiction of the courts in your district (for US-based parties) or the courts of Poland (for EU/other parties).</li>
        <li>Your physical or electronic signature.</li>
      </ul>

      <h3>3.3 Process After Counter-Notice</h3>
      <p>Upon receiving a valid counter-notice, we will: (a) forward it to the original complainant; (b) inform the complainant that the removed content may be restored in 10–14 business days unless the complainant files a court action; (c) restore the content after the waiting period if no court action is filed.</p>

      <h2>4. Internal Complaint-Handling (DSA Art. 20)</h2>
      <p>Both the reporting party and the affected Creator have the right to use our internal complaint-handling system to appeal any content moderation decision. Complaints should be submitted to <a href="mailto:contact@routemarket.io">contact@routemarket.io</a> within 6 months of the decision. Complaints are reviewed by a person not involved in the original decision, free of charge, and handled in a timely, non-discriminatory, and diligent manner.</p>

      <h2>5. Repeat Infringer Policy</h2>
      <p>RouteMarket.io maintains a policy for terminating the accounts of repeat infringers in appropriate circumstances:</p>
      <ul>
        <li><strong>First violation:</strong> Content removal and written warning.</li>
        <li><strong>Second violation:</strong> Content removal, 30-day account suspension, and potential withholding of payouts for infringing content.</li>
        <li><strong>Third violation:</strong> Permanent account termination and forfeiture of payouts related to infringing content.</li>
      </ul>
      <p>We reserve the right to deviate from this graduated response in cases of egregious or clearly intentional infringement, where immediate termination may be warranted.</p>

      <h2>6. Safe Harbor</h2>
      <p>RouteMarket.io acts as an intermediary platform and does not monitor all content uploaded by Creators. In accordance with the Digital Services Act (Art. 6) and DMCA (17 U.S.C. § 512(c)), we are not liable for infringing content uploaded by users, provided we: (a) do not have actual knowledge of the infringement; (b) act expeditiously to remove or disable access to infringing content upon obtaining knowledge; (c) do not receive a financial benefit directly attributable to the infringing activity where we have the right and ability to control it.</p>

      <h2>7. Good Faith and Misuse</h2>
      <p>Filing false or misleading copyright notices or counter-notices may result in legal liability. Under the DMCA (17 U.S.C. § 512(f)), any person who knowingly materially misrepresents that material is infringing may be liable for damages. Under the DSA, notices submitted with the intent to mislead may result in suspension of the reporting privilege.</p>

      <h2>8. Designated Copyright Agent</h2>
      <p>Our designated agent for receiving copyright notices is:</p>
      <p>Dawid Majka<br />
      Email: <a href="mailto:copyright@routemarket.io">copyright@routemarket.io</a> (or <a href="mailto:contact@routemarket.io">contact@routemarket.io</a>)<br />
      Address: ul. Czeresniowa 67/2, Medlow, 55-020, Poland</p>
    </LegalLayout>
  );
}
