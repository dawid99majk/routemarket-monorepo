import { CalendarDays, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format, parse, isValid } from 'date-fns';
import { pl } from 'date-fns/locale';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { zakresDat } from '@/lib/daty';

export interface FormularzPlanu { start: string; end: string; date: string; dinner: string }

interface UlozPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: FormularzPlanu;
  onForm: (zmiana: Partial<FormularzPlanu>) => void;
  /** Termin z ustawień wyjazdu. Gdy jest, plan bierze datę stąd i nie pyta o nią drugi raz. */
  termin: { od: string; do: string | null } | null;
  dni: number;
  cena?: number;
  saldo?: number;
  planning: boolean;
  onUloz: () => void;
}

const OKNA = [
  { klucz: 'plan.okno_standardowy', od: '09:00', do: '18:00' },
  { klucz: 'plan.okno_z_dziecmi', od: '09:00', do: '16:00' },
  { klucz: 'plan.okno_intensywny', od: '08:00', do: '20:00' },
  { klucz: 'plan.okno_popoludniowy', od: '14:00', do: '21:00' },
] as const;

/**
 * Ustawienia ułożenia planu w jednym oknie, otwieranym wtedy, gdy są potrzebne.
 *
 * Formularz stał dotąd na samym dole zakładki, pod gotowym planem, a „Przelicz
 * plan" w nagłówku układał go od nowa bez pokazania godzin i ceny. Do tego pole
 * „Pierwszy dzień" żyło obok terminu wyjazdu jako druga, niezależna data — przy
 * ustawionym terminie już o nią nie pytamy.
 */
export default function UlozPlanDialog({
  open, onOpenChange, form, onForm, termin, dni, cena, saldo, planning, onUloz,
}: UlozPlanDialogProps) {
  const { t } = useTranslation();
  const data = (() => {
    if (!form.date) return undefined;
    const d = parse(form.date, 'yyyy-MM-dd', new Date());
    return isValid(d) ? d : undefined;
  })();
  const zaMalo = cena != null && saldo != null && saldo < cena;
  const koszt = (n: number) => t('plan.koszt', { count: n });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('plan.dialog_tytul')}</DialogTitle>
          <DialogDescription>{t('plan.dialog_opis', { dni: t('plan.dni', { count: dni }) })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section>
            <p className="font-narrow uppercase tracking-[0.18em] text-[11px] text-muted-foreground">
              {t('plan.godziny_dnia')}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {OKNA.map((o) => {
                const wybrane = form.start === o.od && form.end === o.do;
                return (
                  <button key={o.klucz} type="button" aria-pressed={wybrane}
                    onClick={() => onForm({ start: o.od, end: o.do })}
                    className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors
                                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      wybrane ? 'bg-foreground border-foreground text-background' : 'border-border hover:bg-muted'
                    }`}>
                    {t(o.klucz)}
                    <span className={`font-mono tabular-nums ml-1.5 ${wybrane ? 'text-background/80' : 'text-muted-foreground'}`}>
                      {o.od}–{o.do}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <label className="text-[13px] text-muted-foreground">{t('plan.od')}
                <Input type="time" value={form.start} onChange={(e) => onForm({ start: e.target.value })} className="mt-1" />
              </label>
              <label className="text-[13px] text-muted-foreground">{t('plan.do')}
                <Input type="time" value={form.end} onChange={(e) => onForm({ end: e.target.value })} className="mt-1" />
              </label>
            </div>
          </section>

          <section>
            <p className="font-narrow uppercase tracking-[0.18em] text-[11px] text-muted-foreground">
              {t('plan.pierwszy_dzien')}
            </p>
            {termin ? (
              <p className="text-[14px] text-foreground mt-2">
                {t('plan.z_terminu', { zakres: zakresDat(termin.od, termin.do) })}
              </p>
            ) : (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="mt-2 w-full justify-start font-normal text-sm h-10">
                      <CalendarDays className="w-4 h-4 mr-2 text-muted-foreground shrink-0" />
                      {data ? format(data, 'd MMMM yyyy', { locale: pl }) : t('plan.wybierz_date')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start" collisionPadding={16}>
                    <Calendar mode="single" locale={pl} weekStartsOn={1} selected={data} defaultMonth={data}
                      onSelect={(d) => d && onForm({ date: format(d, 'yyyy-MM-dd') })} initialFocus />
                  </PopoverContent>
                </Popover>
                <p className="text-[13px] text-muted-foreground mt-1.5 text-pretty">{t('plan.bez_terminu')}</p>
              </>
            )}
          </section>

          <section>
            <label className="block">
              <span className="font-narrow uppercase tracking-[0.18em] text-[11px] text-muted-foreground">
                {t('plan.kolacja')}
              </span>
              <Input type="time" value={form.dinner} onChange={(e) => onForm({ dinner: e.target.value })}
                className="mt-2 w-40" />
            </label>
            <p className="text-[13px] text-muted-foreground mt-1.5">{t('plan.kolacja_opis')}</p>
          </section>
        </div>

        {zaMalo && (
          <p className="text-[13px] text-foreground bg-warning/15 rounded-sm px-3 py-2">
            {t('plan.za_malo_tokenow', { saldo: koszt(saldo!), cena: koszt(cena!) })}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('plan.anuluj')}</Button>
          <Button onClick={onUloz} disabled={planning || zaMalo || !form.start || !form.end}
            className="bg-foreground text-background hover:bg-foreground/90">
            {planning
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('plan.ukladam')}</>
              : <>{t('plan.uloz')}{cena != null ? <span className="font-mono tabular-nums text-background/80 ml-2">· {koszt(cena)}</span> : null}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
