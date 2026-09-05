import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Zdjecie from '@/components/Zdjecie';
import { ChevronLeft, ChevronRight, Maximize2, X, MapPin } from 'lucide-react';

interface GaleriaZdjecProps {
  zdjecia: string[];
  nazwaMiejsca: string;
  aktIndex?: number;
  onZmienIndex?: (idx: number) => void;
  aspectRatio?: string;
  className?: string;
}

export default function GaleriaZdjec({
  zdjecia,
  nazwaMiejsca,
  aktIndex,
  onZmienIndex,
  aspectRatio = 'aspect-[16/11]',
  className = '',
}: GaleriaZdjecProps) {
  const [fotoLokalne, setFotoLokalne] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const foto = aktIndex !== undefined ? aktIndex : fotoLokalne;
  const ile = zdjecia.length;
  const teraz = Math.min(foto, Math.max(0, ile - 1));

  const setFoto = (nowy: number | ((prev: number) => number)) => {
    const wartosc = typeof nowy === 'function' ? nowy(foto) : nowy;
    setFotoLokalne(wartosc);
    if (onZmienIndex) onZmienIndex(wartosc);
  };

  const idzLewo = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (ile > 1) setFoto((f) => (f - 1 + ile) % ile);
  };

  const idzPrawo = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (ile > 1) setFoto((f) => (f + 1) % ile);
  };

  // Reset indeksu po zmianie miejsca
  useEffect(() => {
    setFotoLokalne(0);
    setLightboxOpen(false);
  }, [nazwaMiejsca]);

  // Obsługa klawiszy w trybie Lightbox (Esc, Strzałki Lewo/Prawo)
  useEffect(() => {
    if (!lightboxOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setLightboxOpen(false);
      } else if (e.key === 'ArrowLeft' && ile > 1) {
        e.preventDefault();
        idzLewo();
      } else if (e.key === 'ArrowRight' && ile > 1) {
        e.preventDefault();
        idzPrawo();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [lightboxOpen, ile]);

  // Obsługa gestów dotykowych (Swipe)
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null || ile <= 1) return;
    const touchEnd = e.changedTouches[0].clientX;
    const delta = touchStart - touchEnd;
    if (Math.abs(delta) > 35) {
      if (delta > 0) {
        idzPrawo();
      } else {
        idzLewo();
      }
    }
    setTouchStart(null);
  };

  if (ile === 0) {
    return (
      <div className={`rounded-xl bg-gradient-to-br from-primary/10 via-muted/40 to-accent/10 ${aspectRatio} border border-border/60 flex flex-col items-center justify-center p-4 text-center ${className}`}>
        <MapPin className="w-8 h-8 text-primary/50 mb-2" />
        <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Zdjęcia w przygotowaniu</span>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nazwaMiejsca)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 text-xs text-primary font-medium hover:underline inline-flex items-center gap-1"
        >
          Zobacz zdjęcia w Google ↗
        </a>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 select-none ${className}`}>
      {/* ── Główny kadr zdjęcia na karcie ── */}
      <div
        className={`group relative rounded-xl overflow-hidden bg-muted ${aspectRatio} border border-border/70 shadow-xs select-none`}
      >
        <Zdjecie
          src={zdjecia[teraz]}
          gdzie="bohater"
          alt={nazwaMiejsca}
          className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
        />

        {/* Cieniowanie przy najechaniu */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/25 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        {/* Przycisk „Powiększ” w prawym górnym rogu */}
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="absolute top-2.5 right-2.5 z-30 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/65 hover:bg-black/85 active:scale-95 backdrop-blur-md text-white text-[11px] font-medium shadow-md transition-all cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span>Powiększ</span>
        </button>

        {/* Licznik zdjęć */}
        {ile > 1 && (
          <span className="absolute bottom-2.5 right-2.5 z-20 rounded-full bg-black/65 backdrop-blur-md text-white font-mono tabular-nums text-[10px] px-2.5 py-0.5 shadow-sm pointer-events-none">
            {teraz + 1} / {ile}
          </span>
        )}

        {/* ── Strefy klikania w bok na kadrze w karcie ── */}
        {ile > 1 ? (
          <>
            {/* Lewa strefa (kliknięcie w lewy bok zdjęcia) */}
            <div
              onClick={idzLewo}
              aria-label="Poprzednie zdjęcie"
              title="Poprzednie zdjęcie (kliknij lewy bok)"
              className="absolute left-0 top-0 bottom-0 w-[42%] z-20 cursor-pointer flex items-center justify-start pl-2.5 group/arrow"
            >
              <button
                type="button"
                onClick={idzLewo}
                className="w-8 h-8 rounded-full bg-black/55 hover:bg-black/90 active:scale-90 text-white backdrop-blur-md flex items-center justify-center transition-all shadow-md group-hover/arrow:scale-110"
                aria-label="Poprzednie zdjęcie"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Środkowa strefa (kliknięcie w środek otwiera powiększenie) */}
            <div
              onClick={() => setLightboxOpen(true)}
              title="Kliknij, aby powiększyć"
              className="absolute left-[42%] right-[42%] top-0 bottom-0 z-10 cursor-zoom-in"
            />

            {/* Prawa strefa (kliknięcie w prawy bok zdjęcia) */}
            <div
              onClick={idzPrawo}
              aria-label="Następne zdjęcie"
              title="Następne zdjęcie (kliknij prawy bok)"
              className="absolute right-0 top-0 bottom-0 w-[42%] z-20 cursor-pointer flex items-center justify-end pr-2.5 group/arrow"
            >
              <button
                type="button"
                onClick={idzPrawo}
                className="w-8 h-8 rounded-full bg-black/55 hover:bg-black/90 active:scale-90 text-white backdrop-blur-md flex items-center justify-center transition-all shadow-md group-hover/arrow:scale-110"
                aria-label="Następne zdjęcie"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          <div
            onClick={() => setLightboxOpen(true)}
            className="absolute inset-0 z-20 cursor-zoom-in"
          />
        )}
      </div>

      {/* ── Pasek miniatur pod kadrem ── */}
      {ile > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-none">
          {zdjecia.map((z, i) => (
            <button
              key={z + i}
              type="button"
              onClick={() => setFoto(i)}
              aria-label={`Przełącz na zdjęcie ${i + 1}`}
              className={`relative h-12 flex-1 min-w-[50px] max-w-[80px] rounded-lg overflow-hidden border transition-all duration-200 cursor-pointer ${
                i === teraz
                  ? 'border-primary ring-2 ring-primary/40 scale-[1.03] shadow-xs'
                  : 'border-border/80 opacity-60 hover:opacity-100 hover:scale-[1.01]'
              }`}
            >
              <Zdjecie src={z} gdzie={150} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* ── Pełnoekranowy Lightbox (Modal powiększenia) ── */}
      {lightboxOpen &&
        createPortal(
          <div
            className="rm-lightbox-portal fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl flex flex-col justify-between select-none animate-in fade-in duration-200 pointer-events-auto"
            style={{ pointerEvents: 'auto' }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pasek górny: Tytuł, licznik, zamknięcie */}
            <div
              className="p-4 sm:p-6 flex items-center justify-between text-white z-30 shrink-0 pointer-events-auto"
            >
              <div className="min-w-0 pr-4">
                <h3 className="font-display text-lg sm:text-2xl font-light text-white truncate tracking-tight">
                  {nazwaMiejsca}
                </h3>
                <span className="font-mono text-xs text-white/60 tabular-nums">
                  Zdjęcie {teraz + 1} z {ile}
                </span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-[11px] font-mono uppercase tracking-wider text-white/40 hidden sm:inline-block">
                  ESC aby zamknąć
                </span>
                <button
                  type="button"
                  onClick={() => setLightboxOpen(false)}
                  className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white text-xs font-medium flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                  aria-label="Zamknij powiększenie"
                >
                  <X className="w-4 h-4" />
                  <span>Zamknij</span>
                </button>
              </div>
            </div>

            {/* Centrum: Duże zdjęcie ze strefami klikania w lewy i prawy bok */}
            <div
              className="relative flex-1 flex items-center justify-center min-h-0 px-2 sm:px-6 pointer-events-auto"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {/* Zdjęcie w centrum */}
              <div className="relative max-h-full max-w-full flex items-center justify-center z-10 pointer-events-none">
                <Zdjecie
                  key={zdjecia[teraz]}
                  src={zdjecia[teraz]}
                  gdzie="bohater"
                  alt={`${nazwaMiejsca} - zdjęcie ${teraz + 1}`}
                  className="max-h-[72vh] sm:max-h-[78vh] max-w-[94vw] sm:max-w-[85vw] object-contain rounded-xl shadow-2xl animate-in zoom-in-95 duration-200"
                />
              </div>

              {/* Cała LEWA strona ekranu i zdjęcia – kliknięcie w bok cofa w lewo! */}
              {ile > 1 && (
                <div
                  onClick={idzLewo}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label="Poprzednie zdjęcie (kliknij lewy bok)"
                  title="Poprzednie zdjęcie"
                  style={{ pointerEvents: 'auto' }}
                  className="absolute left-0 top-0 bottom-0 w-1/2 z-20 cursor-pointer flex items-center justify-start pl-3 sm:pl-8 group pointer-events-auto"
                >
                  <button
                    type="button"
                    onClick={idzLewo}
                    className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-white/15 hover:bg-white/30 group-hover:scale-110 active:scale-90 text-white backdrop-blur-md flex items-center justify-center transition-all shadow-xl pointer-events-auto"
                    aria-label="Poprzednie zdjęcie"
                  >
                    <ChevronLeft className="w-7 h-7 sm:w-9 sm:h-9" />
                  </button>
                </div>
              )}

              {/* Cała PRAWA strona ekranu i zdjęcia – kliknięcie w bok przesuwa w prawo! */}
              {ile > 1 && (
                <div
                  onClick={idzPrawo}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label="Następne zdjęcie (kliknij prawy bok)"
                  title="Następne zdjęcie"
                  style={{ pointerEvents: 'auto' }}
                  className="absolute right-0 top-0 bottom-0 w-1/2 z-20 cursor-pointer flex items-center justify-end pr-3 sm:pr-8 group pointer-events-auto"
                >
                  <button
                    type="button"
                    onClick={idzPrawo}
                    className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-white/15 hover:bg-white/30 group-hover:scale-110 active:scale-90 text-white backdrop-blur-md flex items-center justify-center transition-all shadow-xl pointer-events-auto"
                    aria-label="Następne zdjęcie"
                  >
                    <ChevronRight className="w-7 h-7 sm:w-9 sm:h-9" />
                  </button>
                </div>
              )}
            </div>

            {/* Dolny pasek: Miniatury w lightboxie dla szybkiego przeskakiwania */}
            {ile > 1 && (
              <div
                className="p-4 sm:p-6 flex items-center justify-center gap-2 sm:gap-3 overflow-x-auto z-30 shrink-0 pointer-events-auto"
              >
                {zdjecia.map((z, i) => (
                  <button
                    key={z + i}
                    type="button"
                    onClick={() => setFoto(i)}
                    aria-label={`Zdjęcie ${i + 1}`}
                    className={`relative h-12 sm:h-16 w-16 sm:w-24 rounded-lg overflow-hidden border-2 transition-all duration-200 cursor-pointer ${
                      i === teraz
                        ? 'border-white ring-2 ring-white/50 scale-105 shadow-lg'
                        : 'border-white/20 opacity-40 hover:opacity-90 hover:scale-100'
                    }`}
                  >
                    <Zdjecie src={z} gdzie={150} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
