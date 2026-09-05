import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { AXES } from '@/components/RoutePreferences';
import { TRIP_PRESETS, EMPTY_AXES, type AxisValues } from '@/lib/tripPresets';

/**
 * Ustawienia nowej tablicy, zbierane w chwili pierwszej decyzji.
 *
 * DLACZEGO FORMULARZ, A NIE SAME DOMYŚLNE. Wcześniej tablica powstawała po
 * cichu z domyślnych, a ustawienia zostawały „na później" — tyle że później
 * nikt do nich nie wracał, więc charakter wyjazdu, od którego zależy dobór
 * i kolejność miejsc, zostawał pusty przez cały czas zbierania.
 *
 * DLACZEGO TO NADAL NIE JEST BRAMKA. Wszystko jest wypełnione z góry:
 * preferencjami z konta, a po wybraniu charakteru — jego osiami. Kto nie chce
 * niczego ustawiać, klika „Utwórz i zapisz" od razu; przycisk stoi na dole
 * okna i nie ucieka przy przewijaniu, więc nie trzeba przejść przez formularz,
 * żeby go znaleźć.
 */

export interface UstawieniaNowejTablicy {
  nazwa: string;
  charakter: string | null;
  dni: number | null;
  godzinDziennie: number;
  wypelnienie: number;
  dataOd: string | null;
  dataDo: string | null;
  osie: AxisValues;
}

interface Props {
  otwarte: boolean;
  /** Miasto, z którego bierze się domyślna nazwa. */
  miasto: string;
  /** Osie z profilu — wartość domyślna, dopóki nie wybrano charakteru. */
  preferencjeKonta: Partial<AxisValues> | null;
  zapisywanie: boolean;
  onZamknij: () => void;
  onOdmowa: () => void;
  onUtworz: (u: UstawieniaNowejTablicy) => void;
}

const dniMiedzy = (od: string, doo: string) => {
  const a = new Date(od).getTime();
  const b = new Date(doo).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000) + 1;
};

export default function FormularzNowejTablicy({
  otwarte, miasto, preferencjeKonta, zapisywanie, onZamknij, onOdmowa, onUtworz,
}: Props) {
  const [nazwa, setNazwa] = useState(miasto);
  const [charakter, setCharakter] = useState<string | null>(null);
  const [dni, setDni] = useState(3);
  const [godzin, setGodzin] = useState(8);
  const [wypelnienie, setWypelnienie] = useState(70);
  const [dataOd, setDataOd] = useState('');
  const [dataDo, setDataDo] = useState('');
  const [osie, setOsie] = useState<AxisValues>(EMPTY_AXES);

  /* Otwarcie okna dla innego miasta zaczyna od czystych, wypełnionych wartości. */
  useEffect(() => {
    if (!otwarte) return;
    setNazwa(miasto);
    setCharakter(null);
    setDni(3);
    setGodzin(8);
    setWypelnienie(70);
    setDataOd('');
    setDataDo('');
    setOsie({ ...EMPTY_AXES, ...(preferencjeKonta ?? {}) });
  }, [otwarte, miasto, preferencjeKonta]);

  /* Wybór charakteru nadpisuje osie — to jest jego cała rola. Bez tego pigułki
     byłyby etykietą bez skutku, a użytkownik nie miałby jak zauważyć, że coś
     się stało. */
  const wybierzCharakter = (id: string) => {
    setCharakter(id);
    const preset = TRIP_PRESETS.find((p) => p.id === id);
    if (preset) setOsie({ ...preset.axes });
  };

  /* Daty i liczba dni to ta sama informacja podana dwa razy. Wpisanie terminu
     przelicza dni; przy braku dat dni zostają tym, co ustawiono ręcznie. */
  const dniZDat = useMemo(
    () => (dataOd && dataDo ? dniMiedzy(dataOd, dataDo) : null),
    [dataOd, dataDo]);

  const dniFinalne = dniZDat ?? dni;

  const zloz = () => onUtworz({
    nazwa: nazwa.trim() || miasto,
    charakter,
    dni: dniFinalne,
    godzinDziennie: godzin,
    wypelnienie,
    dataOd: dataOd || null,
    dataDo: dataDo || null,
    osie,
  });

  return (
    <Dialog open={otwarte} onOpenChange={(o) => { if (!o) onZamknij(); }}>
      {/* Nagłówek i stopka stoją; przewija się tylko środek — inaczej przycisk
          „Utwórz" uciekałby pod krawędź i trzeba by przejść cały formularz,
          żeby go dosięgnąć. */}
      <DialogContent className="sm:max-w-xl p-0">
        <DialogHeader className="px-7 pt-7 pb-4 pr-14 shrink-0">
          <DialogTitle className="text-left text-[21px] leading-[1.25]">
            Nowa tablica{miasto ? `: ${miasto}` : ''}
          </DialogTitle>
          <p className="text-left text-[14px] leading-[1.6] text-muted-foreground mt-2 text-pretty">
            Odkładane miejsca muszą gdzieś trafiać. Wszystko jest już wypełnione —
            możesz kliknąć „Utwórz i zapisz" albo najpierw dopasować wyjazd do siebie.
          </p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-7 pb-6 space-y-7">
          <label className="block">
            <span className="font-narrow uppercase tracking-[0.14em] text-[10.5px] text-muted-foreground">
              Nazwa tablicy
            </span>
            <Input
              value={nazwa}
              onChange={(e) => setNazwa(e.target.value)}
              placeholder={miasto}
              className="mt-2 h-11 text-[15px]"
            />
          </label>

          <div>
            <span className="font-narrow uppercase tracking-[0.14em] text-[10.5px] text-muted-foreground">
              Charakter wyjazdu
            </span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {TRIP_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => wybierzCharakter(p.id)}
                  aria-pressed={charakter === p.id}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] border transition-colors ${
                    charakter === p.id
                      ? 'bg-foreground border-foreground text-background'
                      : 'bg-background border-border hover:bg-muted text-foreground/80'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {charakter && (
              <p className="text-[12.5px] text-muted-foreground mt-2 leading-relaxed">
                {TRIP_PRESETS.find((p) => p.id === charakter)?.hint}
              </p>
            )}
          </div>

          <div>
            <span className="font-narrow uppercase tracking-[0.14em] text-[10.5px] text-muted-foreground">
              Termin
            </span>
            <div className="flex flex-wrap items-end gap-3 mt-2">
              <label className="flex-1 min-w-[140px]">
                <span className="block text-[12px] text-muted-foreground mb-1">Od</span>
                <Input type="date" value={dataOd} onChange={(e) => setDataOd(e.target.value)}
                  className="h-11" />
              </label>
              <label className="flex-1 min-w-[140px]">
                <span className="block text-[12px] text-muted-foreground mb-1">Do</span>
                <Input type="date" value={dataDo} onChange={(e) => setDataDo(e.target.value)}
                  className="h-11" />
              </label>
            </div>
            <p className="text-[12.5px] text-muted-foreground mt-2">
              {dniZDat
                ? `Z dat wychodzi ${dniZDat} ${dniZDat === 1 ? 'dzień' : 'dni'}.`
                : 'Bez dat wyjazd zostaje szkicem — termin dopiszesz później.'}
            </p>
          </div>

          {!dniZDat && (
            <div>
              <div className="flex items-baseline justify-between">
                <span className="font-narrow uppercase tracking-[0.14em] text-[10.5px] text-muted-foreground">
                  Ile dni
                </span>
                <span className="font-mono text-[12px] tabular-nums">{dni}</span>
              </div>
              <Slider value={[dni]} min={1} max={14} step={1}
                onValueChange={(v) => setDni(v[0])} className="mt-3" />
            </div>
          )}

          <div>
            <div className="flex items-baseline justify-between">
              <span className="font-narrow uppercase tracking-[0.14em] text-[10.5px] text-muted-foreground">
                Godzin zwiedzania dziennie
              </span>
              <span className="font-mono text-[12px] tabular-nums">{godzin} h</span>
            </div>
            <Slider value={[godzin]} min={2} max={14} step={1}
              onValueChange={(v) => setGodzin(v[0])} className="mt-3" />
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <span className="font-narrow uppercase tracking-[0.14em] text-[10.5px] text-muted-foreground">
                Jak ciasno wypełnić dzień
              </span>
              <span className="font-mono text-[12px] tabular-nums">{wypelnienie}%</span>
            </div>
            <Slider value={[wypelnienie]} min={30} max={100} step={5}
              onValueChange={(v) => setWypelnienie(v[0])} className="mt-3" />
            <p className="text-[12.5px] text-muted-foreground mt-2">
              Niżej znaczy więcej luzu między punktami.
            </p>
          </div>

          <div className="pt-1 border-t border-border">
            <span className="font-narrow uppercase tracking-[0.14em] text-[10.5px] text-muted-foreground">
              Czego szukasz w tym wyjeździe
            </span>
            <p className="text-[12.5px] text-muted-foreground mt-1.5 mb-4 leading-relaxed">
              Domyślnie ustawienia z Twojego konta. Wybór charakteru wyżej nadpisuje je jednym ruchem.
            </p>
            <div className="space-y-6">
              {AXES.map((os) => {
                const wartosc = osie[os.key as keyof AxisValues] ?? 50;
                return (
                  <div key={os.key}>
                    <p className="text-[13.5px] font-medium">{os.title}</p>
                    <Slider
                      value={[wartosc]}
                      min={0}
                      max={100}
                      step={5}
                      className="mt-3"
                      onValueChange={(v) => {
                        setOsie((prev) => ({ ...prev, [os.key]: v[0] }));
                        /* Ręczna zmiana osi znaczy, że to już nie jest czysty
                           preset — pigułka przestaje być zaznaczona, żeby nie
                           obiecywać czegoś, czego wartości już nie oddają. */
                        setCharakter(null);
                      }}
                    />
                    <div className="flex justify-between gap-4 mt-1.5">
                      <span className="text-[11.5px] text-muted-foreground">{os.left}</span>
                      <span className="text-[11.5px] text-muted-foreground text-right">{os.right}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-background px-7 py-4
                        flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" className="h-10 px-4" onClick={onOdmowa} disabled={zapisywanie}>
            Nie teraz
          </Button>
          <Button
            onClick={zloz}
            disabled={zapisywanie}
            className="h-10 px-5 bg-foreground text-background hover:bg-foreground/90"
          >
            {zapisywanie && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Utwórz i zapisz
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
