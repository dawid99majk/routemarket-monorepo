import { supabase } from '@/integrations/supabase/client';

export interface LegalDocMeta {
  version: string;
  publishedAt: string;
  contentHash: string;
}

// Static fallback for SSR / offline
export const LEGAL_DOCS: Record<string, LegalDocMeta> = {
  terms: {
    version: '1.0.0',
    publishedAt: '2026-03-22',
    contentHash: 'sha256-terms-v1-a3b2c1',
  },
  privacy: {
    version: '1.0.0',
    publishedAt: '2026-03-22',
    contentHash: 'sha256-privacy-v1-d4e5f6',
  },
  cookies: {
    version: '1.0.0',
    publishedAt: '2026-03-22',
    contentHash: 'sha256-cookies-v1-g7h8i9',
  },
  refunds: {
    version: '1.0.0',
    publishedAt: '2026-03-22',
    contentHash: 'sha256-refunds-v1-j0k1l2',
  },
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
