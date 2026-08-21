import LegalLayout from '@/components/LegalLayout';

/**
 * Bez DMCA w tytule: operator jest w Polsce, serwis nie sprzedaje treści, a
 * amerykańska procedura counter-notice sugerowała jurysdykcję i tryb, których tu
 * nie ma. Zostaje to, co wykonalne — zgłoszenie, usunięcie, sprzeciw autora.
 */
export default function Copyright() {
  return (
    <LegalLayout docKey="copyright">
      <h1>Copyright Policy</h1>
      <p className="text-sm text-muted-foreground">RouteMarket — last updated 18 August 2026</p>

      <h2>1. The short version</h2>
      <p>
        Publish only what you have the right to publish. If someone publishes your work
        without permission, tell us and we will deal with it.
      </p>

      <h2>2. Where the material in the Service comes from</h2>
      <p>
        Place descriptions, photographs and map data are drawn from open sources —
        OpenStreetMap, Wikipedia and Wikimedia Commons — and from an AI language model that
        writes summaries. These sources have their own licences, most often requiring
        attribution and sharing on the same terms.
      </p>
      <p>
        Where we show a photograph or an excerpt from those sources, the rights stay with
        their authors. If you export or reuse such material, you take on the obligations of
        the licence it came with.
      </p>
      <p>
        Map data comes from OpenStreetMap and is available under the Open Database Licence.
      </p>

      <h2>3. Your own content</h2>
      <p>
        Notes you write, board names and the selection of places you assemble remain yours.
        Publishing a board grants other users permission to view it and copy it into their
        own accounts — nothing more.
      </p>
      <p>
        When you paste text from a website or a blog into the Service, you are responsible
        for having the right to do so. Pasting an entire article someone else wrote is not
        that.
      </p>

      <h2>4. Reporting an infringement</h2>
      <p>
        Write to <a href="mailto:contact@routemarket.io">contact@routemarket.io</a> with the
        subject "Copyright". Please include:
      </p>
      <ul>
        <li>identification of the work concerned, and evidence that the rights are yours or
            that you act on behalf of the rightsholder;</li>
        <li>a link to the exact place in the Service where the material appears;</li>
        <li>your contact details;</li>
        <li>a statement that, to the best of your knowledge, the use is not authorised by
            the rightsholder or permitted by law.</li>
      </ul>
      <p>
        We aim to review reports within 14 days. Where the report is well-founded we remove
        the material and inform the person who published it.
      </p>

      <h2>5. If your content was removed</h2>
      <p>
        We will tell you what was removed and on what basis. If you believe the removal was
        wrong — because you hold the rights, or the use was permitted, for instance as
        quotation — write back within 30 days explaining why. We will re-examine the case and
        restore the material if the objection turns out to be justified.
      </p>

      <h2>6. Repeat infringement</h2>
      <p>
        Accounts that repeatedly publish other people's work without permission will be
        closed.
      </p>

      <h2>7. Reports made in bad faith</h2>
      <p>
        Filing a knowingly false report — to remove a competitor's board, or content you
        simply dislike — is an abuse of this procedure and may itself give rise to liability.
        We keep a record of reports and of how they were resolved.
      </p>
    </LegalLayout>
  );
}
