import { supabase } from '@/integrations/supabase/client';

export function useAtlasApi() {
  const invokeAtlas = async (action: string, input?: Record<string, unknown>) => {
    try {
      const { data, error } = await supabase.functions.invoke('atlas-admin', {
        body: { action, input },
      });

      if (error) {
        if ('context' in error && error.context instanceof Response) {
          try {
            const body = await error.context.clone().json();
            if (body && typeof body === 'object' && body.error) {
              throw new Error(String(body.error));
            }
          } catch {
            try {
              const text = await error.context.clone().text();
              if (text) throw new Error(text);
            } catch {}
          }
        }
        throw error;
      }

      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(String(data.error));
      }

      return data;
    } catch (err) {
      console.error('invokeAtlas error:', err);
      throw err;
    }
  };

  return { invokeAtlas };
}
