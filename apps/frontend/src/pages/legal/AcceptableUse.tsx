import LegalLayout from '@/components/LegalLayout';

/**
 * Wchłonęła zgłaszanie treści z dawnej osobnej strony DSA. Tamta deklarowała
 * raportowanie transparentności, przedstawiciela prawnego i pozasądowe
 * rozstrzyganie sporów — obowiązki wielkich platform, mocno przeszacowane wobec
 * serwisu tej wielkości. Prosty tryb zgłoszenia i odpowiedzi jest wykonalny,
 * a wykonalna procedura jest warta więcej niż deklarowana.
 */
export default function AcceptableUse() {
  return (
    <LegalLayout docKey="acceptable-use">
      <h1>Acceptable Use Policy</h1>
      <p className="text-sm text-muted-foreground">RouteMarket — last updated 18 August 2026</p>

      <h2>1. What this covers</h2>
      <p>
        Most of what you put into RouteMarket is private — only you see it. This policy
        matters mainly for content you make visible to others: published boards and
        collections, board names, notes and any description you write.
      </p>

      <h2>2. What belongs here</h2>
      <p>
        Places worth visiting, honest notes about them, and boards that would genuinely help
        someone else plan a trip. That is the whole point of publishing.
      </p>

      <h2>3. What does not</h2>
      <p>Do not publish content that:</p>
      <ul>
        <li>breaks the law, or encourages others to break it;</li>
        <li>attacks or demeans people because of race, ethnic origin, nationality, religion,
            disability, age, sex, sexual orientation or gender identity;</li>
        <li>threatens, harasses or targets a specific person, or reveals someone's private
            details without their agreement;</li>
        <li>sexualises minors in any way, or is pornographic;</li>
        <li>promotes violence, terrorism or self-harm;</li>
        <li>you do not have the right to publish — see the{' '}
            <a href="/legal/copyright">Copyright Policy</a>;</li>
        <li>is advertising dressed up as a recommendation, or exists to drive traffic
            somewhere else;</li>
        <li>deliberately misleads — invented places, fake opening hours, descriptions of
            somewhere you have never been presented as first-hand knowledge.</li>
      </ul>

      <h2>4. What you must not do</h2>
      <ul>
        <li>Sign in to an account that is not yours, or try to.</li>
        <li>Probe, scan or test the security of the Service.</li>
        <li>Scrape the Service in bulk or send automated traffic that loads it
            disproportionately.</li>
        <li>Impersonate another person or suggest a connection to us that does not exist.</li>
        <li>Get around a limit, block or account closure we have applied.</li>
      </ul>

      <h2>5. Reporting something</h2>
      <p>
        If you find published content that breaks these rules, write to{' '}
        <a href="mailto:contact@routemarket.io">contact@routemarket.io</a>. To let us act
        quickly, include:
      </p>
      <ul>
        <li>a link to the board or collection concerned;</li>
        <li>what specifically is wrong with it;</li>
        <li>a way to contact you, if you want an answer.</li>
      </ul>
      <p>
        We look at every report. We aim to respond within 14 days and, if we act, to tell you
        what we did. Reports about copyright follow a separate route described in the{' '}
        <a href="/legal/copyright">Copyright Policy</a>.
      </p>
      <p>
        Please do not use this channel to report content you simply disagree with. A board
        recommending a place you did not enjoy is not a violation.
      </p>

      <h2>6. What we do about violations</h2>
      <p>Depending on how serious and how repeated the problem is, we may:</p>
      <ul>
        <li>withdraw publication of a board, so it stops being visible to others;</li>
        <li>remove the offending content;</li>
        <li>limit what an account can do;</li>
        <li>close an account.</li>
      </ul>
      <p>
        Where it is reasonable, we tell the author what we did and why, and give them a
        chance to respond. Content that is clearly unlawful we remove first and explain
        afterwards.
      </p>

      <h2>7. If you think we got it wrong</h2>
      <p>
        Write to <a href="mailto:contact@routemarket.io">contact@routemarket.io</a> within 30
        days, saying what was removed and why you believe the decision was mistaken. A human
        reviews it — not the same automated check that flagged it. If we agree with you, we
        restore the content.
      </p>

      <h2>8. Changes</h2>
      <p>
        We update this policy when the Service changes or when practice shows a rule is
        unclear. The current version is always the one on this page.
      </p>
    </LegalLayout>
  );
}
