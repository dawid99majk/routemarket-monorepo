import LegalLayout from '@/components/LegalLayout';

export default function CreatorAgreement() {
  return (
    <LegalLayout docKey="creator-agreement">
      <h1>Creator Agreement</h1>
      <p className="text-sm text-muted-foreground">RouteMarket.io — Last updated: April 03, 2026</p>

      <p>This Creator Agreement ("Agreement") is a binding contract between you ("Creator", "you") and the operator of RouteMarket.io ("Platform", "we", "us"). By registering as a Creator and publishing Route Packages on the Platform, you accept and agree to be bound by this Agreement, in addition to our <a href="/legal/terms">Terms of Service</a>.</p>

      <h2>1. Creator Eligibility and Verification</h2>

      <h3>1.1 Eligibility</h3>
      <p>To become a Creator, you must: (a) be at least 18 years old or the age of majority in your jurisdiction; (b) have the legal capacity to enter into this Agreement; (c) provide accurate and complete registration information.</p>

      <h3>1.2 Identity Verification (DSA Art. 30 — Know Your Business Customer)</h3>
      <p>In compliance with the Digital Services Act (EU) 2022/2065, Article 30, all Creators must complete identity verification before publishing Route Packages. This is done through Stripe Connect onboarding and includes:</p>
      <ul>
        <li>Full legal name (or registered business name)</li>
        <li>Residential or business address</li>
        <li>Valid government-issued identification</li>
        <li>Bank account details for receiving payouts</li>
        <li>Tax identification number (where required by applicable law)</li>
        <li>Email address and phone number</li>
      </ul>
      <p>We may periodically request updated verification information. Failure to maintain valid verification may result in suspension of your Creator account and withholding of payouts.</p>

      <h2>2. Route Package Listings</h2>

      <h3>2.1 Content Requirements</h3>
      <p>Each Route Package listed on the Platform must include:</p>
      <ul>
        <li>A GPX file with a valid GPS track, and/or a PDF guide.</li>
        <li>An accurate title and description of the route.</li>
        <li>Correct categorization (Moto, City Explorer, Off-Road, Cycling &amp; Hiking).</li>
        <li>Appropriate difficulty rating.</li>
        <li>Relevant tags and location information.</li>
        <li>At least one preview image.</li>
      </ul>

      <h3>2.2 Content Standards</h3>
      <p>All Route Packages must comply with our <a href="/legal/acceptable-use">Acceptable Use Policy</a> and <a href="/legal/terms">Terms of Service</a>. In particular, Route Packages must NOT:</p>
      <ul>
        <li>Contain routes through private property without permission, restricted military zones, or areas closed to public access.</li>
        <li>Promote illegal activities (e.g., speeding, trespassing, off-roading in protected areas).</li>
        <li>Include content that infringes on third-party intellectual property rights.</li>
        <li>Contain misleading or false information about route conditions, safety, or difficulty.</li>
        <li>Include malware, viruses, or other harmful code in uploaded files.</li>
        <li>Contain discriminatory, defamatory, or hateful content.</li>
      </ul>

      <h3>2.3 Pricing</h3>
      <p>Creators set the price for each Route Package. Prices must be set in EUR (or as otherwise enabled by the Platform). The Platform displays prices to Explorers in their preferred currency using real-time exchange rates. The Platform reserves the right to set minimum and maximum price limits to protect the marketplace ecosystem.</p>

      <h2>3. Intellectual Property and Licensing</h2>

      <h3>3.1 Creator Ownership</h3>
      <p>You retain full ownership of all intellectual property rights in your Route Packages and Content. Nothing in this Agreement transfers ownership of your Content to RouteMarket.io.</p>

      <h3>3.2 License to Platform</h3>
      <p>By publishing a Route Package, you grant RouteMarket.io a non-exclusive, worldwide, royalty-free license to: (a) display, reproduce, and distribute preview content (images, descriptions, map previews) for the purpose of promoting and operating the Platform; (b) deliver the full Route Package to Explorers who purchase it; (c) create thumbnails, previews, and excerpts for marketing purposes. This license continues for as long as the Route Package is listed, plus a reasonable wind-down period for existing sales (max 30 days after removal).</p>

      <h3>3.3 License to Explorers</h3>
      <p>Upon sale, the Explorer receives a non-exclusive, non-transferable, personal license to use the Route Package for private, non-commercial purposes. As the Creator, you grant this license through the Platform. Explorers may NOT resell, redistribute, or publicly share your Route Package.</p>

      <h3>3.4 Originality Warranty</h3>
      <p>By publishing Content, you represent and warrant that: (a) you are the original creator of the Content or have all necessary rights and permissions to distribute it; (b) the Content does not infringe any third-party copyrights, trademarks, or other rights; (c) you have obtained all necessary consents from any individuals featured in photos or videos included in the Route Package.</p>

      <h2>4. Revenue and Payouts</h2>

      <h3>4.1 Revenue Split</h3>
      <p>For each sale, the revenue is split as follows: Creator receives 65% of the sale price (net of applicable taxes), Platform retains 35% as the Platform Fee. This split is applied after any applicable payment processing fees charged by Stripe.</p>

      <h3>4.2 Payout Schedule</h3>
      <p>Payouts are processed via Stripe Connect on a rolling basis, subject to Stripe's standard payout schedule (typically 2–7 business days, depending on your country). Minimum payout thresholds may apply as determined by Stripe.</p>

      <h3>4.3 Refunds Impact</h3>
      <p>If a refund is issued to an Explorer, the Creator's share of that transaction will be deducted from future payouts. In cases where the refund is due to a defect in the Route Package, the full refund amount (including the Platform Fee) is returned to the Explorer, and the Creator's share is deducted accordingly.</p>

      <h3>4.4 Tax Obligations</h3>
      <p>You are solely responsible for reporting and paying all applicable taxes on your earnings from the Platform, including income tax, VAT (if registered), and any other local taxes. RouteMarket.io may be required to report your earnings to tax authorities under applicable laws, including EU Directive 2021/514 (DAC7) and US tax reporting requirements (1099-K/W-8BEN). By accepting this Agreement, you consent to such reporting where required by law.</p>

      <h2>5. Creator Responsibilities</h2>
      <ul>
        <li>Maintain accurate and up-to-date listing information for all Route Packages.</li>
        <li>Respond to Explorer inquiries and complaints in a timely and professional manner.</li>
        <li>Update or remove Route Packages if you become aware that route conditions have significantly changed (e.g., road closure, safety hazard).</li>
        <li>Comply with all applicable laws in your jurisdiction, including consumer protection, tax, and intellectual property laws.</li>
        <li>Not engage in any manipulation of reviews, ratings, or sales metrics.</li>
        <li>Cooperate with RouteMarket.io in resolving disputes with Explorers.</li>
      </ul>

      <h2>6. Platform Rights and Content Moderation</h2>

      <h3>6.1 Review and Removal</h3>
      <p>RouteMarket.io reserves the right to review, edit, disable, or remove any Route Package that violates this Agreement, our Terms of Service, our Acceptable Use Policy, or applicable law. We will provide you with a clear statement of reasons for any such action (DSA Art. 17), unless doing so would compromise an ongoing investigation or legal requirement.</p>

      <h3>6.2 Notice of Removal</h3>
      <p>If we remove or restrict access to your Content, we will notify you via email with: (a) the specific Content affected; (b) the reason for the action; (c) the facts and legal basis; (d) your right to appeal through our internal complaint-handling system (DSA Art. 20).</p>

      <h3>6.3 Repeat Infringers</h3>
      <p>Creators who repeatedly violate these terms may have their accounts permanently suspended and may forfeit any outstanding payouts related to infringing content.</p>

      <h2>7. Liability and Indemnification</h2>

      <h3>7.1 Creator Liability</h3>
      <p>You are solely responsible for the content, accuracy, and legality of your Route Packages. RouteMarket.io does not verify the safety, accuracy, or legality of routes. You acknowledge that Explorers may rely on your Route Packages for navigation in potentially hazardous environments, and you accept responsibility for ensuring your descriptions and safety warnings are accurate and complete.</p>

      <h3>7.2 Indemnification</h3>
      <p>You agree to indemnify and hold harmless RouteMarket.io from any claims, damages, losses, or expenses arising from: (a) your Route Packages or Content; (b) your breach of this Agreement; (c) your infringement of any third-party rights; (d) any injury, damage, or loss suffered by an Explorer as a result of following a route you created.</p>

      <h2>8. Termination</h2>

      <h3>8.1 Creator Termination</h3>
      <p>You may terminate your Creator account at any time by emailing <a href="mailto:contact@routemarket.io">contact@routemarket.io</a>. Upon termination: (a) your Route Packages will be delisted within 48 hours; (b) Explorers who previously purchased your content retain their licenses; (c) any outstanding payouts will be processed within 30 days, subject to any pending refund claims.</p>

      <h3>8.2 Platform Termination</h3>
      <p>We may terminate or suspend your Creator account for: (a) material breach of this Agreement; (b) repeated violations of our policies; (c) fraudulent activity; (d) failure to maintain valid identity verification. We will provide at least 30 days' notice for termination, except in cases of fraud, illegal activity, or urgent safety concerns, where immediate action may be taken.</p>

      <h2>9. Confidentiality</h2>
      <p>Both parties agree to keep confidential any non-public information shared during the course of this relationship, including but not limited to: sales data, payout amounts, unpublished features, and internal Platform metrics. This obligation survives termination of this Agreement for 2 years.</p>

      <h2>10. Changes to This Agreement</h2>
      <p>We may modify this Agreement with at least 30 days' notice via email. If you do not agree to the modified terms, you may terminate your Creator account before the changes take effect. Continued use of the Platform after the effective date constitutes acceptance. For changes required by law or court order, shorter notice periods may apply.</p>

      <h2>11. Governing Law</h2>
      <p>This Agreement is governed by the laws of the Republic of Poland. If you are a consumer in the EU/EEA, you also benefit from mandatory consumer protection laws of your country of residence. Disputes shall be resolved in accordance with Section 15 of our <a href="/legal/terms">Terms of Service</a>.</p>

      <h2>12. Contact</h2>
      <p>For questions about this Agreement:</p>
      <p>Email: <a href="mailto:contact@routemarket.io">contact@routemarket.io</a> (Subject: "Creator Agreement")<br />
      Operator: Dawid Majka<br />
      Address: ul. Czeresniowa 67/2, Medlow, 55-020, Poland</p>
    </LegalLayout>
  );
}
