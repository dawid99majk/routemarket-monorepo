import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Compass, Smartphone, MapPin, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { fetchPurchaseAccess } from '@/lib/purchase-access';
import { parseGpx } from '@/lib/gpx-parser';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import NavigationMode from './NavigationMode';
import type { Polyline } from '@/lib/geo-utils';

interface RouteAccessInfo {
  routeId: number;
  routeTitle: string;
  startLat: number;
  startLng: number;
  hasAccess: boolean;
}

export default function NavigationLauncher() {
  const isMobile = useIsMobile();
  const [showOnTablet, setShowOnTablet] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 1023px)');
    const handler = () => setShowOnTablet(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const visible = isMobile || showOnTablet;

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const [open, setOpen] = useState(false);
  const [loadingGpx, setLoadingGpx] = useState(false);
  const [navTrack, setNavTrack] = useState<Polyline | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteAccessInfo | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(false);

  // Determine if we are on a route detail page
  const routeIdMatch = location.pathname.match(/^\/route\/(\d+)/);
  const currentRouteId = routeIdMatch ? Number(routeIdMatch[1]) : null;

  // Fetch route info + access status when on a route page
  useEffect(() => {
    if (!currentRouteId || !user) {
      setRouteInfo(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setCheckingAccess(true);
      try {
        const [{ data: route }, { data: purchase }] = await Promise.all([
          supabase
            .from('routes')
            .select('id, title, latitude, longitude, preview_track, user_id')
            .eq('id', currentRouteId)
            .maybeSingle(),
          supabase
            .from('purchases')
            .select('id')
            .eq('route_id', currentRouteId)
            .eq('user_id', user.id)
            .maybeSingle(),
        ]);
        if (cancelled || !route) return;
        const isOwner = route.user_id === user.id;
        const purchased = !!purchase;
        const preview = route.preview_track as Array<[number, number]> | null;
        setRouteInfo({
          routeId: route.id,
          routeTitle: route.title,
          startLat: preview?.[0]?.[0] ?? route.latitude,
          startLng: preview?.[0]?.[1] ?? route.longitude,
          hasAccess: purchased || isOwner,
        });
      } finally {
        if (!cancelled) setCheckingAccess(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentRouteId, user, params.id]);

  if (!visible || authLoading) return null;

  const handleClick = () => {
    if (!user) {
      navigate('/auth');
      return;
    }
    if (currentRouteId) {
      if (checkingAccess) return;
      if (routeInfo?.hasAccess) {
        setOpen(true);
      } else {
        toast.info('Kup tę trasę, aby uruchomić nawigację');
        const buyBtn = document.querySelector('[data-buy-cta]');
        buyBtn?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    navigate('/my-routes');
  };

  // External app deep link to start point
  const openExternalToStart = () => {
    if (!routeInfo) return;
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);
    let url: string;
    if (isIOS) {
      url = `maps://?daddr=${routeInfo.startLat},${routeInfo.startLng}&dirflg=d`;
    } else if (isAndroid) {
      url = `geo:0,0?q=${routeInfo.startLat},${routeInfo.startLng}(Start trasy)`;
    } else {
      url = `https://www.google.com/maps/dir/?api=1&destination=${routeInfo.startLat},${routeInfo.startLng}`;
    }
    window.open(url, '_blank');
  };

  async function fetchGpxBlob(): Promise<{ blob: Blob; xml: string } | null> {
    if (!routeInfo) return null;
    const access = await fetchPurchaseAccess({ routeId: routeInfo.routeId });
    if (!access.gpx_download?.url) {
      toast.error('Nie udało się pobrać pliku GPX');
      return null;
    }
    const res = await fetch(access.gpx_download.url);
    if (!res.ok) {
      toast.error('Nie udało się pobrać pliku GPX');
      return null;
    }
    const xml = await res.text();
    const blob = new Blob([xml], { type: 'application/gpx+xml' });
    return { blob, xml };
  }

  const handleShareGpx = async () => {
    if (!routeInfo) return;
    setLoadingGpx(true);
    try {
      const result = await fetchGpxBlob();
      if (!result) return;
      const file = new File(
        [result.blob],
        `${routeInfo.routeTitle.replace(/[^a-z0-9]+/gi, '-')}.gpx`,
        { type: 'application/gpx+xml' },
      );
      const shareData: ShareData = { files: [file], title: routeInfo.routeTitle, text: 'Trasa GPX' };
      const navAny = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (navAny.share && navAny.canShare?.(shareData)) {
        await navAny.share(shareData);
      } else {
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast.success('Plik GPX pobrany — otwórz w aplikacji turystycznej');
      }
      setOpen(false);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        toast.error(err?.message || 'Nie udało się udostępnić pliku GPX');
      }
    } finally {
      setLoadingGpx(false);
    }
  };

  const handleStartInAppNav = async () => {
    setLoadingGpx(true);
    try {
      const result = await fetchGpxBlob();
      if (!result) return;
      const parsed = parseGpx(result.xml);
      if (parsed.trackPoints.length < 2) {
        toast.error('Plik GPX nie zawiera trasy do nawigacji');
        return;
      }
      setNavTrack(parsed.trackPoints);
      setOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Nie udało się załadować trasy');
    } finally {
      setLoadingGpx(false);
    }
  };

  return (
    <>
      {/* Expandable FAB — sits above GuideHub */}
      <button
        onClick={handleClick}
        aria-label="Nawiguj"
        className="group fixed right-4 bottom-[88px] z-[1300] lg:hidden flex items-center h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 ease-out pl-4 pr-4 hover:pr-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        {checkingAccess ? (
          <Loader2 className="w-5 h-5 shrink-0 animate-spin" />
        ) : (
          <Compass className="w-5 h-5 shrink-0" />
        )}
        <span className="overflow-hidden max-w-0 group-hover:max-w-[140px] group-focus-visible:max-w-[140px] opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-hover:ml-2 group-focus-visible:ml-2 text-sm font-semibold whitespace-nowrap transition-all duration-300 ease-out">
          Nawiguj
        </span>
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Wybierz tryb nawigacji</DrawerTitle>
            <DrawerDescription>
              Możesz nawigować bezpośrednio w aplikacji lub otworzyć trasę w zewnętrznym programie.
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4 pb-6 space-y-3">
            <button
              onClick={handleStartInAppNav}
              disabled={loadingGpx}
              className="w-full text-left bg-card border border-border rounded-xl p-4 hover:border-primary transition-colors disabled:opacity-60 flex items-start gap-3"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                {loadingGpx ? <Loader2 className="w-5 h-5 animate-spin" /> : <Compass className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm">Nawiguj w przeglądarce</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pełnoekranowa mapa z Twoją pozycją GPS i wskaźnikiem dystansu
                </p>
              </div>
            </button>

            <button
              onClick={handleShareGpx}
              disabled={loadingGpx}
              className="w-full text-left bg-card border border-border rounded-xl p-4 hover:border-primary transition-colors disabled:opacity-60 flex items-start gap-3"
            >
              <div className="w-10 h-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
                {loadingGpx ? <Loader2 className="w-5 h-5 animate-spin" /> : <Smartphone className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm flex items-center gap-1.5">
                  Otwórz w aplikacji turystycznej <ExternalLink className="w-3 h-3" />
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Eksport GPX do Komoot, Mapy.cz, OsmAnd, Locus Map i innych
                </p>
              </div>
            </button>

            <button
              onClick={() => {
                openExternalToStart();
                setOpen(false);
              }}
              className="w-full text-left bg-card border border-border rounded-xl p-4 hover:border-primary transition-colors flex items-start gap-3"
            >
              <div className="w-10 h-10 rounded-lg bg-success/10 text-success flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm flex items-center gap-1.5">
                  Jedź do startu <ExternalLink className="w-3 h-3" />
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Nawigacja samochodowa do punktu początkowego (Google Maps / Apple Maps)
                </p>
              </div>
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {navTrack && routeInfo && (
        <NavigationMode
          track={navTrack}
          routeTitle={routeInfo.routeTitle}
          onClose={() => setNavTrack(null)}
        />
      )}
    </>
  );
}
