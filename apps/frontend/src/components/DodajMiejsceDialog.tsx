import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Camera, Loader2, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { apiPost } from '@/lib/api';
import { wyslijZdjecie } from '@/lib/wklad';
import LocationPicker from '@/components/LocationPicker';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export interface DodaneMiejsce {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  lat: number;
  lng: number;
  category: string;
  description: string;
  website: string | null;
  visit_minutes: number | null;
  /** Czy miejsce już istniało w katalogu (nie zostało utworzone teraz). */
  istnialo: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  miasto: string;
  /** Środek mapy, gdy znamy okolicę (np. średnia z miejsc na tablicy). Bez niego mapy nie pokazujemy. */
  centrum?: { lat: number; lng: number } | null;
  /** Gdy podane, dialog kończy się decyzją „na pewno / może" i oddaje miejsce tablicy. */
  naTablice?: boolean;
  onDodano: (m: DodaneMiejsce, decyzja: 'must' | 'nice' | null) => void | Promise<void>;
}

const KATEGORIE = ['attraction', 'food', 'hotel', 'nightlife'] as const;

/**
 * Własne miejsce. OSM nie zna wszystkiego — knajpy bez szyldu, punktu widokowego znanego
 * lokalsom, świeżo otwartej galerii. Położenie ustalamy z adresu albo z punktu na mapie;
 * serwer sprawdza, że leży blisko miasta, i szuka duplikatu, zanim założy wpis.
 */
export default function DodajMiejsceDialog({ open, onOpenChange, miasto, centrum, naTablice, onDodano }: Props) {
  const { t } = useTranslation();
  const [nazwa, setNazwa] = useState('');
  const [miastoPole, setMiastoPole] = useState(miasto);
  const [adres, setAdres] = useState('');
  const [kategoria, setKategoria] = useState<(typeof KATEGORIE)[number]>('attraction');
  const [opis, setOpis] = useState('');
  const [minuty, setMinuty] = useState('');
  const [www, setWww] = useState('');
  const [mapa, setMapa] = useState(false);
  const [punkt, setPunkt] = useState<{ lat: number; lng: number } | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [zgoda, setZgoda] = useState(false);
  const [zajety, setZajety] = useState(false);
  const [dubel, setDubel] = useState<{ id: string; slug: string } | null>(null);
  const wejscieFoto = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) return;
    setNazwa(''); setAdres(''); setKategoria('attraction'); setOpis(''); setMinuty(''); setWww('');
    setMapa(false); setPunkt(null); setFoto(null); setZgoda(false); setDubel(null);
  }, [open]);
  useEffect(() => { setMiastoPole(miasto); }, [miasto]);

  const gotowe = nazwa.trim().length >= 2 && miastoPole.trim().length >= 2 && (!foto || zgoda);

  const wyslij = async (decyzja: 'must' | 'nice' | null) => {
    if (!gotowe || zajety) return;
    setZajety(true);
    setDubel(null);
    try {
      const r = await apiPost<{ id: string; slug: string; created: boolean; duplicate?: boolean; status?: string }>(
        '/catalog/submit',
        {
          name: nazwa.trim(), city: miastoPole.trim(), address: adres.trim() || undefined, category: kategoria,
          description: opis.trim() || undefined, website: www.trim() || undefined,
          visit_minutes: minuty ? Number(minuty) : undefined, lat: punkt?.lat, lng: punkt?.lng,
        },
        { timeoutMs: 40_000 },
      );
      if (r.duplicate) { setDubel({ id: r.id, slug: r.slug }); return; }
      await zakoncz(r.id, decyzja, false, r.status);
    } catch (e: any) {
      toast.error(e?.message || t('wklad.miejsce_blad'));
    } finally {
      setZajety(false);
    }
  };

  /** Pełny wiersz z katalogu — autor widzi też własne miejsce, które jeszcze czeka na sprawdzenie. */
  const zakoncz = async (id: string, decyzja: 'must' | 'nice' | null, istnialo: boolean, status?: string) => {
    const { data, error } = await supabase.from('place_catalog')
      .select('id, slug, name, city, lat, lng, category, description, website, visit_minutes').eq('id', id).maybeSingle();
    if (error || !data) throw new Error(t('wklad.miejsce_blad'));
    if (!istnialo && foto && zgoda) {
      try { await wyslijZdjecie(id, foto, ''); }
      catch (e: any) { toast.error(`${t('wklad.miejsce_foto_blad')} ${e?.message ?? ''}`.trim()); }
    }
    if (!istnialo && status === 'pending') toast.info(t('wklad.miejsce_czeka'));
    else toast.success(t('wklad.miejsce_dodane', { nazwa: data.name }));
    onOpenChange(false);
    await onDodano({ ...(data as any), istnialo }, decyzja);
  };

  const uzyjIstniejacego = async (decyzja: 'must' | 'nice' | null) => {
    if (!dubel) return;
    setZajety(true);
    try { await zakoncz(dubel.id, decyzja, true); }
    catch (e: any) { toast.error(e?.message || t('wklad.miejsce_blad')); }
    finally { setZajety(false); }
  };

  const przyciski = (f: (d: 'must' | 'nice' | null) => void) => naTablice ? (
    <>
      <Button onClick={() => f('must')} disabled={!gotowe || zajety} className="bg-primary text-primary-foreground hover:bg-primary/90">
        {t('wklad.miejsce_na_pewno')}
      </Button>
      <Button variant="outline" onClick={() => f('nice')} disabled={!gotowe || zajety}>{t('wklad.miejsce_moze')}</Button>
    </>
  ) : (
    <Button onClick={() => f(null)} disabled={!gotowe || zajety}>{t('wklad.miejsce_dodaj_katalog')}</Button>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!zajety) onOpenChange(o); }}>
      <DialogContent className="max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display font-light text-[24px]">{t('wklad.miejsce_dodaj')}</DialogTitle>
          <DialogDescription className="text-pretty">{t('wklad.miejsce_opis_karty')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor="mm-nazwa" className="text-[12px] font-bold text-muted-foreground">{t('wklad.miejsce_nazwa')}</label>
            <Input id="mm-nazwa" value={nazwa} maxLength={120} onChange={(e) => setNazwa(e.target.value)} className="mt-1.5" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="mm-miasto" className="text-[12px] font-bold text-muted-foreground">{t('wklad.miejsce_miasto')}</label>
              <Input id="mm-miasto" value={miastoPole} maxLength={80} onChange={(e) => setMiastoPole(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <label htmlFor="mm-czas" className="text-[12px] font-bold text-muted-foreground">{t('wklad.miejsce_czas')}</label>
              <Input id="mm-czas" inputMode="numeric" value={minuty} onChange={(e) => setMinuty(e.target.value.replace(/\D/g, '').slice(0, 3))} className="mt-1.5" />
            </div>
          </div>

          <fieldset>
            <legend className="text-[12px] font-bold text-muted-foreground">{t('wklad.miejsce_kategoria')}</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {KATEGORIE.map((k) => (
                <button key={k} type="button" onClick={() => setKategoria(k)} aria-pressed={kategoria === k}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium border transition-colors ${
                    kategoria === k ? 'bg-foreground text-background border-foreground' : 'bg-card border-border hover:bg-muted'}`}>
                  {t(`wklad.kategoria_${k}`)}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="mm-adres" className="text-[12px] font-bold text-muted-foreground">{t('wklad.miejsce_adres')}</label>
            <Input id="mm-adres" value={adres} maxLength={160} onChange={(e) => setAdres(e.target.value)} className="mt-1.5" />
            <p className="text-[13px] text-muted-foreground mt-1.5 text-pretty">{t('wklad.miejsce_adres_pomoc')}</p>
            {centrum && (
              <button type="button" onClick={() => { setMapa((m) => !m); if (!punkt) setPunkt(centrum); }}
                className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium underline underline-offset-2 hover:no-underline">
                <MapPin className="w-3.5 h-3.5" aria-hidden /> {mapa ? t('wklad.miejsce_mapa_ukryj') : t('wklad.miejsce_mapa_pokaz')}
              </button>
            )}
            {centrum && mapa && punkt && (
              <div className="mt-2.5">
                <div className="h-[220px] rounded-md overflow-hidden border border-border">
                  <LocationPicker latitude={punkt.lat} longitude={punkt.lng} zoom={13}
                    onLocationChange={(lat, lng) => setPunkt({ lat, lng })} />
                </div>
                <p className="text-[13px] text-muted-foreground mt-1.5">{t('wklad.miejsce_mapa_pomoc')}</p>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="mm-opis" className="text-[12px] font-bold text-muted-foreground">{t('wklad.miejsce_opis')}</label>
            <Textarea id="mm-opis" rows={3} maxLength={600} value={opis} onChange={(e) => setOpis(e.target.value)}
              placeholder={t('wklad.miejsce_opis_placeholder')} className="mt-1.5 resize-none" />
          </div>
          <div>
            <label htmlFor="mm-www" className="text-[12px] font-bold text-muted-foreground">{t('wklad.miejsce_www')}</label>
            <Input id="mm-www" type="url" value={www} maxLength={200} onChange={(e) => setWww(e.target.value)} placeholder="https://" className="mt-1.5" />
          </div>

          <div>
            <input ref={wejscieFoto} type="file" accept="image/*" className="sr-only" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
            <Button type="button" variant="outline" size="sm" onClick={() => wejscieFoto.current?.click()} className="gap-2">
              <Camera className="w-4 h-4" aria-hidden /> {foto ? foto.name : t('wklad.miejsce_foto')}
            </Button>
            {foto && (
              <label className="flex items-start gap-3 text-[13px] leading-snug cursor-pointer mt-3">
                <Checkbox checked={zgoda} onCheckedChange={(v) => setZgoda(v === true)} className="mt-0.5" />
                <span className="text-pretty">
                  {t('wklad.zdjecie_zgoda')}{' '}
                  <a href="/legal/copyright" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{t('wklad.zasady_praw')}</a>.
                </span>
              </label>
            )}
          </div>

          {dubel && (
            <div className="rounded-md bg-secondary p-3.5 text-[14px]" role="status">
              <p className="text-pretty">{t('wklad.miejsce_juz_jest')}</p>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {naTablice
                  ? <>
                      <Button size="sm" onClick={() => uzyjIstniejacego('must')} disabled={zajety} className="bg-primary text-primary-foreground hover:bg-primary/90">{t('wklad.miejsce_na_pewno')}</Button>
                      <Button size="sm" variant="outline" onClick={() => uzyjIstniejacego('nice')} disabled={zajety}>{t('wklad.miejsce_moze')}</Button>
                    </>
                  : <Button size="sm" onClick={() => uzyjIstniejacego(null)} disabled={zajety}>{t('wklad.miejsce_uzyj_istniejacego')}</Button>}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={zajety}>{t('wklad.anuluj')}</Button>
          {zajety ? <Button disabled><Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden /> {t('wklad.wysylam')}</Button> : przyciski(wyslij)}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
