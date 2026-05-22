import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import SEO, { buildProductSchema, buildReviewSchema, buildBreadcrumbSchema } from '@/components/SEO';
import { trackEvent } from '@/lib/analytics';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { useQuery } from '@tanstack/react-query';
import Logo from '@/components/Logo';
import Footer from '@/components/Footer';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import SEO, { buildProductSchema, buildReviewSchema, buildBreadcrumbSchema } from '@/components/SEO';
import { trackEvent } from '@/lib/analytics';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { useQuery } from '@tanstack/react-query';
import Logo from '@/components/Logo';
import Footer from '@/components/Footer';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRouteById, useRouteStats, useRouteImages } from '@/hooks/use-routes';
import { useHasPurchased } from '@/hooks/use-purchases';
import { useRoutePdfs } from '@/hooks/use-route-pdfs';
import { getLanguageFlag, getLanguageName } from '@/lib/languages';
import { useRouteTranslation, getUserLanguage } from '@/hooks/use-translations';
import TranslationManager from '@/components/TranslationManager';
import BuyerConsentModal from '@/components/BuyerConsentModal';
import { TokenPurchaseModal } from '@/components/ui/TokenPurchaseModal';
import { supabase } from '@/integrations/supabase/client';
import { openSignedPdf } from '@/lib/open-signed-pdf';
import { useConvertedPrice, detectUserCurrency, getCurrencySymbol, formatPrice } from '@/hooks/use-currency';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ArrowLeft, MapPin, User, Download, ShoppingCart, Map as MapIcon,
  FileText, Star, Send, MessageSquare, Lock, Shield, Pencil,
  Clock, Mountain, Ruler, Gauge, TreePine, Sun, RotateCcw, Loader2,
  ChevronLeft, ChevronRight, AlertTriangle, Backpack, CalendarCheck, ShieldAlert,
  Bot, Users, Compass, Footprints, CheckCircle2, Award, TrendingUp, MessageCircle,
  Instagram, Youtube, Globe, Expand, Box,
} from 'lucide-react';
import { toast } from 'sonner';


const RouteTerrain3D = lazy(() => import('@/components/RouteTerrain3D'));
const RouteGlobe3D = lazy(() => import('@/components/RouteGlobe3D'));
const RouteExplorerGlobe = lazy(() => import('@/components/RouteExplorerGlobe'));

function useCreatorReliability(userId: string | undefined) {
  return useQuery({
    queryKey: ['creator-reliability', userId],
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      // Fetch creator profile (total_sales) + all their routes for aggregate rating
      const [profileRes, routesRes] = await Promise.all([
        supabase.from('creator_profiles').select('total_sales, created_at').eq('user_id', userId!).maybeSingle(),
        supabase.from('routes').select('id').eq('user_id', userId!).eq('status', 'published'),
      ]);

      const totalSales = profileRes.data?.total_sales ?? 0;
      const creatorSince = profileRes.data?.created_at;
      const routeIds = (routesRes.data ?? []).map(r => r.id);

      let avgRating = 0;
      let totalRatings = 0;
      if (routeIds.length > 0) {
        const { data: ratings } = await supabase
          .from('ratings')
          .select('score')
          .in('route_id', routeIds);
        if (ratings && ratings.length > 0) {
          totalRatings = ratings.length;
          avgRating = Math.round((ratings.reduce((s, r) => s + r.score, 0) / totalRatings) * 10) / 10;
        }
      }

      return {
        totalSales,
        totalRoutes: routeIds.length,
        avgRating,
        totalRatings,
        creatorSince,
      };
    },
  });
}

function StarRating({ rating, onRate, interactive = false, size = 'md' }: {
  rating: number; onRate?: (score: number) => void; interactive?: boolean; size?: 'sm' | 'md' | 'lg';
}) {
  const [hover, setHover] = useState(0);
  const sizeClass = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-7 h-7' : 'w-5 h-5';
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} type="button" disabled={!interactive} onClick={() => onRate?.(star)}
          onMouseEnter={() => interactive && setHover(star)} onMouseLeave={() => interactive && setHover(0)}
          className={interactive ? 'cursor-pointer transition-transform hover:scale-110' : 'cursor-default'}>
          <Star className={`${sizeClass} ${star <= (hover || rating) ? 'fill-amber-400 text-amber-400' : 'fill-muted text-muted'} transition-colors`} />
        </button>
      ))}
    </div>
  );
}

function MetricPill({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 bg-muted rounded-lg px-2.5 sm:px-3 py-2 sm:py-2.5 min-h-[44px]">
      <Icon className="w-4 h-4 text-primary shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none">{label}</p>
        <p className="text-xs sm:text-sm font-semibold capitalize truncate">{value}</p>
      </div>
    </div>
  );
}

function difficultyColor(d: string | null) {
  if (!d) return 'bg-muted text-muted-foreground';
  switch (d.toLowerCase()) {
    case 'easy': return 'bg-green-100 text-green-700';
    case 'moderate': return 'bg-amber-100 text-amber-700';
    case 'hard': return 'bg-orange-100 text-orange-700';
    case 'expert': return 'bg-red-100 text-red-700';
    default: return 'bg-muted text-muted-foreground';
  }
}

function PriceDisplay({ price, currency }: { price: number; currency: string }) {
  const userCurrency = detectUserCurrency();
  const { data: converted } = useConvertedPrice(price, currency, userCurrency);
  const showConverted = currency !== userCurrency && converted;

  return (
    <div className="mb-4">
      <span className="text-3xl font-bold">{formatPrice(price, currency)}</span>
      {showConverted && (
        <p className="text-sm text-muted-foreground mt-0.5">
          ≈ {formatPrice(converted.converted, userCurrency)}
        </p>
      )}
    </div>
  );
}

export default function RouteDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const [myRating, setMyRating] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [buying, setBuying] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [comments, setComments] = useState<{ id: number; content: string; created_at: string; user_id: string; display_name?: string }[]>([]);
  const [consentOpen, setConsentOpen] = useState(false);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [globeOpen, setGlobeOpen] = useState(false);
  const [spatialView, setSpatialView] = useState<'terrain' | 'globe'>('terrain');

  const routeId = id ? parseInt(id) : undefined;
  const { data: route, isLoading } = useRouteById(routeId);
  const { data: statsMap = {} } = useRouteStats(routeId ? [routeId] : []);
  const stats = routeId ? statsMap[routeId] : null;
  const { data: purchased = false } = useHasPurchased(user?.id, routeId);
  const { data: routeImages = [] } = useRouteImages(routeId);
  const { data: routePdfs = [] } = useRoutePdfs(routeId);
  const [fullDescription, setFullDescription] = useState<string | null>(null);
  const userLang = getUserLanguage();
  const { data: translation } = useRouteTranslation(routeId, userLang);
  const { data: creatorReliability } = useCreatorReliability(route?.user_id);

  // Use translated content if available, fallback to original
  const displayTitle = translation?.title || route?.title || '';
  const displayDescription = translation?.description || route?.description || '';

  // Gallery state
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const allImages = routeImages.length > 0 ? routeImages : (route?.cover_image_key ? [route.cover_image_key] : []);
  const activeImage = allImages[activeImageIndex] ?? route?.cover_image_key;

  // Track route view
  useEffect(() => {
    if (routeId && route) {
      trackEvent({ event: 'route_view', routeId, userId: user?.id });
    }
  }, [routeId, route?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadComments = useCallback(async () => {
    if (!routeId) return;
    const { data } = await supabase
      .from('comments')
      .select('id, content, created_at, user_id')
      .eq('route_id', routeId)
      .order('created_at', { ascending: false });
    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', userIds);
      const profileMap = Object.fromEntries((profiles || []).map(p => [p.user_id, p.display_name]));
      setComments(data.map(c => ({ ...c, display_name: profileMap[c.user_id] || 'User' })));
    } else {
      setComments([]);
    }
  }, [routeId]);

  // Load user's existing rating
  useEffect(() => {
    if (!user || !routeId) return;
    supabase
      .from('ratings')
      .select('score')
      .eq('route_id', routeId)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setMyRating(data.score);
      });
  }, [user, routeId]);

  useEffect(() => { loadComments(); }, [loadComments]);

  // Load protected full description if user is owner or has purchased
  useEffect(() => {
    const canRead = !!user && !!routeId && (purchased || (route && route.user_id === user.id));
    if (!canRead) { setFullDescription(null); return; }
    supabase
      .from('route_private_details')
      .select('full_description')
      .eq('route_id', routeId!)
      .maybeSingle()
      .then(({ data }) => setFullDescription(data?.full_description ?? ''));
  }, [user, routeId, purchased, route?.user_id, route?.id]);

  const handleRate = async (score: number) => {
    if (!user) { login(); return; }
    if (!routeId) return;
    setSubmittingRating(true);
    setMyRating(score);
    try {
      // Check if rating exists
      const { data: existing } = await supabase
        .from('ratings')
        .select('id')
        .eq('route_id', routeId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (existing) {
        const { error } = await supabase.from('ratings').update({ score }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ratings').insert({ route_id: routeId, user_id: user.id, score });
        if (error) throw error;
      }
      toast.success(t('route_detail.rating_saved'));
    } catch (err: any) {
      toast.error(err.message || t('route_detail.rating_error'));
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleComment = async () => {
    if (!user) { login(); return; }
    if (!routeId || !newComment.trim()) return;
    setSubmittingComment(true);
    try {
      const { error } = await supabase.from('comments').insert({
        route_id: routeId,
        user_id: user.id,
        content: newComment.trim(),
      });
      if (error) throw error;
      setNewComment('');
      toast.success(t('route_detail.comment_added'));
      loadComments();
    } catch (err: any) {
      toast.error(err.message || t('route_detail.comment_error'));
    } finally {
      setSubmittingComment(false);
    }
  };

  const isOwner = user?.id === route?.user_id;
  const hasTrackPreview = !!route?.preview_track && route.preview_track.length >= 2;
  const hasMapLocation = !!route && (hasTrackPreview || Boolean(route.latitude && route.longitude));
  const hasTerrainPreview = hasTrackPreview;
  const terrainSummary = hasTerrainPreview
    ? purchased || isOwner
      ? 'Focused 3D terrain preview of the route corridor and line.'
      : 'Focused 3D preview of the route corridor. Full GPX remains available after purchase.'
    : '3D terrain preview becomes available once the route has a track.';
  const globeSummary = hasTrackPreview
    ? purchased || isOwner
      ? 'Interactive 3D route view with the current route line.'
      : 'Interactive 3D preview of the route area. Full GPX remains available after purchase.'
    : 'Interactive 3D view of the route area and nearby context.';

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!route) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold text-muted-foreground">{t('route_detail.not_found')}</h2>
        <Button variant="outline" onClick={() => navigate('/')}><ArrowLeft className="w-4 h-4 mr-2" /> {t('route_detail.back_to_home')}</Button>
      </div>
    );
  }

  const complianceGateEnabled = isFeatureEnabled('ff_compliance_gate', user?.id);
  const safetyPanelEnabled = isFeatureEnabled('ff_route_safety_panel', user?.id);

  const handleBuyClick = () => {
    if (!user) { login(); return; }
    if (complianceGateEnabled) {
      trackEvent({ event: 'consent_gate_opened', routeId: routeId!, userId: user.id });
      setConsentOpen(true);
    } else {
      // Skip consent gate — go straight to checkout
      handleConsentConfirm('1.0');
    }
  };

  const handleConsentConfirm = async (consentVersion: string) => {
    if (!user || !route) return;
    trackEvent({ event: 'consent_gate_accepted', routeId: route.id, userId: user.id });
    trackEvent({ event: 'checkout_started', routeId: route.id, userId: user.id });
    setBuying(true);
    try {
      // Store consent audit log
      const { error: consentError } = await supabase.from('purchase_consents').insert({
        user_id: user.id,
        route_id: route.id,
        consent_version: consentVersion,
        ip_hash: null, // IP hashing should be done server-side
        user_agent: navigator.userAgent,
        declarations: {
          risk_acknowledged: true,
          conditions_understood: true,
          weather_check: true,
          skills_confirmed: true,
          terms_accepted: true,
        },
      });
      if (consentError) throw consentError;

      // Open the token purchase wizard
      setPurchaseModalOpen(true);
    } catch (err: any) {
      toast.error(err.message || t('route_detail.payment_error'));
    } finally {
      setBuying(false);
      setConsentOpen(false);
    }
  };

  // Build "who is this for" items based on route data
  const whoIsThisFor = (() => {
    const items: { icon: React.ElementType; text: string }[] = [];
    const d = route.difficulty?.toLowerCase();
    if (d === 'easy') items.push({ icon: Users, text: t('route_detail.who_beginners', 'Beginners and families') });
    if (d === 'moderate') items.push({ icon: Footprints, text: t('route_detail.who_intermediate', 'Intermediate adventurers') });
    if (d === 'hard' || d === 'expert') items.push({ icon: Mountain, text: t('route_detail.who_experienced', 'Experienced outdoor enthusiasts') });
    if (route.distance_km && route.distance_km > 30) items.push({ icon: Ruler, text: t('route_detail.who_endurance', 'Endurance athletes') });
    if (route.surface_type?.toLowerCase().includes('gravel') || route.surface_type?.toLowerCase().includes('offroad'))
      items.push({ icon: Compass, text: t('route_detail.who_offroad', 'Off-road & adventure seekers') });
    if (items.length === 0) items.push({ icon: Users, text: t('route_detail.who_everyone', 'All skill levels welcome') });
    return items;
  })();

  const renderRouteGlobe = (heightClass: string, badgeLabel: string) => {
    if (!hasMapLocation) return null;

    if (hasTrackPreview) {
      return (
        <Suspense fallback={<div className={`w-full ${heightClass} bg-muted animate-pulse`} />}>
          <RouteGlobe3D track={route.preview_track!} className={heightClass} />
        </Suspense>
      );
    }

    return (
      <Suspense fallback={<div className={`w-full ${heightClass} bg-muted animate-pulse`} />}>
        <RouteExplorerGlobe
          routes={[route]}
          selectedRouteId={route.id}
          badgeLabel={badgeLabel}
          className={heightClass}
        />
      </Suspense>
    );
  };

  const renderRouteTerrain = (heightClass: string) => {
    if (!hasTerrainPreview) return null;

    return (
      <Suspense fallback={<div className={`w-full ${heightClass} bg-muted animate-pulse`} />}>
        <RouteTerrain3D track={route.preview_track!} className={heightClass} />
      </Suspense>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={displayTitle}
        description={displayDescription?.slice(0, 155)}
        image={route.cover_image_key || undefined}
        url={`/route/${route.id}`}
        type="product"
        hreflang={[
          { lang: 'pl', href: `/route/${route.id}?lang=pl` },
          { lang: 'en', href: `/route/${route.id}?lang=en` },
          { lang: 'de', href: `/route/${route.id}?lang=de` },
          { lang: 'fr', href: `/route/${route.id}?lang=fr` },
          { lang: 'es', href: `/route/${route.id}?lang=es` },
          { lang: 'it', href: `/route/${route.id}?lang=it` },
          { lang: 'nl', href: `/route/${route.id}?lang=nl` },
          { lang: 'da', href: `/route/${route.id}?lang=da` },
        ]}
        structuredData={[
          {
            ...buildProductSchema({
              id: route.id,
              title: displayTitle,
              description: displayDescription,
              price: route.price,
              currency: (route as any).currency || 'USD',
              cover_image_key: route.cover_image_key,
              creator_name: route.creator_name,
            }),
            ...(stats?.total_ratings ? { aggregateRating: buildReviewSchema(stats) } : {}),
          },
          buildBreadcrumbSchema([
            { name: 'Home', url: '/' },
            { name: route.category_name, url: `/?category=${route.category_id}` },
            { name: displayTitle, url: `/route/${route.id}` },
          ]),
        ]}
      />
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mr-2 sm:mr-4 min-h-[44px] min-w-[44px]"><ArrowLeft className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">{t('common.back')}</span></Button>
            <Logo size="sm" />
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            {user && <Button variant="ghost" size="sm" onClick={() => navigate('/my-routes')} className="text-muted-foreground min-h-[44px]">{t('nav.my_purchases')}</Button>}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Mobile purchase CTA — above the fold */}
        <div className="lg:hidden mb-4">
          <div className="bg-card rounded-xl shadow-token-sm p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xl font-bold">{formatPrice(route.price, (route as any).currency || 'USD')}</p>
              {route.difficulty && <Badge className={`${difficultyColor(route.difficulty)} capitalize mt-1`}>{route.difficulty}</Badge>}
            </div>
            {purchased || isOwner ? (
              <Button size="sm" onClick={() => navigate('/my-routes')} className="min-h-[44px]">
                <Download className="w-4 h-4 mr-1" /> {t('route_detail.download_gpx')}
              </Button>
            ) : (
              <Button className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold min-h-[44px] px-5" onClick={handleBuyClick} disabled={buying}>
                {buying ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-1" />}
                {buying ? t('route_detail.redirecting') : t('route_detail.buy_route')}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8">
          {/* ════════ Left Column ════════ */}
          <div className="lg:col-span-2 space-y-8">

            {/* ── Hero Gallery ── */}
            <div className="rounded-xl overflow-hidden shadow-token-sm relative group">
              <img src={activeImage} alt={route.title} className="w-full aspect-[16/10] object-cover" />
              {allImages.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label={t('route_detail.prev_photo', 'Previous photo')}
                    onClick={() => setActiveImageIndex((prev) => (prev - 1 + allImages.length) % allImages.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-background/80 hover:bg-background shadow-token-md rounded-full flex items-center justify-center transition-colors z-10">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    aria-label={t('route_detail.next_photo', 'Next photo')}
                    onClick={() => setActiveImageIndex((prev) => (prev + 1) % allImages.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-background/80 hover:bg-background shadow-token-md rounded-full flex items-center justify-center transition-colors z-10">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                    {allImages.map((_, i) => (
                      <button key={i} type="button" aria-label={`Photo ${i + 1}`} onClick={() => setActiveImageIndex(i)}
                        className={`w-2 h-2 rounded-full transition-colors ${i === activeImageIndex ? 'bg-background' : 'bg-background/60 hover:bg-background/80'}`} />
                    ))}
                  </div>
                </>
              )}
              {!purchased && !isOwner && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-foreground/70 to-transparent px-4 py-3">
                  <div className="flex items-center gap-2 text-background/90 text-xs"><Lock className="w-3.5 h-3.5" /><span>{t('route_detail.preview_only')}</span></div>
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {allImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 -mt-4">
                {allImages.map((src, i) => (
                  <button key={i} onClick={() => setActiveImageIndex(i)}
                    className={`shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-colors ${i === activeImageIndex ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                    <img src={src} alt={t('route_detail.photo', { index: i + 1 })} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* ── Location & Route Map (merged) ── */}
            {hasMapLocation && (
              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                    <MapIcon className="w-4 h-4" /> {t('route_detail.location', 'Location')}
                  </h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSpatialView(hasTerrainPreview ? 'terrain' : 'globe');
                      setGlobeOpen(true);
                    }}
                    className="min-h-[36px] gap-2"
                  >
                    <Expand className="h-3.5 w-3.5" />
                    Open 3D
                  </Button>
                </div>
                <div className="overflow-hidden rounded-xl border border-border bg-card shadow-token-sm">
                  <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Box className="h-4 w-4 text-primary" />
                        Route Terrain 3D
                      </div>
                      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                        {hasTerrainPreview ? terrainSummary : globeSummary}
                      </p>
                    </div>
                    <div className="hidden shrink-0 items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground md:inline-flex">
                      <Box className="h-3.5 w-3.5" /> Preview
                    </div>
                  </div>
                  <div className="relative">
                    {hasTerrainPreview
                      ? renderRouteTerrain('h-[250px] sm:h-[300px]')
                      : renderRouteGlobe('h-[240px] sm:h-[280px]', 'Preview Globe')}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/55 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 px-4 py-4">
                      <p className="max-w-md text-xs text-white/90 sm:text-sm">
                        {hasTerrainPreview
                          ? 'Inspect the route corridor in a local 3D view, then switch to the globe for wider context.'
                          : 'Explore the route in a larger interactive globe view.'}
                      </p>
                      <Button
                        onClick={() => {
                          setSpatialView(hasTerrainPreview ? 'terrain' : 'globe');
                          setGlobeOpen(true);
                        }}
                        className="shrink-0 gap-2 bg-background/95 text-foreground hover:bg-background"
                      >
                        <Expand className="h-4 w-4" />
                        Open 3D
                      </Button>
                    </div>
                  </div>
                </div>
                {hasTrackPreview && !purchased && !isOwner && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                    <Lock className="w-3 h-3" /> {t('route_detail.map_simplified', 'Simplified preview — full GPX available after purchase')}
                  </p>
                )}
              </section>
            )}

            {hasMapLocation && (
              <Dialog open={globeOpen} onOpenChange={setGlobeOpen}>
                <DialogContent className="w-[calc(100vw-1rem)] max-w-6xl overflow-hidden border-0 p-0 sm:w-[calc(100vw-3rem)]">
                  <DialogHeader className="border-b border-border px-6 py-5 text-left">
                    <DialogTitle className="flex items-center gap-2 text-lg">
                      {spatialView === 'terrain' ? <Box className="h-5 w-5 text-primary" /> : <Globe className="h-5 w-5 text-primary" />}
                      {displayTitle}
                    </DialogTitle>
                    <DialogDescription className="pr-8">
                      {route.location_string ? `${route.location_string} · ` : ''}
                      {spatialView === 'terrain'
                        ? 'Focused 3D terrain view for route shape, turns, and nearby relief.'
                        : 'Interactive globe view for wider route context.'}
                    </DialogDescription>
                  </DialogHeader>
                  {hasTerrainPreview && (
                    <div className="flex items-center gap-2 border-b border-border px-6 py-3">
                      <Button
                        type="button"
                        size="sm"
                        variant={spatialView === 'terrain' ? 'default' : 'outline'}
                        className="gap-2"
                        onClick={() => setSpatialView('terrain')}
                      >
                        <Box className="h-4 w-4" />
                        Terrain
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={spatialView === 'globe' ? 'default' : 'outline'}
                        className="gap-2"
                        onClick={() => setSpatialView('globe')}
                      >
                        <Globe className="h-4 w-4" />
                        Globe
                      </Button>
                    </div>
                  )}
                  <div className="bg-slate-950 p-3 sm:p-4">
                    {spatialView === 'terrain' && hasTerrainPreview
                      ? renderRouteTerrain('h-[72dvh] min-h-[460px] max-h-[860px]')
                      : renderRouteGlobe('h-[70dvh] min-h-[420px] max-h-[820px]', 'Route Globe')}
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {/* ── Key Stats ── */}
            <section>
              <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground mb-3">{t('route_detail.key_stats', 'Key Stats')}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {route.distance_km != null && route.distance_km > 0 && <MetricPill icon={Ruler} label={t('route_detail.distance')} value={`${route.distance_km} km`} />}
                {route.elevation_gain_m != null && route.elevation_gain_m > 0 && <MetricPill icon={Mountain} label={t('route_detail.elevation')} value={`${route.elevation_gain_m} m`} />}
                {route.estimated_time_h != null && route.estimated_time_h > 0 && <MetricPill icon={Clock} label={t('route_detail.est_time')} value={`${route.estimated_time_h} h`} />}
                {route.difficulty && <MetricPill icon={Gauge} label={t('route_detail.difficulty')} value={route.difficulty} />}
                {route.surface_type && <MetricPill icon={TreePine} label={t('route_detail.surface')} value={route.surface_type} />}
                {route.season && <MetricPill icon={Sun} label={t('route_detail.season')} value={route.season} />}
                {route.loop_type && <MetricPill icon={RotateCcw} label={t('route_detail.type')} value={route.loop_type.replace(/-/g, ' ')} />}
              </div>
            </section>

            {/* ── Safety & Risk Panel — above the fold ── */}
            {safetyPanelEnabled && (route as any).risk_level && (route as any).risk_level !== 'unknown' && (
              <section className="bg-card rounded-xl p-5 shadow-token-sm border-l-4 border-l-amber-400">
                <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-500" /> {t('route_detail.safety_title', 'Safety & Risk')}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
                  <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2.5">
                    <AlertTriangle className={`w-4 h-4 shrink-0 ${(route as any).risk_level === 'high' ? 'text-destructive' : (route as any).risk_level === 'medium' ? 'text-warning' : 'text-success'}`} />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none">{t('route_detail.risk_level', 'Risk')}</p>
                      <p className="text-sm font-semibold capitalize">{(route as any).risk_level}</p>
                    </div>
                  </div>
                  {(route as any).data_confidence && (route as any).data_confidence !== 'unverified' && (
                    <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2.5">
                      <Shield className="w-4 h-4 text-primary shrink-0" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none">{t('route_detail.data_confidence', 'Confidence')}</p>
                        <p className="text-sm font-semibold capitalize">{(route as any).data_confidence}</p>
                      </div>
                    </div>
                  )}
                  {(route as any).last_verified_at && (
                    <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2.5">
                      <CalendarCheck className="w-4 h-4 text-primary shrink-0" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none">{t('route_detail.verified_at', 'Verified')}</p>
                        <p className="text-sm font-semibold">{new Date((route as any).last_verified_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  )}
                </div>
                {Array.isArray((route as any).known_hazards) && (route as any).known_hazards.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {t('route_detail.known_hazards', 'Known hazards')}
                    </p>
                    <ul className="space-y-1">
                      {((route as any).known_hazards as string[]).map((h, i) => (
                        <li key={i} className="text-sm text-foreground flex items-start gap-2">
                          <span className="text-warning mt-0.5">•</span> {h}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray((route as any).required_equipment) && (route as any).required_equipment.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Backpack className="w-3 h-3" /> {t('route_detail.required_equipment', 'Required equipment')}
                    </p>
                    <ul className="space-y-1">
                      {((route as any).required_equipment as string[]).map((e, i) => (
                        <li key={i} className="text-sm text-foreground flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" /> {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}


            {/* ── About ── */}
            <section className="bg-card rounded-xl p-6 shadow-token-sm">
              <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground mb-3">{t('route_detail.about')}</h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{displayDescription}</p>
              {translation?.is_auto_translated && (
                <p className="text-[10px] text-muted-foreground mt-2 italic">{t('route_detail.auto_translated')}</p>
              )}
              {fullDescription !== null && fullDescription.trim().length > 0 ? (
                <div className="mt-6 pt-6 border-t border-border">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Pełny opis trasy
                  </h3>
                  <p className="text-foreground leading-relaxed whitespace-pre-line">{fullDescription}</p>
                </div>
              ) : !purchased && !isOwner ? (
                <div className="mt-6 pt-6 border-t border-border bg-muted/40 rounded-lg p-4 flex items-start gap-3">
                  <Lock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    Pełny, szczegółowy opis trasy odblokujesz po zakupie. Znajdziesz go również w pliku PDF.
                  </p>
                </div>
              ) : null}
              {(route.start_point || route.end_point) && (
                <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-4 text-sm">
                  {route.start_point && <div><span className="text-muted-foreground">{t('route_detail.start')}:</span> <span className="font-medium">{route.start_point}</span></div>}
                  {route.end_point && <div><span className="text-muted-foreground">{t('route_detail.end')}:</span> <span className="font-medium">{route.end_point}</span></div>}
                </div>
              )}
            </section>

            {/* ── Who is this route for ── */}
            <section className="bg-card rounded-xl p-6 shadow-token-sm">
              <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground mb-4">{t('route_detail.who_title', 'Who is this for')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {whoIsThisFor.map(({ icon: I, text }, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-muted/60 rounded-lg px-4 py-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <I className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <span className="text-sm font-medium text-foreground">{text}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* ── What You Get — Icon Cards ── */}
            <section className="bg-card rounded-xl p-6 shadow-token-sm">
              <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground mb-4">{t('route_detail.what_you_get')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { icon: MapIcon, title: t('route_detail.gpx_file'), desc: t('route_detail.gpx_desc'), accent: 'bg-primary/10 text-primary' },
                  { icon: FileText, title: t('route_detail.pdf_guide'), desc: t('route_detail.pdf_desc'), accent: 'bg-accent/10 text-accent' },
                  { icon: Download, title: t('route_detail.unlimited_downloads'), desc: t('route_detail.unlimited_desc'), accent: 'bg-success/10 text-success' },
                ].map(({ icon: I, title, desc, accent }) => (
                  <div key={title} className="bg-muted/40 border border-border/60 rounded-xl p-4 text-center flex flex-col items-center gap-2.5">
                    <div className={`w-12 h-12 rounded-xl ${accent} flex items-center justify-center`}>
                      <I className="w-5.5 h-5.5" />
                    </div>
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">{desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ── AI Disclosure ── */}
            {(route as any).ai_assisted && (
              <section className="bg-card rounded-xl p-5 shadow-token-sm border-l-4 border-l-violet-400">
                <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
                  <Bot className="w-4 h-4 text-violet-500" /> AI Disclosure
                </h2>
                <p className="text-sm text-muted-foreground mb-3">{t('route_detail.ai_note', 'This route was created with AI assistance.')}</p>
                {(route as any).ai_assisted_scope && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {((route as any).ai_assisted_scope as string).split(',').map((scope: string) => {
                      const labels: Record<string, string> = { description: 'Description', translation: 'Translation', route_analysis: 'Route Analysis', media: 'Media', recommendations: 'Recommendations' };
                      return <Badge key={scope} variant="outline" className="text-xs">{labels[scope] || scope}</Badge>;
                    })}
                  </div>
                )}
                {(route as any).ai_assisted_note && (
                  <p className="text-sm text-muted-foreground italic">{(route as any).ai_assisted_note}</p>
                )}
              </section>
            )}

            {/* ── Translation Manager (owner only) ── */}
            {isOwner && routeId && (
              <TranslationManager routeId={routeId} originalTitle={route.title} originalDescription={route.description} />
            )}

            {/* ── Reviews ── */}
            <section className="bg-card rounded-xl p-6 shadow-token-sm">
              <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> {t('route_detail.reviews')}
              </h2>
              {stats && stats.total_ratings > 0 && (
                <div className="flex items-center gap-3 mb-4">
                  <StarRating rating={Math.round(stats.average_rating)} />
                  <span className="text-sm font-medium">{stats.average_rating}</span>
                  <span className="text-xs text-muted-foreground">({stats.total_ratings} ratings)</span>
                </div>
              )}
              <div className="space-y-3 border-t border-border pt-4">
                <div className="flex items-center gap-2">
                  <StarRating rating={myRating} onRate={handleRate} interactive size="md" />
                  <span className="text-xs text-muted-foreground">{submittingRating ? t('route_detail.saving_rating') : myRating > 0 ? t('route_detail.your_rating') : t('route_detail.rate_this')}</span>
                </div>
                <div className="flex gap-2">
                  <Textarea placeholder={t('route_detail.comment_placeholder')} value={newComment} onChange={(e) => setNewComment(e.target.value)} rows={2} className="text-sm" />
                  <Button size="sm" className="self-end" disabled={!newComment.trim() || submittingComment} onClick={handleComment}>
                    {submittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
                {comments.length > 0 && (
                  <div className="space-y-3 mt-4">
                    {comments.map((c) => (
                      <div key={c.id} className="bg-muted rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium">{c.display_name}</span>
                          <span className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm text-foreground">{c.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* ════════ Right Column — Sticky Purchase Sidebar ════════ */}
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-24 space-y-4">
              <div className="bg-card rounded-xl shadow-token-md overflow-hidden">
                {/* Title block */}
                <div className="p-5 pb-0">
                  <h1 className="text-xl font-bold leading-snug mb-2">{displayTitle}</h1>
                  <div className="flex items-center gap-1 text-muted-foreground mb-3">
                    <MapPin className="w-3.5 h-3.5 shrink-0" /><span className="text-sm">{route.location_string}</span>
                  </div>
                  {/* Social media links hidden from buyers */}
                  {routePdfs.length > 0 && (
                    <div className="flex items-center gap-1.5 mb-3">
                      <span className="text-xs text-muted-foreground">PDF:</span>
                      {routePdfs.map(p => (
                        <span key={p.language_code} className="text-sm" title={getLanguageName(p.language_code)}>{getLanguageFlag(p.language_code)}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    {route.difficulty && <Badge className={`${difficultyColor(route.difficulty)} capitalize`}>{route.difficulty}</Badge>}
                    {(route as any).ai_assisted && (
                      <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100 dark:bg-violet-900/40 dark:text-violet-300"><Bot className="w-3 h-3 mr-1" /> AI</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="text-sm text-muted-foreground">{route.creator_name}</span>
                  </div>
                  {stats && stats.total_ratings > 0 && (
                    <div className="flex items-center gap-2 mb-3">
                      <StarRating rating={Math.round(stats.average_rating)} size="sm" />
                      <span className="text-sm font-medium">{stats.average_rating}</span>
                      <span className="text-xs text-muted-foreground">({stats.total_ratings})</span>
                    </div>
                  )}
                </div>

                {/* Price + CTA block */}
                <div className="bg-muted/30 border-t border-border p-5">
                  <PriceDisplay price={route.price} currency={(route as any).currency || 'USD'} />
                  {purchased || isOwner ? (
                    <div className="space-y-2">
                      <Button className="w-full" onClick={async () => {
                        if (!route.gpx_file_key) { toast.info('Brak pliku GPX'); return; }
                        const { data, error } = await supabase.storage.from('gpx-files').createSignedUrl(route.gpx_file_key, 300);
                        if (error || !data?.signedUrl) { toast.error('Nie udało się pobrać pliku'); return; }
                        window.open(data.signedUrl, '_blank');
                      }}>
                        <Download className="w-4 h-4 mr-2" /> {t('route_detail.download_gpx')}
                      </Button>
                      {routePdfs.length > 0 ? (
                        routePdfs.map(p => (
                          <Button key={p.language_code} variant="outline" className="w-full" onClick={async () => {
                            const { data, error } = await supabase.storage.from('pdf-guides').createSignedUrl(p.file_key, 300);
                            if (error || !data?.signedUrl) { toast.error('Nie udało się pobrać PDF'); return; }
                            try {
                              await openSignedPdf(data.signedUrl, `${displayTitle || 'trasa'}-${p.language_code}.pdf`);
                            } catch (err: any) {
                              toast.error(err?.message || 'Nie udało się otworzyć PDF');
                            }
                          }}>
                            <FileText className="w-4 h-4 mr-2" /> {getLanguageFlag(p.language_code)} PDF — {getLanguageName(p.language_code)}
                          </Button>
                        ))
                      ) : (
                        <Button variant="outline" className="w-full" disabled>
                          <FileText className="w-4 h-4 mr-2" /> {t('route_detail.download_pdf')} — brak
                        </Button>
                      )}
                      {isOwner && (
                        <Button variant="outline" className="w-full" onClick={() => navigate(`/edit-route/${route.id}`)}>
                          <Pencil className="w-4 h-4 mr-2" /> {t('route_detail.edit_route')}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Button className="w-full bg-accent hover:bg-accent/90 text-accent-foreground text-base h-12 font-semibold shadow-token-sm" onClick={handleBuyClick} disabled={buying}>
                      {buying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-2" />}
                      {buying ? t('route_detail.redirecting') : t('route_detail.buy_route')}
                    </Button>
                  )}
                  <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
                    <Shield className="w-4 h-4 shrink-0" /><span>{t('route_detail.secure_payment')}</span>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                    {t('legal.checkout_accept')}{' '}
                    <Link to="/legal/terms" className="underline hover:text-foreground">{t('legal.terms')}</Link>
                    {' '}{t('legal.and')}{' '}
                    <Link to="/legal/refunds" className="underline hover:text-foreground">{t('legal.refunds')}</Link>.
                  </p>
                </div>
              </div>

              {/* ── Trust & Safety Module ── */}
              {safetyPanelEnabled && <div className="bg-card rounded-xl shadow-token-sm border border-border overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-muted/30">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-primary" /> {t('route_detail.trust_safety', 'Trust & Safety')}
                  </h3>
                </div>
                <div className="p-4 space-y-3">
                  {/* Last verified */}
                  {(route as any).last_verified_at && (
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                        <CalendarCheck className="w-3.5 h-3.5 text-success" />
                      </div>
                      <div>
                        <p className="text-xs font-medium">{t('route_detail.last_verified', 'Last verified')}</p>
                        <p className="text-[11px] text-muted-foreground">{new Date((route as any).last_verified_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  )}

                  {/* Risk level badge */}
                  {(route as any).risk_level && (route as any).risk_level !== 'unknown' && (
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                        (route as any).risk_level === 'high' ? 'bg-destructive/10' : (route as any).risk_level === 'medium' ? 'bg-warning/10' : 'bg-success/10'
                      }`}>
                        <AlertTriangle className={`w-3.5 h-3.5 ${
                          (route as any).risk_level === 'high' ? 'text-destructive' : (route as any).risk_level === 'medium' ? 'text-warning' : 'text-success'
                        }`} />
                      </div>
                      <div>
                        <p className="text-xs font-medium">{t('route_detail.risk_level', 'Risk')}</p>
                        <Badge className={`text-[10px] px-1.5 py-0 ${
                          (route as any).risk_level === 'high' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                          (route as any).risk_level === 'medium' ? 'bg-warning/10 text-warning border-warning/20' :
                          'bg-success/10 text-success border-success/20'
                        }`} variant="outline">{(route as any).risk_level}</Badge>
                      </div>
                    </div>
                  )}

                  {/* Safety checklist quick view */}
                  {(Array.isArray((route as any).known_hazards) && (route as any).known_hazards.length > 0) || (Array.isArray((route as any).required_equipment) && (route as any).required_equipment.length > 0) ? (
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Backpack className="w-3.5 h-3.5 text-amber-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium mb-1">{t('route_detail.safety_checklist', 'Safety checklist')}</p>
                        <div className="flex flex-wrap gap-1">
                          {(Array.isArray((route as any).known_hazards) ? (route as any).known_hazards.slice(0, 2) : []).map((h: string, i: number) => (
                            <Badge key={`h-${i}`} variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700 dark:text-amber-400">{h}</Badge>
                          ))}
                          {(Array.isArray((route as any).required_equipment) ? (route as any).required_equipment.slice(0, 2) : []).map((e: string, i: number) => (
                            <Badge key={`e-${i}`} variant="outline" className="text-[10px] px-1.5 py-0">{e}</Badge>
                          ))}
                          {(((route as any).known_hazards?.length || 0) + ((route as any).required_equipment?.length || 0)) > 4 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{((route as any).known_hazards?.length || 0) + ((route as any).required_equipment?.length || 0) - 4}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* AI-assisted badge */}
                  {(route as any).ai_assisted && (
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
                        <Bot className="w-3.5 h-3.5 text-violet-500" />
                      </div>
                      <div>
                        <p className="text-xs font-medium">{t('route_detail.ai_assisted', 'AI-assisted')}</p>
                        <p className="text-[11px] text-muted-foreground">{t('route_detail.ai_assisted_desc', 'Content partially generated by AI')}</p>
                      </div>
                    </div>
                  )}

                  {/* Refund policy summary */}
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Shield className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs font-medium">{t('route_detail.refund_policy', 'Refund policy')}</p>
                      <p className="text-[11px] text-muted-foreground leading-snug">{t('route_detail.refund_summary', 'Refunds for damaged or incorrect files.')}</p>
                      <Link to="/legal/refunds" className="text-[11px] text-primary hover:underline font-medium">{t('route_detail.read_policy', 'Read full policy →')}</Link>
                    </div>
                  </div>
                </div>
              </div>}

              {/* ── Creator Reliability ── */}
              {creatorReliability && (
                <div className="bg-card rounded-xl shadow-token-sm border border-border overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-muted/30">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-primary" /> {t('route_detail.creator_reliability', 'Creator Reliability')}
                    </h3>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{route.creator_name}</p>
                        {creatorReliability.creatorSince && (
                          <p className="text-[11px] text-muted-foreground">
                            {t('route_detail.creator_since', 'Creator since')} {new Date(creatorReliability.creatorSince).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center bg-muted/50 rounded-lg py-2.5 px-1">
                        <div className="flex items-center justify-center gap-1 mb-0.5">
                          <TrendingUp className="w-3 h-3 text-primary" />
                        </div>
                        <p className="text-sm font-bold">{creatorReliability.totalSales}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight">{t('route_detail.sales', 'Sales')}</p>
                      </div>
                      <div className="text-center bg-muted/50 rounded-lg py-2.5 px-1">
                        <div className="flex items-center justify-center gap-1 mb-0.5">
                          <Star className="w-3 h-3 text-amber-500" />
                        </div>
                        <p className="text-sm font-bold">{creatorReliability.avgRating > 0 ? creatorReliability.avgRating : '—'}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight">{t('route_detail.avg_rating', 'Avg rating')}</p>
                      </div>
                      <div className="text-center bg-muted/50 rounded-lg py-2.5 px-1">
                        <div className="flex items-center justify-center gap-1 mb-0.5">
                          <MapIcon className="w-3 h-3 text-primary" />
                        </div>
                        <p className="text-sm font-bold">{creatorReliability.totalRoutes}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight">{t('route_detail.routes', 'Routes')}</p>
                      </div>
                    </div>
                    {creatorReliability.totalRatings > 0 && (
                      <p className="text-[10px] text-muted-foreground text-center mt-2">
                        {t('route_detail.based_on_ratings', 'Based on {{count}} ratings', { count: creatorReliability.totalRatings })}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
      {complianceGateEnabled && <BuyerConsentModal open={consentOpen} onOpenChange={setConsentOpen} onConfirm={handleConsentConfirm} loading={buying} />}
      <TokenPurchaseModal
        open={purchaseModalOpen}
        onOpenChange={setPurchaseModalOpen}
        routeId={route.id}
        routeTitle={displayTitle}
        creatorId={route.user_id}
        creatorName={route.creator_name}
        onSuccess={() => {
          setPurchaseModalOpen(false);
        }}
      />
    </div>
  );
}
