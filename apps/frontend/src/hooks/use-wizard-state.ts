import { useReducer, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { GpxParseResult } from '@/lib/gpx-parser';

export interface WizardPOI {
  id?: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  description: string;
  fun_fact: string;
  photo_keys: string[];
  sort_order: number;
}

export interface WizardTip {
  id?: string;
  category: string;
  content: string;
  sort_order: number;
}

export interface WizardRecommendation {
  id?: string;
  name: string;
  description: string;
  what_to_order: string;
  price_range: string;
  photo_key: string;
  sort_order: number;
}

export interface WizardState {
  // Meta
  routeId: number | null;
  currentStep: number;
  saving: boolean;
  lastSavedAt: string | null;

  // Step 1: GPX & Basics
  gpxFile: File | null;
  gpxParsed: GpxParseResult | null;
  gpxFileKey: string | null;
  title: string;
  categoryId: string;
  subCategory: string[];
  price: string;
  isFree: boolean;
  currency: string;
  locationString: string;
  latitude: number;
  longitude: number;

  // Step 2: Parameters
  distanceKm: string;
  elevationGain: string;
  estimatedTime: string;
  difficulty: string;
  season: string[];
  loopType: string;
  surfaceType: string;
  startPoint: string;
  endPoint: string;
  duration: string;
  routeType: string;
  budget: string;
  audience: string[];
  tags: string;

  // Step 3: Description & Photos
  description: string;
  fullDescription: string;
  imageFiles: File[];
  imagePreviews: string[];
  imageKeys: (string | null)[];
  instagramUrl: string;
  youtubeUrl: string;

  // Step 4: POI
  pois: WizardPOI[];

  // Step 5: Tips & Recommendations
  tips: WizardTip[];
  recommendations: WizardRecommendation[];

  // Step 6: Safety
  riskLevel: string;
  knownHazards: string;
  requiredEquipment: string;
  lastVerifiedAt: string;
  dataConfidence: string;
  aiAssisted: boolean;
  petsFriendly: boolean;

  // Step 7: Declarations
  declarations: boolean[];
}

type WizardAction =
  | { type: 'SET_FIELD'; field: string; value: any }
  | { type: 'SET_STEP'; step: number }
  | { type: 'SET_SAVING'; saving: boolean }
  | { type: 'SET_ROUTE_ID'; id: number }
  | { type: 'SET_LAST_SAVED'; at: string }
  | { type: 'ADD_POI'; poi: WizardPOI }
  | { type: 'UPDATE_POI'; index: number; poi: WizardPOI }
  | { type: 'REMOVE_POI'; index: number }
  | { type: 'SET_POIS'; pois: WizardPOI[] }
  | { type: 'ADD_TIP'; tip: WizardTip }
  | { type: 'UPDATE_TIP'; index: number; tip: WizardTip }
  | { type: 'REMOVE_TIP'; index: number }
  | { type: 'SET_TIPS'; tips: WizardTip[] }
  | { type: 'ADD_RECOMMENDATION'; rec: WizardRecommendation }
  | { type: 'UPDATE_RECOMMENDATION'; index: number; rec: WizardRecommendation }
  | { type: 'REMOVE_RECOMMENDATION'; index: number }
  | { type: 'SET_RECOMMENDATIONS'; recs: WizardRecommendation[] };

const initialState: WizardState = {
  routeId: null,
  currentStep: 1,
  saving: false,
  lastSavedAt: null,
  gpxFile: null,
  gpxParsed: null,
  gpxFileKey: null,
  title: '',
  categoryId: '',
  subCategory: [],
  price: '',
  isFree: false,
  currency: 'PLN',
  locationString: '',
  latitude: 0,
  longitude: 0,
  distanceKm: '',
  elevationGain: '',
  estimatedTime: '',
  difficulty: '',
  season: [],
  loopType: '',
  surfaceType: '',
  startPoint: '',
  endPoint: '',
  duration: '',
  routeType: '',
  budget: '',
  audience: [],
  tags: '',
  description: '',
  fullDescription: '',
  imageFiles: [],
  imagePreviews: [],
  imageKeys: [],
  instagramUrl: '',
  youtubeUrl: '',
  pois: [],
  tips: [],
  recommendations: [],
  riskLevel: '',
  knownHazards: '',
  requiredEquipment: '',
  lastVerifiedAt: '',
  dataConfidence: '',
  aiAssisted: false,
  petsFriendly: false,
  declarations: [false, false, false, false, false],
};

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SET_STEP':
      return { ...state, currentStep: action.step };
    case 'SET_SAVING':
      return { ...state, saving: action.saving };
    case 'SET_ROUTE_ID':
      return { ...state, routeId: action.id };
    case 'SET_LAST_SAVED':
      return { ...state, lastSavedAt: action.at };
    case 'ADD_POI':
      return { ...state, pois: [...state.pois, action.poi] };
    case 'UPDATE_POI':
      return { ...state, pois: state.pois.map((p, i) => i === action.index ? action.poi : p) };
    case 'REMOVE_POI':
      return { ...state, pois: state.pois.filter((_, i) => i !== action.index) };
    case 'SET_POIS':
      return { ...state, pois: action.pois };
    case 'ADD_TIP':
      return { ...state, tips: [...state.tips, action.tip] };
    case 'UPDATE_TIP':
      return { ...state, tips: state.tips.map((t, i) => i === action.index ? action.tip : t) };
    case 'REMOVE_TIP':
      return { ...state, tips: state.tips.filter((_, i) => i !== action.index) };
    case 'SET_TIPS':
      return { ...state, tips: action.tips };
    case 'ADD_RECOMMENDATION':
      return { ...state, recommendations: [...state.recommendations, action.rec] };
    case 'UPDATE_RECOMMENDATION':
      return { ...state, recommendations: state.recommendations.map((r, i) => i === action.index ? action.rec : r) };
    case 'REMOVE_RECOMMENDATION':
      return { ...state, recommendations: state.recommendations.filter((_, i) => i !== action.index) };
    case 'SET_RECOMMENDATIONS':
      return { ...state, recommendations: action.recs };
    default:
      return state;
  }
}

export function useWizardState(userId: string | undefined) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const lastSaveDataRef = useRef<string>('');
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval>>();

  const setField = useCallback((field: string, value: any) => {
    dispatch({ type: 'SET_FIELD', field, value });
  }, []);

  const setStep = useCallback((step: number) => {
    dispatch({ type: 'SET_STEP', step });
  }, []);

  const saveDraft = useCallback(async (silent = true) => {
    if (!userId) return;
    // Allow saving an empty draft. Use a placeholder title if the user hasn't entered one yet.
    const titleForDraft = state.title.trim() || 'Szkic trasy';

    // Persist GPX file to storage if a fresh one was attached this session.
    let gpxKey: string | null = state.gpxFileKey;
    if (state.gpxFile) {
      try {
        const path = `${userId}/${Date.now()}.gpx`;
        const { error: gpxErr } = await supabase.storage
          .from('gpx-files').upload(path, state.gpxFile, { upsert: false });
        if (gpxErr) throw gpxErr;
        gpxKey = path;
        dispatch({ type: 'SET_FIELD', field: 'gpxFileKey', value: path });
        dispatch({ type: 'SET_FIELD', field: 'gpxFile', value: null });
      } catch (err: any) {
        if (!silent) toast.error('Nie udało się przesłać pliku GPX');
      }
    }

    // Persist any newly added images (slots where imageKeys[i] is null).
    const nextImageKeys: (string | null)[] = [...state.imageKeys];
    while (nextImageKeys.length < state.imagePreviews.length) nextImageKeys.push(null);
    let fileCursor = 0;
    for (let i = 0; i < nextImageKeys.length; i++) {
      if (nextImageKeys[i] === null && state.imageFiles[fileCursor]) {
        const file = state.imageFiles[fileCursor];
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `${userId}/${Date.now()}-${i}.${ext}`;
        const { error: imgErr } = await supabase.storage
          .from('route-covers').upload(path, file, { upsert: false });
        if (!imgErr) nextImageKeys[i] = path;
        fileCursor++;
      }
    }
    const persistedKeys = nextImageKeys.filter((k): k is string => !!k);
    if (JSON.stringify(nextImageKeys) !== JSON.stringify(state.imageKeys)) {
      dispatch({ type: 'SET_FIELD', field: 'imageKeys', value: nextImageKeys });
      dispatch({ type: 'SET_FIELD', field: 'imageFiles', value: [] });
    }

    const routeData: Record<string, any> = {
      user_id: userId,
      title: titleForDraft,
      description: state.description.trim().slice(0, 3000),
      price: state.isFree ? 0 : (parseFloat(state.price) || 0),
      currency: state.currency,
      category_id: state.categoryId ? parseInt(state.categoryId) : null,
      location_string: state.locationString.trim(),
      latitude: state.latitude,
      longitude: state.longitude,
      distance_km: state.distanceKm ? parseFloat(state.distanceKm) : null,
      elevation_gain_m: state.elevationGain ? parseInt(state.elevationGain) : null,
      estimated_time_h: state.estimatedTime ? parseFloat(state.estimatedTime) : null,
      difficulty: state.difficulty || null,
      surface_type: state.surfaceType.trim() || null,
      season: state.season.length > 0 ? state.season.join(',') : null,
      loop_type: state.loopType || null,
      start_point: state.startPoint.trim() || null,
      end_point: state.endPoint.trim() || null,
      status: 'draft' as const,
      risk_level: state.riskLevel || 'unknown',
      known_hazards: state.knownHazards.trim() ? state.knownHazards.split('\n').map(s => s.trim()).filter(Boolean) : [],
      required_equipment: state.requiredEquipment.trim() ? state.requiredEquipment.split('\n').map(s => s.trim()).filter(Boolean) : [],
      last_verified_at: state.lastVerifiedAt || null,
      data_confidence: state.dataConfidence || 'unverified',
      ai_assisted: state.aiAssisted,
      pets_friendly: state.petsFriendly,
      subcategory: state.subCategory.length > 0 ? state.subCategory.join(', ') : null,
      duration: state.duration || null,
      route_type: state.routeType || null,
      budget: state.budget || null,
      audience: state.audience.length > 0 ? state.audience : [],
      tags: state.tags.trim() ? state.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
      instagram_url: state.instagramUrl.trim() || null,
      youtube_url: state.youtubeUrl.trim() || null,
    };

    if (gpxKey) routeData.gpx_file_key = gpxKey;
    if (persistedKeys.length > 0) routeData.cover_image_key = persistedKeys[0];

    // Only overwrite preview_track when a new GPX has been freshly parsed in this session.
    // Otherwise, keep whatever exists in DB (e.g. set by MCP or a previous session).
    if (state.gpxParsed) {
      routeData.preview_track = state.gpxParsed.trackPoints.filter((_, i, arr) => {
        const step = Math.max(1, Math.floor(arr.length / 25));
        return i % step === 0 || i === arr.length - 1;
      });
    }

    const dataHash = JSON.stringify({ ...routeData, _imgs: persistedKeys });
    if (dataHash === lastSaveDataRef.current) return;

    dispatch({ type: 'SET_SAVING', saving: true });
    try {
      let routeIdToUse = state.routeId;
      if (state.routeId) {
        const { error } = await supabase.from('routes').update(routeData as any).eq('id', state.routeId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('routes').insert(routeData as any).select('id').single();
        if (error) throw error;
        if (data) {
          dispatch({ type: 'SET_ROUTE_ID', id: data.id });
          routeIdToUse = data.id;
        }
      }

      // Persist current image order (replace gallery rows).
      if (routeIdToUse && persistedKeys.length > 0) {
        await supabase.from('route_images').delete().eq('route_id', routeIdToUse);
        await supabase.from('route_images').insert(
          persistedKeys.map((key, i) => ({ route_id: routeIdToUse!, image_key: key, sort_order: i }))
        );
      }

      // Persist full (post-purchase) description into the protected table.
      if (routeIdToUse) {
        await supabase.from('route_private_details').upsert(
          { route_id: routeIdToUse, full_description: state.fullDescription.slice(0, 30000) },
          { onConflict: 'route_id' }
        );
      }

      lastSaveDataRef.current = dataHash;
      dispatch({ type: 'SET_LAST_SAVED', at: new Date().toLocaleTimeString() });
      if (!silent) {
        toast.success('Szkic zapisany ✓', {
          description: 'Znajdziesz go w „Moje trasy" → zakładka Szkice. Możesz wrócić do edycji w dowolnym momencie.',
          duration: 5000,
        });
      }
    } catch (err: any) {
      if (!silent) toast.error(err.message || 'Nie udało się zapisać szkicu');
    } finally {
      dispatch({ type: 'SET_SAVING', saving: false });
    }
  }, [userId, state]);

  // Auto-save every 30s
  useEffect(() => {
    autoSaveTimerRef.current = setInterval(() => {
      saveDraft(true);
    }, 30000);
    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    };
  }, [saveDraft]);

  return { state, dispatch, setField, setStep, saveDraft };
}
