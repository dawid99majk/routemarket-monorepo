import { Link } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import Logo from '@/components/Logo';
import Footer from '@/components/Footer';
import logoMark from '@/assets/brand/logo-mark.svg';
import logoWordmark from '@/assets/brand/logo-wordmark.svg';
import { Button } from '@/components/ui/button';

const PALETTE = [
  { name: 'Ink',           hex: '#252521', token: '--foreground' },
  { name: 'Burnt Accent',  hex: '#D4925A', token: '--accent' },
  { name: 'Forest',        hex: '#3B6655', token: '--primary' },
  { name: 'Paper',         hex: '#F7F7F4', token: '--background' },
];

const FILES = [
  { label: 'Logo Mark (SVG)',     href: logoMark,     download: 'routemarket-mark.svg',     bg: 'bg-background' },
  { label: 'Logo + Wordmark (SVG)', href: logoWordmark, download: 'routemarket-wordmark.svg', bg: 'bg-background' },
];

export default function Brand() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/60 bg-card/80 backdrop-blur-lg sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Logo size="md" />
          <Button asChild variant="ghost" size="sm">
            <Link to="/" className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Wróć
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Intro */}
        <div className="mb-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-muted-foreground mb-4">
            Brand · v1.0
          </p>
          <h1 className="font-narrow text-4xl sm:text-5xl uppercase tracking-tight text-foreground" style={{ fontWeight: 700, letterSpacing: '0.01em' }}>
            Route<span className="text-accent">/</span>Market — Identity Kit
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-muted-foreground leading-relaxed">
            Pobierz oficjalne logo, wordmark oraz zestaw kolorów marki. Pliki SVG
            są wektorowe i skalują się bez utraty jakości.
          </p>
        </div>

        {/* Logo previews + downloads */}
        <section className="grid md:grid-cols-2 gap-6 mb-20">
          {FILES.map((f) => (
            <div key={f.label} className="rounded-2xl border border-border/60 overflow-hidden bg-card shadow-token-md">
              <div className={`${f.bg} p-10 flex items-center justify-center min-h-[200px] border-b border-border/60`}>
                <img src={f.href} alt={f.label} className="max-h-24 w-auto" />
              </div>
              <div className="flex items-center justify-between p-4">
                <span className="text-sm font-medium text-foreground">{f.label}</span>
                <Button asChild size="sm" variant="outline" className="gap-2">
                  <a href={f.href} download={f.download}>
                    <Download className="w-3.5 h-3.5" /> SVG
                  </a>
                </Button>
              </div>
            </div>
          ))}
        </section>

        {/* Color palette */}
        <section className="mb-20">
          <h2 className="font-narrow text-xl uppercase tracking-[0.08em] text-foreground mb-6" style={{ fontWeight: 700 }}>
            Color palette
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {PALETTE.map((c) => (
              <div key={c.name} className="rounded-xl border border-border/60 overflow-hidden bg-card shadow-token-sm">
                <div className="h-24" style={{ background: c.hex }} />
                <div className="p-3">
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground tracking-wider mt-1">{c.hex}</p>
                  <p className="font-mono text-[10px] text-muted-foreground/70 mt-0.5">{c.token}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Typography */}
        <section className="mb-20">
          <h2 className="font-narrow text-xl uppercase tracking-[0.08em] text-foreground mb-6" style={{ fontWeight: 700 }}>
            Typography
          </h2>
          <div className="space-y-6 rounded-2xl border border-border/60 bg-card p-8 shadow-token-md">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">Display · Archivo Narrow Bold</p>
              <p className="font-narrow text-3xl uppercase text-foreground" style={{ fontWeight: 700, letterSpacing: '0.02em' }}>
                ROUTE<span className="text-accent">/</span>MARKET
              </p>
            </div>
            <div className="border-t border-border/60 pt-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">Body · Inter</p>
              <p className="text-base text-foreground">Find your next ride. From mountain trails to city streets, water routes and motorcycle adventures.</p>
            </div>
            <div className="border-t border-border/60 pt-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">Mono · JetBrains Mono</p>
              <p className="font-mono text-xs uppercase tracking-[0.32em] text-muted-foreground">FIND · RIDE · EXPLORE</p>
            </div>
          </div>
        </section>

        {/* Usage rules */}
        <section className="mb-20">
          <h2 className="font-narrow text-xl uppercase tracking-[0.08em] text-foreground mb-6" style={{ fontWeight: 700 }}>
            Usage
          </h2>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-3"><span className="text-accent">/</span> Zachowaj minimalny clear-space równy wysokości litery „R" wokół znaku.</li>
            <li className="flex gap-3"><span className="text-accent">/</span> Nie obracaj, nie skaluj nieproporcjonalnie i nie zmieniaj kolorów akcentu.</li>
            <li className="flex gap-3"><span className="text-accent">/</span> Na ciemnym tle używaj wariantu z jasnym wordmarkiem (skontaktuj się po dodatkowe pliki).</li>
            <li className="flex gap-3"><span className="text-accent">/</span> Slash „/" w nazwie jest częścią marki — nigdy go nie usuwaj.</li>
          </ul>
        </section>
      </main>

      <Footer />
    </div>
  );
}