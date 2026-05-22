import React from 'react';
import Logo from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface CreatorLayoutProps {
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  banner?: React.ReactNode;
  showLogo?: boolean;
  exitPath?: string;
  exitLabel?: string;
}

export function CreatorLayout({ 
  children, 
  headerRight, 
  banner, 
  showLogo = true,
  exitPath = '/creator-dashboard',
  exitLabel = 'Panel twórcy'
}: CreatorLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            {showLogo && <Logo size="sm" />}
            {showLogo && (
              <>
                <div className="h-4 w-px bg-border hidden sm:block" />
                <span className="text-xs font-medium text-muted-foreground hidden sm:block uppercase tracking-widest">
                  AI Studio Workspace
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {headerRight}
            {exitPath && (
              <Button onClick={() => navigate(exitPath)} variant="outline" size="sm">
                {exitLabel}
              </Button>
            )}
          </div>
        </div>
      </header>

      {banner}

      <main className="mx-auto max-w-7xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}
