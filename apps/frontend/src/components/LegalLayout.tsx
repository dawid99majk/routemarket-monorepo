import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Logo from '@/components/Logo';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { LEGAL_DOCS, type LegalDocMeta } from '@/lib/legal-meta';

interface LegalLayoutProps {
  docKey: string;
  children: React.ReactNode;
}

export default function LegalLayout({ docKey, children }: LegalLayoutProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const meta: LegalDocMeta | undefined = LEGAL_DOCS[docKey];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> {t('common.back')}
          </Button>
          <Logo size="sm" />
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {meta && (
          <div className="flex flex-wrap items-center gap-3 mb-6 text-xs text-muted-foreground">
            <span>{t('legal.version')}: {meta.version}</span>
            <span>·</span>
            <span>{t('legal.published_at')}: {meta.publishedAt}</span>
          </div>
        )}
        <article className="prose prose-neutral dark:prose-invert max-w-none">
          {children}
        </article>
      </main>

      <Footer />
    </div>
  );
}
