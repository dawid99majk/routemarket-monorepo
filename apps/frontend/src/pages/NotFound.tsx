import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import BrandGlyph from "@/components/BrandGlyph";

/**
 * 404 z trzema wyjściami z powrotem w produkt, nie jednym „wróć na stronę główną"
 * (kierunek „Wyprawa", zadanie Z10). Jedno wyjście na stronę główną odsyłało
 * zalogowanego użytkownika na landing sprzedażowy, czyli dalej od tego, po co
 * przyszedł. Kod błędu jest małym napisem nad nagłówkiem, nie wielką cyfrą --
 * numer nic nie mówi osobie, która trafiła tu z popsutego odnośnika.
 */
const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background bg-contour-soft">
      <div className="text-center px-6">
        <BrandGlyph name="compass" size={56} className="mx-auto mb-6 opacity-70" />
        <p className="font-mono text-[12px] text-accent mb-3">404 · poza szlakiem</p>
        <h1 className="font-display font-light mb-3 text-5xl tracking-tight">Tej ścieżki nie ma na mapie.</h1>
        <p className="mb-8 text-base text-muted-foreground max-w-[46ch] mx-auto text-pretty">
          Strona, której szukasz, nie istnieje lub została przeniesiona.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <button onClick={() => navigate('/plany')}
            className="h-10 rounded-full bg-foreground text-background px-5 text-sm
                       hover:bg-foreground/90 transition-colors">
            Twoje wyjazdy
          </button>
          <button onClick={() => navigate('/odkrywaj')}
            className="h-10 rounded-full border border-border px-5 text-sm
                       hover:bg-muted transition-colors">
            Odkrywaj
          </button>
          <button onClick={() => navigate('/tablice')}
            className="h-10 rounded-full border border-border px-5 text-sm
                       hover:bg-muted transition-colors">
            Inspiracje
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
