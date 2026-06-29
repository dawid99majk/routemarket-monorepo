import {
  Bike, Mountain, Footprints, Snowflake, Waves, Car, Compass,
  TreePine, Route, Zap, Users, ArrowDown, Timer, Gauge,
  Map as MapIcon, MountainSnow, Wind, Tent, Backpack,
  Building2, Utensils, Landmark, Palette, Trees, Moon, Star,
  Eye, Sunrise, MapPinned, Caravan, Dumbbell, Flame,
} from 'lucide-react';
import React from 'react';

// Main category icons (keyed by category name from DB)
export const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'Cycling': Bike,
  'Car': Car,
  'City': Building2,
};

// Sub-categories mapped by parent category name
export const SUB_CATEGORIES: Record<string, string[]> = {
  'Cycling': ['Road Cycling', 'Zaskocz mnie'],
  'Car': ['Road Trips', 'Scenic Drives', '4x4 Lite', '4x4 Hard', 'Caravaning / Vanlife'],
  'City': ['Highlights', 'City Walks', 'Food & Drink', 'Culture & History', 'Themed Routes', 'Nature in City', 'Night & Lifestyle'],
};

// Icons for sub-categories
export const SUB_CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  // Cycling
  'Road Cycling': Route,
  'Zaskocz mnie': Compass,
  // Car
  'Scenic Drives': Eye,
  '4x4 Lite': Car,
  '4x4 Hard': MountainSnow,
  'Caravaning / Vanlife': Caravan,
  'Road Trips': MapIcon,
  // City
  'Highlights': Star,
  'City Walks': Footprints,
  'Food & Drink': Utensils,
  'Culture & History': Landmark,
  'Themed Routes': Palette,
  'Nature in City': Trees,
  'Night & Lifestyle': Moon,
};

// ── Category-specific filter configurations ──

export interface CategoryFilterConfig {
  showDistance?: boolean;
  showElevation?: boolean;
  showSurface?: boolean;
  showDuration?: boolean;
  showRoadType?: boolean;
  showBudget?: boolean;
  showAudience?: boolean;
  durationOptions?: readonly string[];
  roadTypeOptions?: readonly string[];
  surfaceOptions?: readonly string[];
  audienceOptions?: readonly string[];
  budgetOptions?: readonly string[];
}

const DURATION_SHORT = ['1-2h', '2-4h', 'half-day', 'full-day'] as const;
const DURATION_DAYS = ['1 day', '2-3 days', '4-7 days', '7+ days'] as const;
const ROAD_TYPE_OPTIONS = ['asphalt', 'gravel', 'mixed', 'off-road'] as const;
const SURFACE_OPTIONS = ['asphalt', 'gravel', 'trail', 'mixed', 'sand', 'rock'] as const;
const AUDIENCE_OPTIONS = ['solo', 'couples', 'family', 'groups'] as const;
const BUDGET_OPTIONS = ['free', '$', '$$', '$$$'] as const;

export const CATEGORY_FILTERS: Record<string, CategoryFilterConfig> = {
  'Cycling': {
    showDistance: true,
    showElevation: true,
    showSurface: true,
    surfaceOptions: [...SURFACE_OPTIONS],
  },
  'Car': {
    showDuration: true,
    showRoadType: true,
    durationOptions: [...DURATION_DAYS],
    roadTypeOptions: [...ROAD_TYPE_OPTIONS],
  },
  'City': {
    showDuration: true,
    showRoadType: true,
    showBudget: true,
    showAudience: true,
    durationOptions: [...DURATION_SHORT],
    roadTypeOptions: ['walking', 'bike', 'car'] as any,
    audienceOptions: [...AUDIENCE_OPTIONS],
    budgetOptions: [...BUDGET_OPTIONS],
  },
};

// Default config for categories not listed
export const DEFAULT_FILTER_CONFIG: CategoryFilterConfig = {
  showDistance: true,
  showElevation: true,
};

export function getCategoryFilterConfig(categoryName: string | null): CategoryFilterConfig {
  if (!categoryName) return { showDistance: true, showElevation: true, showDuration: false, showRoadType: false, showSurface: false, showBudget: false, showAudience: false };
  return CATEGORY_FILTERS[categoryName] ?? DEFAULT_FILTER_CONFIG;
}

// ── Route quality / completeness scoring ──

export interface RouteQualityResult {
  score: number; // 0-100
  missing: string[];
  status: 'draft' | 'ready' | 'premium';
}

export function calculateRouteQuality(route: {
  title?: string;
  description?: string;
  cover_image_key?: string | null;
  gpx_file_key?: string | null;
  pdf_file_key?: string | null;
  distance_km?: number | null;
  elevation_gain_m?: number | null;
  difficulty?: string | null;
  location_string?: string;
  subcategory?: string | null;
  season?: string | null;
  surface_type?: string | null;
  start_point?: string | null;
  end_point?: string | null;
  imageCount?: number;
}): RouteQualityResult {
  const checks: { key: string; label: string; met: boolean; weight: number }[] = [
    { key: 'title', label: 'Title', met: !!(route.title && route.title.length >= 5), weight: 10 },
    { key: 'description', label: 'Description (50+ chars)', met: !!(route.description && route.description.length >= 50), weight: 15 },
    { key: 'gpx', label: 'GPX file', met: !!route.gpx_file_key, weight: 15 },
    { key: 'pdf', label: 'PDF guide', met: !!route.pdf_file_key, weight: 10 },
    { key: 'cover', label: 'Cover image', met: !!route.cover_image_key, weight: 10 },
    { key: 'images', label: '3+ photos', met: (route.imageCount ?? (route.cover_image_key ? 1 : 0)) >= 3, weight: 5 },
    { key: 'distance', label: 'Distance', met: !!(route.distance_km && route.distance_km > 0), weight: 5 },
    { key: 'elevation', label: 'Elevation', met: !!(route.elevation_gain_m && route.elevation_gain_m > 0), weight: 5 },
    { key: 'difficulty', label: 'Difficulty', met: !!route.difficulty, weight: 5 },
    { key: 'location', label: 'Location', met: !!(route.location_string && route.location_string.length > 2), weight: 5 },
    { key: 'subcategory', label: 'Subcategory', met: !!route.subcategory, weight: 5 },
    { key: 'season', label: 'Season', met: !!route.season, weight: 3 },
    { key: 'surface', label: 'Surface type', met: !!route.surface_type, weight: 3 },
    { key: 'points', label: 'Start & end points', met: !!(route.start_point && route.end_point), weight: 4 },
  ];

  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const earnedWeight = checks.filter(c => c.met).reduce((s, c) => s + c.weight, 0);
  const score = Math.round((earnedWeight / totalWeight) * 100);
  const missing = checks.filter(c => !c.met).map(c => c.label);

  let status: 'draft' | 'ready' | 'premium' = 'draft';
  if (score >= 90) status = 'premium';
  else if (score >= 60) status = 'ready';

  return { score, missing, status };
}

// Legacy exports for backward compat
export const CITY_DURATION_OPTIONS = CATEGORY_FILTERS['City']?.durationOptions ?? DURATION_SHORT;
export const CITY_ROUTE_TYPE_OPTIONS = CATEGORY_FILTERS['City']?.roadTypeOptions ?? ['walking', 'bike', 'car'];
export const CITY_DIFFICULTY_OPTIONS = ['easy', 'moderate'] as const;
export const CITY_AUDIENCE_OPTIONS = CATEGORY_FILTERS['City']?.audienceOptions ?? [...AUDIENCE_OPTIONS];
export const CITY_BUDGET_OPTIONS = CATEGORY_FILTERS['City']?.budgetOptions ?? [...BUDGET_OPTIONS];
