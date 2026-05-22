import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Clock, CalendarDays, CheckCircle2, AlertTriangle, ChevronRight, HelpCircle, Sparkles, Map, Compass, CreditCard, BookOpen, FileText, Globe, Link2, Share2, BookMarked, Check } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import type { GuideArticle } from '@/lib/guide-hub-data';
import { getAdjacentArticles, getRelatedArticles } from '@/lib/guide-hub-data';
import { trackEvent } from '@/lib/analytics';
import GuideFeedbackWidget from '@/components/GuideFeedbackWidget';

const ICON_MAP: Record<string, React.ElementType> = {
  Map, Compass, CreditCard, BookOpen, FileText, Globe, HelpCircle,
};

interface Props {
  article: GuideArticle;
  onBack: () => void;
  onNavigate: (slug: string) => void;
  isRead: boolean;
  onMarkAsRead: (slug: string) => void;
}

export default function GuideArticleView({ article, onBack, onNavigate, isRead, onMarkAsRead }: Props) {
  const { prev, next } = getAdjacentArticles(article.slug);
  const relatedArticles = getRelatedArticles(article.slug);
  const Icon = ICON_MAP[article.icon] || HelpCircle;
  const tabLabel = article.tab === 'explorers' ? 'Explorers' : 'Creators';

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [markedRead, setMarkedRead] = useState(isRead);

  // Track guide_opened
  useEffect(() => {
    trackEvent({ event: 'guide_opened', metadata: { slug: article.slug, tab: article.tab } });
  }, [article.slug]);

  // Scroll progress
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const pct = scrollHeight <= clientHeight ? 100 : Math.round((scrollTop / (scrollHeight - clientHeight)) * 100);
      setScrollProgress(pct);
      if (pct >= 90 && !markedRead) {
        trackEvent({ event: 'guide_completed', metadata: { slug: article.slug } });
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [article.slug, markedRead]);

  const handleMarkRead = useCallback(() => {
    onMarkAsRead(article.slug);
    setMarkedRead(true);
    toast.success('Marked as read');
  }, [article.slug, onMarkAsRead]);

  const handleCopyLink = useCallback(() => {
    const url = `${window.location.origin}/?guide=${article.slug}`;
    navigator.clipboard.writeText(url).then(() => toast.success('Link copied!'));
  }, [article.slug]);

  const handleShare = useCallback(async () => {
    trackEvent({ event: 'guide_shared', metadata: { slug: article.slug } });
    const url = `${window.location.origin}/?guide=${article.slug}`;
    if (navigator.share) {
      try { await navigator.share({ title: article.title, url }); } catch {}
    } else {
      navigator.clipboard.writeText(url).then(() => toast.success('Link copied!'));
    }
  }, [article.slug, article.title]);

  const handleNav = useCallback((slug: string) => {
    onNavigate(slug);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [onNavigate]);

  const readTimeLeft = Math.max(1, Math.round(article.readingTimeMinutes * (1 - scrollProgress / 100)));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sticky header with title + quick actions */}
      <div className="shrink-0 border-b border-border bg-background/95 backdrop-blur-sm z-10">
        {/* Progress bar */}
        <Progress value={scrollProgress} className="h-0.5 rounded-none" />

        {/* Breadcrumb + title row */}
        <div className="px-4 sm:px-6 py-3 flex items-center gap-2">
          <button
            onClick={onBack}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Back to Guide Hub"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex-1 min-w-0">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span>Guide Hub</span>
              <ChevronRight className="w-3 h-3" />
              <span>{tabLabel}</span>
            </nav>
            <h2 className="text-sm font-bold text-foreground truncate">{article.title}</h2>
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleCopyLink}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Copy link"
            >
              <Link2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleShare}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Share guide"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 pb-6">
        {/* Header */}
        <div className="flex items-start gap-3 mt-4 mb-4">
          <div className="shrink-0 w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            {article.tag && (
              <Badge variant="secondary" className="text-[10px] mb-1">{article.tag}</Badge>
            )}
            <h2 className="text-lg font-bold text-foreground leading-tight">{article.title}</h2>
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{readTimeLeft} min left</span>
              <span className="inline-flex items-center gap-1"><CalendarDays className="w-3 h-3" />Updated {article.lastUpdated}</span>
              {markedRead ? (
                <span className="inline-flex items-center gap-1 text-primary font-medium"><Check className="w-3 h-3" />Read</span>
              ) : (
                <button
                  onClick={handleMarkRead}
                  className="inline-flex items-center gap-1 hover:text-primary transition-colors min-h-[44px]"
                >
                  <BookMarked className="w-3 h-3" /> Mark as read
                </button>
              )}
            </div>
          </div>
        </div>

        <Separator className="mb-5" />

        {/* TL;DR */}
        <section className="mb-6" aria-labelledby="tldr-heading">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <h3 id="tldr-heading" className="text-xs font-bold uppercase tracking-wider text-primary mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> TL;DR
            </h3>
            <p className="text-sm text-foreground leading-relaxed">{article.tldr}</p>
          </div>
        </section>

        {/* Steps */}
        <section className="mb-6" aria-labelledby="steps-heading">
          <h3 id="steps-heading" className="text-sm font-bold text-foreground mb-3">Step-by-step guide</h3>
          <ol className="space-y-3">
            {article.steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{step.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Common mistakes */}
        <section className="mb-6" aria-labelledby="mistakes-heading">
          <h3 id="mistakes-heading" className="text-sm font-bold text-foreground mb-3 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-warning" /> Common mistakes
          </h3>
          <ul className="space-y-2">
            {article.commonMistakes.map((m, i) => (
              <li key={i} className="text-xs text-muted-foreground leading-relaxed pl-4 border-l-2 border-warning/40">
                {m}
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ */}
        <section className="mb-6" aria-labelledby="faq-heading">
          <h3 id="faq-heading" className="text-sm font-bold text-foreground mb-3">FAQ</h3>
          <Accordion type="single" collapsible className="w-full">
            {article.faq.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-sm text-left min-h-[44px]">{item.question}</AccordionTrigger>
                <AccordionContent className="text-xs text-muted-foreground leading-relaxed">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* Checklist */}
        <section className="mb-6" aria-labelledby="checklist-heading">
          <h3 id="checklist-heading" className="text-sm font-bold text-foreground mb-3 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-primary" /> Practical checklist
          </h3>
          <ul className="space-y-1.5">
            {article.checklist.map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground min-h-[36px]">
                <div className="w-4 h-4 rounded border border-border shrink-0" />
                {item.label}
              </li>
            ))}
          </ul>
        </section>

        {/* Feedback widget */}
        <section className="mb-6">
          <GuideFeedbackWidget articleSlug={article.slug} />
        </section>

        {/* CTA */}
        <section className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-center mb-6" aria-labelledby="cta-heading">
          <h3 id="cta-heading" className="text-base font-bold text-foreground mb-1">{article.ctaTitle}</h3>
          <p className="text-xs text-muted-foreground mb-3">{article.ctaDescription}</p>
          <Button size="sm" asChild className="min-h-[44px]">
            <a href={article.ctaButtonHref}>{article.ctaButtonLabel}</a>
          </Button>
        </section>

        {/* Related guides */}
        {relatedArticles.length > 0 && (
          <section className="mb-6" aria-labelledby="related-heading">
            <h3 id="related-heading" className="text-sm font-bold text-foreground mb-3">Related guides</h3>
            <div className="space-y-2">
              {relatedArticles.map((r) => {
                const RIcon = ICON_MAP[r.icon] || HelpCircle;
                return (
                  <button
                    key={r.slug}
                    onClick={() => handleNav(r.slug)}
                    className="w-full text-left flex items-center gap-3 rounded-lg border border-border p-3 hover:border-primary/30 hover:shadow-sm transition-all min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <RIcon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                      <p className="text-[11px] text-muted-foreground">{r.readingTimeMinutes} min read</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Prev / Next */}
        <div className="flex items-center justify-between gap-2 pt-2 pb-4">
          {prev ? (
            <button
              onClick={() => handleNav(prev.slug)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              aria-label={`Previous: ${prev.title}`}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="truncate max-w-[140px]">{prev.title}</span>
            </button>
          ) : <span />}
          {next ? (
            <button
              onClick={() => handleNav(next.slug)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              aria-label={`Next: ${next.title}`}
            >
              <span className="truncate max-w-[140px]">{next.title}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : <span />}
        </div>
      </div>
    </div>
  );
}
