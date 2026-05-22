import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import BrandGlyph from "@/components/BrandGlyph";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background bg-contour-soft">
      <div className="text-center px-6">
        <BrandGlyph name="compass" size={56} className="mx-auto mb-6 opacity-70" />
        <p className="eyebrow mb-3">404 · off-trail</p>
        <h1 className="font-display font-light mb-3 text-5xl tracking-tight">Tej ścieżki nie ma na mapie.</h1>
        <p className="mb-6 text-base text-muted-foreground">Strona, której szukasz, nie istnieje lub została przeniesiona.</p>
        <a href="/" className="text-primary underline-offset-4 hover:underline">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
