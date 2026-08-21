import { supabase } from '@/integrations/supabase/client';

export interface LegalDocMeta {
  version: string;
  publishedAt: string;
  contentHash: string;
}

// Static fallback for SSR / offline
export const LEGAL_DOCS: Record<string, LegalDocMeta> = {
  // Wersja 2.0.0: dokumenty przepisane z marketplace'u na planer. Poprzednie
  // opisywały sprzedaż tras, prowizję i wypłaty — rzeczy, których nigdy tu nie było.
  terms: { version: '2.0.0', publishedAt: '2026-08-18', contentHash: 'sha256-terms-v2' },
  privacy: { version: '2.0.0', publishedAt: '2026-08-18', contentHash: 'sha256-privacy-v2' },
  cookies: { version: '2.0.0', publishedAt: '2026-08-18', contentHash: 'sha256-cookies-v2' },
  'acceptable-use': { version: '2.0.0', publishedAt: '2026-08-18', contentHash: 'sha256-aup-v2' },
  copyright: { version: '2.0.0', publishedAt: '2026-08-18', contentHash: 'sha256-copyright-v2' },
};

/** Fetch latest legal document versions from the database */
export async function fetchLegalDocs(): Promise<Record<string, LegalDocMeta>> {
  const { data, error } = await supabase
    .from('legal_documents')
    .select('doc_type, version, content_hash, published_at')
    .order('published_at', { ascending: false });

  if (error || !data?.length) return LEGAL_DOCS;

  const result: Record<string, LegalDocMeta> = {};
  for (const row of data) {
    // Keep only latest version per doc_type
    if (!result[row.doc_type]) {
      result[row.doc_type] = {
        version: row.version,
        publishedAt: row.published_at,
        contentHash: row.content_hash,
      };
    }
  }
  return { ...LEGAL_DOCS, ...result };
}
