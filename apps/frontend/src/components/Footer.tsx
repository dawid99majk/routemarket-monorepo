import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Logo from '@/components/Logo';
import { SUPPORTED_UI_LANGUAGES } from '@/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Globe, ChevronDown } from 'lucide-react';

export default function Footer() {
  const { t, i18n } = useTranslation();
  const year = new Date().getFullYear();
  const currentLang =
    SUPPORTED_UI_LANGUAGES.find((l) => l.code === i18n.language) ??
    SUPPORTED_UI_LANGUAGES.find((l) => i18n.language?.startsWith(l.code)) ??
    SUPPORTED_UI_LANGUAGES[0];

  return (
    <footer className="border-t border-border/60 bg-background mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-12 lg:gap-16">
          <div className="flex flex-col gap-3">
            <Logo size="md" />
            <p className="text-xs text-muted-foreground">
              © {year} RouteMarket.io. {t('legal.all_rights_reserved')}
            </p>
            <Link to="/brand" className="text-[11px] text-muted-foreground/80 hover:text-foreground transition-colors uppercase tracking-[0.18em] font-mono">
              Brand assets ↗
            </Link>
          </div>

          <div className="flex flex-col gap-5 items-start sm:items-end">
            <nav className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-muted-foreground">
              <Link to="/legal/terms" className="hover:text-foreground transition-colors">
                {t('legal.terms')}
              </Link>
              <Link to="/legal/privacy" className="hover:text-foreground transition-colors">
                {t('legal.privacy')}
              </Link>
              <Link to="/legal/cookies" className="hover:text-foreground transition-colors">
                {t('legal.cookies')}
              </Link>
              <Link to="/legal/refunds" className="hover:text-foreground transition-colors">
                {t('legal.refunds')}
              </Link>
              <Link to="/legal/documents" className="hover:text-foreground transition-colors">
                Documents
              </Link>
              <Link to="/contact" className="hover:text-foreground transition-colors">
                Contact
              </Link>
            </nav>
            <div className="flex flex-wrap items-center gap-4 sm:justify-end">
              <a
                href="mailto:contact@routemarket.io"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                contact@routemarket.io
              </a>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-2 text-xs"
                    aria-label="Change language"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>{currentLang.flag}</span>
                    <span>{currentLang.label}</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[180px] max-h-[320px] overflow-y-auto">
                  {SUPPORTED_UI_LANGUAGES.map((lang) => (
                    <DropdownMenuItem
                      key={lang.code}
                      onClick={() => i18n.changeLanguage(lang.code)}
                      className={i18n.language === lang.code ? 'bg-accent' : ''}
                    >
                      <span className="mr-2">{lang.flag}</span>
                      {lang.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
