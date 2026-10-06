import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Camera, Flag, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  pobierzZdjeciaWkladu, usunZdjecie, wyslijZdjecie, zglosZdjecie, type ZdjecieWkladu,
} from '@/lib/wklad';

interface Props {
  placeId: string;
  placeName: string;
}

/**
 * Zdjęcia od podróżników pod zdjęciami z Wikimedia Commons. Układ mozaikowy jak w feedzie:
 * kafelki mają własne proporcje, a nie jednakowy kadr — pion z telefonu nie jest ucinany.
 * Dodawać może każdy zalogowany, ale pokazujemy tylko zdjęcia, które przeszły kontrolę
 * (autor widzi swoje oczekujące od razu, z oznaczeniem).
 */
export default function ZdjeciaPodroznych({ placeId, placeName }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [zdjecia, setZdjecia] = useState<ZdjecieWkladu[] | null>(null);
  const [dialog, setDialog] = useState(false);
  const [otwarte, setOtwarte] = useState<ZdjecieWkladu | null>(null);

  const wczytaj = useCallback(async () => {
    try { setZdjecia(await pobierzZdjeciaWkladu(placeId)); } catch { setZdjecia([]); }
  }, [placeId]);
  useEffect(() => { setZdjecia(null); void wczytaj(); }, [wczytaj]);

  const dodaj = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) { toast.info(t('wklad.zaloguj_sie')); navigate('/auth'); return; }
    setDialog(true);
  };

  return (
    <section className="mt-10" aria-labelledby="zdjecia-podroznych">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-narrow uppercase tracking-[0.32em] text-[11px] text-muted-foreground">
            {t('wklad.zdjecia_nadpis_maly')}
          </p>
          <h2 id="zdjecia-podroznych" className="font-display text-[24px] leading-tight mt-1.5">
            {t('wklad.zdjecia_tytul')}
          </h2>
        </div>
        <Button variant="outline" onClick={dodaj} className="shrink-0 gap-2">
          <Camera className="w-4 h-4" aria-hidden /> {t('wklad.dodaj_zdjecie')}
        </Button>
      </div>

      {zdjecia && zdjecia.length === 0 && (
        <p className="mt-4 text-[15px] text-muted-foreground max-w-[56ch] text-pretty">{t('wklad.zdjecia_puste')}</p>
      )}

      {zdjecia && zdjecia.length > 0 && (
        <ul className="mt-5 columns-2 sm:columns-3 [column-gap:12px]">
          {zdjecia.map((z) => (
            <li key={z.id} className="mb-3 break-inside-avoid">
              <button onClick={() => setOtwarte(z)}
                className="block w-full text-left rounded-md overflow-hidden bg-muted relative focus-visible:ring-2 focus-visible:ring-ring outline-none"
                aria-label={z.caption || t('wklad.zdjecie_od', { autor: z.author ?? t('wklad.autor_anonim') })}>
                <img src={z.thumb_url} alt={z.caption || ''} width={z.width} height={z.height} loading="lazy"
                  className="w-full h-auto block" style={{ aspectRatio: `${z.width} / ${z.height}` }} />
                {z.pending && (
                  <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-bold text-foreground">
                    {t('wklad.czeka_znacznik')}
                  </span>
                )}
              </button>
              <p className="mt-1.5 text-[12px] text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                {z.caption ? `${z.caption} · ` : ''}{t('wklad.fot', { autor: z.author ?? t('wklad.autor_anonim') })}
              </p>
            </li>
          ))}
        </ul>
      )}

      <DialogDodaj otwarte={dialog} onZamknij={() => setDialog(false)} placeId={placeId} placeName={placeName}
        onDodano={() => { setDialog(false); void wczytaj(); }} />
      <Powiekszenie zdjecie={otwarte} onZamknij={() => setOtwarte(null)}
        onZmiana={() => { setOtwarte(null); void wczytaj(); }} />
    </section>
  );
}

function DialogDodaj({ otwarte, onZamknij, placeId, placeName, onDodano }: {
  otwarte: boolean; onZamknij: () => void; placeId: string; placeName: string; onDodano: () => void;
}) {
  const { t } = useTranslation();
  const [plik, setPlik] = useState<File | null>(null);
  const [podglad, setPodglad] = useState<string | null>(null);
  const [podpis, setPodpis] = useState('');
  const [zgoda, setZgoda] = useState(false);
  const [wysylam, setWysylam] = useState(false);
  const wejscie = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!plik) { setPodglad(null); return; }
    const adres = URL.createObjectURL(plik);
    setPodglad(adres);
    return () => URL.revokeObjectURL(adres);
  }, [plik]);
  useEffect(() => { if (!otwarte) { setPlik(null); setPodpis(''); setZgoda(false); } }, [otwarte]);

  const wyslij = async () => {
    if (!plik || !zgoda) return;
    setWysylam(true);
    try {
      const w = await wyslijZdjecie(placeId, plik, podpis);
      if (w.status === 'pending') toast.info(t('wklad.zdjecie_czeka'));
      else toast.success(t('wklad.zdjecie_dodane'));
      onDodano();
    } catch (e: any) {
      toast.error(e?.message || t('wklad.zdjecie_blad'));
    } finally {
      setWysylam(false);
    }
  };

  return (
    <Dialog open={otwarte} onOpenChange={(o) => { if (!o && !wysylam) onZamknij(); }}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="font-display font-light text-[22px]">{t('wklad.zdjecie_tytul_dialogu', { miejsce: placeName })}</DialogTitle>
          <DialogDescription className="sr-only">{t('wklad.zdjecie_opis_dialogu')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <input ref={wejscie} type="file" accept="image/*" className="sr-only"
            onChange={(e) => setPlik(e.target.files?.[0] ?? null)} />
          {podglad ? (
            <div className="space-y-2">
              <img src={podglad} alt="" className="w-full max-h-[300px] object-contain rounded-md bg-muted" />
              <button onClick={() => wejscie.current?.click()} className="text-[13px] underline underline-offset-2 text-muted-foreground hover:text-foreground">
                {t('wklad.zdjecie_zmien')}
              </button>
            </div>
          ) : (
            <button onClick={() => wejscie.current?.click()}
              className="w-full rounded-md border border-dashed border-border bg-muted/40 py-10 flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <Camera className="w-6 h-6" aria-hidden />
              <span className="text-[14px] font-medium">{t('wklad.zdjecie_wybierz')}</span>
            </button>
          )}
          <div>
            <label htmlFor="wklad-podpis" className="text-[12px] font-bold text-muted-foreground">{t('wklad.zdjecie_podpis')}</label>
            <Textarea id="wklad-podpis" rows={2} maxLength={140} value={podpis} onChange={(e) => setPodpis(e.target.value)}
              placeholder={t('wklad.zdjecie_podpis_placeholder')} className="mt-1.5 resize-none" />
          </div>
          <label className="flex items-start gap-3 text-[13px] leading-snug cursor-pointer">
            <Checkbox checked={zgoda} onCheckedChange={(v) => setZgoda(v === true)} className="mt-0.5" />
            <span className="text-pretty">
              {t('wklad.zdjecie_zgoda')}{' '}
              <a href="/legal/copyright" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{t('wklad.zasady_praw')}</a>.
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onZamknij} disabled={wysylam}>{t('wklad.anuluj')}</Button>
          <Button onClick={wyslij} disabled={!plik || !zgoda || wysylam}>
            {wysylam ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden /> {t('wklad.wysylam')}</> : t('wklad.zdjecie_wyslij')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Powiekszenie({ zdjecie, onZamknij, onZmiana }: {
  zdjecie: ZdjecieWkladu | null; onZamknij: () => void; onZmiana: () => void;
}) {
  const { t } = useTranslation();
  const [zajety, setZajety] = useState(false);
  const [pytanie, setPytanie] = useState(false);
  useEffect(() => { setPytanie(false); }, [zdjecie?.id]);
  if (!zdjecie) return null;

  const dzialaj = async (f: () => Promise<void>, komunikat: string) => {
    setZajety(true);
    try { await f(); toast.success(komunikat); onZmiana(); }
    catch (e: any) { toast.error(e?.message || t('wklad.zdjecie_blad')); }
    finally { setZajety(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onZamknij(); }}>
      <DialogContent className="max-w-[860px] p-3 sm:p-4">
        <DialogHeader className="sr-only">
          <DialogTitle>{zdjecie.caption || t('wklad.zdjecie_od', { autor: zdjecie.author ?? t('wklad.autor_anonim') })}</DialogTitle>
          <DialogDescription>{t('wklad.fot', { autor: zdjecie.author ?? t('wklad.autor_anonim') })}</DialogDescription>
        </DialogHeader>
        <img src={zdjecie.url} alt={zdjecie.caption || ''} className="w-full max-h-[70vh] object-contain rounded-md bg-muted" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px] text-pretty min-w-0">
            {zdjecie.caption && <span className="block font-medium">{zdjecie.caption}</span>}
            <span className="text-muted-foreground">{t('wklad.fot', { autor: zdjecie.author ?? t('wklad.autor_anonim') })}</span>
            {zdjecie.pending && <span className="block text-[12px] text-muted-foreground mt-0.5">{t('wklad.czeka_znacznik')}</span>}
          </p>
          {zdjecie.mine ? (
            pytanie ? (
              <div className="flex items-center gap-2">
                <span className="text-[13px]">{t('wklad.usun_pytanie')}</span>
                <Button size="sm" variant="destructive" disabled={zajety}
                  onClick={() => dzialaj(() => usunZdjecie(zdjecie.id), t('wklad.usunieto'))}>{t('wklad.usun')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setPytanie(false)}>{t('wklad.anuluj')}</Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setPytanie(true)} className="gap-1.5">
                <Trash2 className="w-4 h-4" aria-hidden /> {t('wklad.usun')}
              </Button>
            )
          ) : (
            <Button size="sm" variant="ghost" disabled={zajety} className="gap-1.5"
              onClick={() => dzialaj(() => zglosZdjecie(zdjecie.id), t('wklad.zglos_dzieki'))}>
              <Flag className="w-4 h-4" aria-hidden /> {t('wklad.zglos')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
