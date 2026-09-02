import type { Database } from '@/integrations/supabase/types';
import type { AxisValues } from '@/lib/tripPresets';

export type AktualizacjaProjektu = Database['public']['Tables']['trip_projects']['Update'];

export interface TripProject extends Partial<AxisValues> {
  id: string;
  name: string;
  destination: string;
  days: number | null;
  hours_per_day: number | null;
  trip_type: string | null;
  fill_percent?: number | null;
  // Kolumny dołożone później: publikacja tablicy, licznik kopii, punkt startowy
  // i termin wyjazdu. Kod korzystał z nich przez `as any`, więc literówka w
  // nazwie przechodziła bez słowa aż do działającej aplikacji.
  is_public?: boolean;
  copy_count?: number;
  like_count?: number;
  published_at?: string | null;
  author_display?: string | null;
  start_name?: string | null;
  start_lat?: number | null;
  start_lng?: number | null;
  start_date?: string | null;
  end_date?: string | null;
}

export type Priority = 'must' | 'nice' | 'rejected';

export interface PinnedPlace {
  id: string;
  name: string;
  category: string;
  priority: Priority;
  sort_order: number;
  description: string | null;
  opening_hours: string | null;
  visit_minutes: number | null;
  website: string | null;
  image_url: string | null;
  wiki_extract: string | null;
  // Bez współrzędnych nie da się ani narysować mapy tablicy, ani przekazać
  // pinezek planerowi. Kolumny są w bazie od dawna i kod je czyta — brakowało
  // ich wyłącznie w tym opisie, więc każde użycie było błędem typu.
  lat: number | null;
  lng: number | null;
  catalog_id?: string | null;
  source?: string | null;
  vote_count?: number | null;
}

export interface DiscoveredPlace {
  name: string;
  category: string;
  description: string;
  why: string;
  visit_minutes: number | null;
  price_hint: string | null;
  opening_hours: string | null;
  website: string | null;
  image_url: string | null;
  wiki_extract: string | null;
  lat: number | null;
  lng: number | null;
  verified: boolean;
}

export interface TripProjectsProps {
  /** Podaje wyżej kontekst aktywnego wyjazdu, żeby wspólny pasek mógł go pokazać. */
  onContextChange?: (ctx: string | null) => void;
  /**
   * Tablica otwarta z adresu. Wcześniej wybór tablicy był stanem wewnątrz strony:
   * lista kafelków zostawała na ekranie, a treść zmieniała się pod nią, często
   * poniżej linii wzroku. Teraz tablica jest osobnym miejscem z własnym adresem,
   * więc kliknięcie przenosi, a nie przestawia coś w tle.
   */
  projectId?: string | null;
}
