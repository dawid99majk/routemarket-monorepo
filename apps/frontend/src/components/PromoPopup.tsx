import React, { useState, useEffect } from 'react';
import { X, PenTool, MapPin, FileText, Download, Upload, Navigation } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

const STORAGE_KEY = 'promo-popup-dismissed';

export default function PromoPopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem(STORAGE_KEY);
    if (!dismissed) {
      const timer = setTimeout(() => setOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    setOpen(false);
    sessionStorage.setItem(STORAGE_KEY, '1');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden border-0 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={handleClose}
          className="absolute right-3 top-3 z-10 p-1.5 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4 text-foreground" />
        </button>

        <div className="p-6 pb-2 text-center">
          <DialogTitle className="text-xl font-bold text-foreground">
            How does RouteMarket.io work?
          </DialogTitle>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:gap-px bg-border/40">
          {/* Creators column */}
          <div className="bg-background p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">✍️</span>
              <div>
                <p className="text-sm font-bold text-foreground uppercase tracking-wide">For Creators</p>
                <p className="text-xs text-muted-foreground">Earn from your passion</p>
              </div>
            </div>

            <div className="space-y-4 flex-1">
              <Step
                number={1}
                icon={<MapPin className="w-4 h-4 text-primary" />}
                title="Prepare your GPX track"
                desc="Record a route you've traveled or plan a new one in a dedicated tool (e.g. GPX Studio). Ensure track precision."
              />
              <Step
                number={2}
                icon={<FileText className="w-4 h-4 text-primary" />}
                title="Create your guide"
                desc="Prepare a PDF with route details. Add photos, mark the best spots to eat, see, and take the best pictures."
              />
              <Step
                number={3}
                icon={<Upload className="w-4 h-4 text-primary" />}
                title="Publish & earn"
                desc="Upload files, set your price, and share your knowledge. Receive 65% of every sale directly via Stripe."
              />
            </div>

            <p className="text-xs font-semibold text-primary mt-4 pt-3 border-t border-border text-center">
              Your experience is a ready-made product.
            </p>
          </div>

          {/* Explorers column */}
          <div className="bg-background p-5 flex flex-col border-t sm:border-t-0">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">📍</span>
              <div>
                <p className="text-sm font-bold text-foreground uppercase tracking-wide">For Explorers</p>
                <p className="text-xs text-muted-foreground">Discover something new</p>
              </div>
            </div>

            <div className="space-y-4 flex-1">
              <Step
                number={1}
                icon={<PenTool className="w-4 h-4 text-accent-foreground" />}
                title="Find your adventure"
                desc="Browse unique routes using category filters: City, Moto, Auto, or Off-road. Pick what excites you."
              />
              <Step
                number={2}
                icon={<Download className="w-4 h-4 text-accent-foreground" />}
                title="Get the full package"
                desc="After purchase, get instant access to the GPX file and a personal PDF guide prepared by the creator."
              />
              <Step
                number={3}
                icon={<Navigation className="w-4 h-4 text-accent-foreground" />}
                title="Hit the road"
                desc="Load the GPX into your GPS device or favorite navigation app and enjoy the route without getting lost."
              />
            </div>

            <p className="text-xs font-semibold text-primary mt-4 pt-3 border-t border-border text-center">
              Verified routes, zero planning.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Step({ number, icon, title, desc }: { number: number; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
        {number}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {icon}
          <p className="text-sm font-semibold text-foreground">{title}</p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
