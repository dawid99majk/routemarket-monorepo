import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRef } from 'react';
import FavoriteButton from '@/components/FavoriteButton';
import { Badge } from '@/components/ui/badge';
import {
  MapPin, User, Star, ShoppingBag, Heart,
  Mountain, Ruler, Bot, Leaf, Sun, CloudSnow, TreeDeciduous, CalendarRange,
  ShieldAlert, Shield, ShieldCheck, Sparkles, Dog,
} from 'lucide-react';
import type { RouteWithDetails } from '@/hooks/use-routes';
import { useCardHighlightImpression } from '@/hooks/use-card-highlights';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface RouteCardProps {
  route: RouteWithDetails;
  stats?: { average_rating: number; total_ratings: number; total_purchases: number };
  isFavorited?: boolean;
  favCount?: number;
  pdfLangs?: string[];
  getLangFlag?: (code: string) => string;
  promotedCampaignId?: string;
  priority?: boolean;
}

function difficultyVariant(d: string | null) {
  if (!d) return { bg: 'bg-muted/80', text: 'text-muted-foreground', label: '' };
  switch (d.toLowerCase()) {
    case 'easy': return { bg: 'bg-emerald-500/90', text: 'text-white', label: 'Easy' };
    case 'moderate': return { bg: 'bg-amber-500/90', text: 'text-white', label: 'Moderate' };
    case 'hard': return { bg: 'bg-orange-600/90', text: 'text-white', label: 'Hard' };
    case 'expert': return { bg: 'bg-red-600/90', text: 'text-white', label: 'Expert' };
    default: return { bg: 'bg-muted/80', text: 'text-muted-foreground', label: d };
  }
}

function seasonIcon(s: string | null) {
  if (!s) return null;
  switch (s.toLowerCase()) {
    case 'spring': return <Leaf className="w-3 h-3" />;
    case 'summer': return <Sun className="w-3 h-3" />;
    case 'autumn': return <TreeDeciduous className="w-3 h-3" />;
    case 'winter': return <CloudSnow className="w-3 h-3" />;
    case 'year-round': return <CalendarRange className="w-3 h-3" />;
    default: return null;
  }
}

function riskIcon(level: string | null) {
  if (!level) return null;
  switch (level.toLowerCase()) {
    case 'low': return <ShieldCheck className="w-3 h-3 text-emerald-600" />;
    case 'medium': return <Shield className="w-3 h-3 text-amber-500" />;
    case 'high': return <ShieldAlert className="w-3 h-3 text-red-500" />;
    default: return null;
  }
}

function extractRegion(location: string): string {
  if (!location) return '';
  const parts = location.split(',').map((s) => s.trim());
  return parts.length >= 2 ? parts.slice(-2).join(', ') : parts[0];
}

export default function RouteCard({ route, stats, isFavorited = false, favCount = 0, pdfLangs, getLangFlag, promotedCampaignId, priority = false }: RouteCardProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const region = extractRegion(route.location_string);
  const diff = difficultyVariant(route.difficulty);
  const isPromoted = !!promotedCampaignId;

  useCardHighlightImpression(promotedCampaignId, user?.id);

  const cardRef = useRef<HTMLDivElement>(null);

  const handleClick = () => {
    if (isPromoted && promotedCampaignId) {
      supabase
        .from('campaign_events')
        .insert({ campaign_id: promotedCampaignId, event_type: 'click', user_id: user?.id ?? null, metadata: {} } as any)
        .then(() => {});
    }
    navigate(`/route/${route.id}`);
  };

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      className={`group bg-card rounded-2xl overflow-hidden h-full border border-border/40 shadow-token-md hover:shadow-token-xl hover:border-border/70 transition-all duration-[450ms] ease-out cursor-pointer hover:-translate-y-1 flex flex-col ${
        isPromoted ? 'ring-1 ring-accent/40 shadow-[0_0_12px_-3px_hsl(var(--accent)/0.2)]' : ''
      }`}
    >
      {/* Promoted badge */}
      {isPromoted && (
        <div className="flex items-center gap-1 px-3 py-1 bg-accent/10 text-accent text-[10px] font-semibold">
          <Sparkles className="w-3 h-3" />
          <span>Promoted</span>
        </div>
      )}
      {/* ── Image / Map area ── */}
      <div className="relative aspect-[4/3] sm:aspect-[16/10] overflow-hidden">
        <img
          src={route.cover_image_key ? `${route.cover_image_key}?width=400&quality=75` : route.cover_image_key}
          alt={route.title}
          width={304}
          height={190}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
        />
        {/* Bottom gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent pointer-events-none" />

        {/* Top-left badges row */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          {route.difficulty && (
            <span className={`${diff.bg} ${diff.text} text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md backdrop-blur-sm`}>
              {diff.label}
            </span>
          )}
          {(route as any).ai_assisted && (
            <span className="bg-violet-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-sm flex items-center gap-1">
              <Bot className="w-3 h-3" /> AI
            </span>
          )}
          {(route as any).pets_friendly && (
            <span className="bg-amber-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-sm flex items-center gap-1">
              <Dog className="w-3 h-3" /> Pets
            </span>
          )}
        </div>

        {/* Top-right favorite */}
        <div className="absolute top-2.5 right-2.5">
          <FavoriteButton routeId={route.id} isFavorited={isFavorited} size="md" className="bg-black/30 backdrop-blur-sm rounded-full p-1.5 hover:bg-black/50 text-white" />
        </div>

        {/* Bottom overlay content: title + location on image */}
        <div className="absolute bottom-0 left-0 right-0 px-3.5 pb-3 pt-6 pointer-events-none">
        <h3 className="font-display text-white text-[13px] sm:text-[15px] leading-snug line-clamp-2 drop-shadow-md" style={{ fontWeight: 400, letterSpacing: '-0.005em' }}>
            {route.title}
          </h3>
          <div className="flex items-center gap-1 mt-0.5 sm:mt-1 text-white/80">
            <MapPin className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
            <span className="text-[10px] sm:text-[11px] line-clamp-1">{region || route.location_string}</span>
          </div>
        </div>
      </div>

      {/* ── Content area ── */}
      <div className="p-2 sm:p-3.5 flex flex-col flex-1">
        {/* Metrics row */}
        <div className="flex items-center gap-3">
          {stats && stats.total_ratings > 0 ? (
            <div className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span className="text-xs font-semibold text-foreground">{stats.average_rating}</span>
              <span className="text-[10px] text-muted-foreground">({stats.total_ratings})</span>
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground italic">{t('index.no_ratings_yet')}</span>
          )}
          <div className="flex items-center gap-1 text-muted-foreground">
            <ShoppingBag className="w-3 h-3" />
            <span className="text-[10px]">{stats?.total_purchases ?? 0}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Heart className="w-3 h-3 fill-red-400 text-red-400" />
            <span className="text-[10px]">{favCount}</span>
          </div>
        </div>

        {/* Attribute badges */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
          {route.distance_km != null && route.distance_km > 0 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground flex items-center gap-0.5 mono tabular">
              <Ruler className="w-2.5 h-2.5" /> {route.distance_km} km
            </span>
          )}
          {route.elevation_gain_m != null && route.elevation_gain_m > 0 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground flex items-center gap-0.5 mono tabular">
              <Mountain className="w-2.5 h-2.5" /> {route.elevation_gain_m}m
            </span>
          )}
          {route.season && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground flex items-center gap-0.5 capitalize">
              {seasonIcon(route.season)} {route.season}
            </span>
          )}
          {route.risk_level && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground flex items-center gap-0.5 capitalize">
              {riskIcon(route.risk_level)} {route.risk_level}
            </span>
          )}
        </div>

        {/* PDF languages */}
        {pdfLangs && pdfLangs.length > 0 && getLangFlag && (
          <div className="flex items-center gap-1 mt-2">
            <span className="text-[10px] text-muted-foreground">PDF:</span>
            {pdfLangs.map(lang => (
              <span key={lang} className="text-xs" title={lang}>{getLangFlag(lang)}</span>
            ))}
          </div>
        )}

        {route.description && (
          <p className="text-[11px] text-muted-foreground line-clamp-2 mt-2 leading-snug">
            {route.description}
          </p>
        )}

        {/* Spacer to push footer down */}
        <div className="flex-1 min-h-1" />

        {/* Footer: creator + price */}
        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/60">
          <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
            <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="w-3 h-3 text-primary" />
            </div>
            <span className="text-[11px] truncate">{route.creator_name}</span>
          </div>
          <div className={`shrink-0 text-[10px] sm:text-xs font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg shadow-token-xs ${
            Number(route.price) === 0
              ? 'bg-emerald-500 text-white'
              : 'bg-primary text-primary-foreground'
          }`}>
            {Number(route.price) === 0 ? 'FREE' : `$${route.price.toFixed(2)}`}
          </div>
        </div>
      </div>
    </div>
  );
}
