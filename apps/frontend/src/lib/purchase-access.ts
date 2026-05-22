import { supabase } from '@/integrations/supabase/client';

export interface PurchaseDownloadLink {
  language_code: string | null;
  url: string;
  file_key: string;
}

export interface PurchaseAccessData {
  route: {
    id: number;
    title: string;
    location_string: string;
  };
  purchase: {
    amount_paid: number;
    purchased_at: string;
  };
  gpx_download: PurchaseDownloadLink | null;
  pdf_downloads: PurchaseDownloadLink[];
}

export async function fetchPurchaseAccess(params: {
  sessionId?: string;
  routeId?: number;
}): Promise<PurchaseAccessData> {
  const { data: { session } } = await supabase.auth.getSession();

  const { data, error } = await supabase.functions.invoke('verify-payment', {
    body: {
      session_id: params.sessionId,
      route_id: params.routeId,
    },
    headers: session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : undefined,
  });

  if (error) {
    throw error;
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as PurchaseAccessData;
}
