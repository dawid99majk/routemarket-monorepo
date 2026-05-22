import LegalLayout from '@/components/LegalLayout';

export default function AcceptableUse() {
  return (
    <LegalLayout docKey="acceptable-use">
      <h1>Acceptable Use Policy</h1>
      <p className="text-sm text-muted-foreground">RouteMarket.io — Last updated: April 03, 2026</p>

      <p>This Acceptable Use Policy ("AUP") governs the types of content and behavior permitted on RouteMarket.io. By using the Platform, you agree to comply with this policy. Violations may result in content removal, account suspension, or termination in accordance with our Terms of Service and the Digital Services Act (EU) 2022/2065.</p>

      <h2>1. Permitted Content</h2>
      <p>RouteMarket.io welcomes Route Packages that:</p>
      <ul>
        <li>Contain original, creator-owned GPX tracks and/or PDF guides.</li>
        <li>Describe routes accurately, including difficulty, terrain type, and distance.</li>
        <li>Include honest safety warnings where applicable (road conditions, elevation, hazards).</li>
        <li>Provide useful information for travelers (points of interest, rest stops, fuel stations).</li>
        <li>Respect local laws, regulations, and property rights.</li>
        <li>Are categorized correctly (Moto, City Explorer, Off-Road, Cycling &amp; Hiking).</li>
      </ul>

      <h2>2. Prohibited Content</h2>

      <h3>2.1 Illegal Content</h3>
      <ul>
        <li>Routes through private property without the owner's permission.</li>
        <li>Routes through areas where the intended activity is illegal (e.g., off-roading in national parks where prohibited, motorcycling on pedestrian-only paths).</li>
        <li>Content that facilitates or encourages illegal activity in any jurisdiction.</li>
        <li>Routes designed to circumvent toll roads, border controls, or restricted areas.</li>
      </ul>

      <h3>2.2 Dangerous Content</h3>
      <ul>
        <li>Routes through known dangerous areas without adequate safety warnings.</li>
        <li>Content that encourages reckless driving, excessive speed, or dangerous stunts.</li>
        <li>Routes through active construction zones, military areas, or disaster zones.</li>
        <li>Content that omits known significant hazards (e.g., unguarded cliff edges, flood-prone areas, wildlife danger zones).</li>
      </ul>

      <h3>2.3 Intellectual Property Violations</h3>
      <ul>
        <li>Copies or derivatives of other Creators' Route Packages without permission.</li>
        <li>Content using copyrighted images, maps, or text without a valid license.</li>
        <li>GPX files scraped or downloaded from other platforms or services without authorization.</li>
        <li>Unauthorized use of trademarks or brand names in listings.</li>
      </ul>

      <h3>2.4 Misleading Content</h3>
      <ul>
        <li>Fake or AI-generated routes that have not been actually traveled or verified.</li>
      </ul>

      <h3>2.5 Harmful or Offensive Content</h3>
      <ul>
        <li>Hate speech, discrimination, or content targeting protected groups.</li>
        <li>Sexually explicit or pornographic material.</li>
        <li>Content promoting violence, terrorism, or self-harm.</li>
        <li>Content designed to harass, bully, or intimidate other users.</li>
        <li>Spam, phishing, or scam content.</li>
      </ul>

      <h2>3. Prohibited Behavior</h2>
      <ul>
        <li>Creating multiple accounts to circumvent suspensions or bans.</li>
        <li>Manipulating reviews or ratings (including purchasing fake reviews).</li>
        <li>Attempting to complete transactions outside the Platform to avoid fees.</li>
        <li>Scraping, crawling, or automated access to the Platform without written permission.</li>
        <li>Reverse engineering, decompiling, or attempting to extract the source code of the Platform.</li>
        <li>Using the Platform to distribute malware, viruses, or conduct phishing attacks.</li>
        <li>Impersonating other users, Creators, or RouteMarket.io staff.</li>
        <li>Harassing, threatening, or abusing other users or Platform staff.</li>
      </ul>

      <h2>4. Reporting Violations</h2>
      <p>If you encounter content or behavior that violates this AUP, please report it through: (a) the "Report" button on any Route Package listing; (b) email to <a href="mailto:contact@routemarket.io">contact@routemarket.io</a> with subject "AUP Violation Report".</p>
      <p>Please include the URL or listing ID, a description of the violation, and any supporting evidence. Reports are processed in accordance with the Digital Services Act (Art. 16) and our content moderation procedures described in our Terms of Service.</p>

      <h2>5. Enforcement</h2>
      <p>Violations of this AUP may result in:</p>
      <ul>
        <li>Removal or restriction of the offending content, with a statement of reasons (DSA Art. 17).</li>
        <li>Warning to the account holder.</li>
        <li>Temporary suspension of the account (7–30 days depending on severity).</li>
        <li>Permanent account termination for serious or repeated violations.</li>
        <li>Reporting to relevant law enforcement authorities where required or appropriate.</li>
        <li>Withholding of Creator payouts related to violating content.</li>
      </ul>
      <p>All affected users have the right to appeal enforcement decisions through our internal complaint-handling system (DSA Art. 20). Appeals may be submitted to <a href="mailto:contact@routemarket.io">contact@routemarket.io</a> within 6 months of the decision.</p>

      <h2>6. Updates</h2>
      <p>We may update this AUP from time to time. Material changes will be communicated through the Platform and/or email. The "Last updated" date above indicates the most recent revision.</p>

      <h2>7. Contact</h2>
      <p>Questions about this policy: <a href="mailto:contact@routemarket.io">contact@routemarket.io</a></p>
    </LegalLayout>
  );
}
