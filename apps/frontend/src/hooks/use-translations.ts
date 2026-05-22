import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Detect user language, default to 'en'
export function getUserLanguage(): string {
  const stored = localStorage.getItem('app-language');
  if (stored) return stored;
  const browserLang = navigator.language?.split('-')[0] || 'en';
  return browserLang;
}

export function setUserLanguage(lang: string) {
  localStorage.setItem('app-language', lang);
}

// Supported languages
export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'pl', label: 'Polski', flag: '🇵🇱' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'cs', label: 'Čeština', flag: '🇨🇿' },
  { code: 'nl', label: 'Nederlands', flag: '🇳🇱' },
];

interface RouteTranslation {
  id: number;
  title: string;
  description: string;
  is_auto_translated: boolean;
  language_code: string;
}

/**
 * Fetch cached translation from DB, or trigger AI translation via edge function
 */
export function useRouteTranslation(routeId: number | undefined, languageCode: string) {
  return useQuery({
    queryKey: ['route-translation', routeId, languageCode],
    enabled: !!routeId && !!languageCode,
    queryFn: async (): Promise<RouteTranslation | null> => {
      // First check DB cache
      const { data: existing } = await supabase
        .from('route_translations')
        .select('id, title, description, is_auto_translated, language_code')
        .eq('route_id', routeId!)
        .eq('language_code', languageCode)
        .maybeSingle();

      if (existing) return existing as RouteTranslation;

      // Trigger AI translation
      const { data, error } = await supabase.functions.invoke('translate-route', {
        body: { route_id: routeId, language_code: languageCode },
      });

      if (error) {
        console.error('Translation error:', error);
        return null;
      }

      return data as RouteTranslation;
    },
    staleTime: 1000 * 60 * 30, // 30 min
    retry: 1,
  });
}

/**
 * Fetch all translations for a route (for creator management)
 */
export function useRouteTranslations(routeId: number | undefined) {
  return useQuery({
    queryKey: ['route-translations-all', routeId],
    enabled: !!routeId,
    queryFn: async (): Promise<RouteTranslation[]> => {
      const { data, error } = await supabase
        .from('route_translations')
        .select('id, title, description, is_auto_translated, language_code')
        .eq('route_id', routeId!)
        .order('language_code');
      if (error) throw error;
      return (data ?? []) as RouteTranslation[];
    },
  });
}

/**
 * Update (override) a translation — for creators
 */
export function useUpdateTranslation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      title,
      description,
    }: {
      id: number;
      title: string;
      description: string;
    }) => {
      const { error } = await supabase
        .from('route_translations')
        .update({ title, description, is_auto_translated: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-translation'] });
      queryClient.invalidateQueries({ queryKey: ['route-translations-all'] });
    },
  });
}

/**
 * Delete a translation
 */
export function useDeleteTranslation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('route_translations')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-translation'] });
      queryClient.invalidateQueries({ queryKey: ['route-translations-all'] });
    },
  });
}
