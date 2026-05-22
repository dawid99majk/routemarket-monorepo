import { useState, useMemo, useEffect, useRef } from 'react';
import { HelpCircle, Search, X, Compass, Palette, Sparkles, Map, CreditCard, BookOpen, FileText, Globe, Star } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { guideArticles, getArticlesByTab, searchArticles, type GuideArticle } from '@/lib/guide-hub-data';
import { useGuideProgress } from '@/hooks/use-guide-progress';
import GuideArticleView from '@/components/GuideArticleView';

const ICON_MAP: Record<string, React.ElementType> = {
  Map, Compass, CreditCard, BookOpen, FileText, Globe, HelpCircle,
};

function ArticleCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
        </div>
      </div>
    </div>
  );
}

function ArticleCard({ article, onClick }: { article: GuideArticle; onClick: () => void }) {
  const Icon = ICON_MAP[article.icon] || HelpCircle;
  return (
    <button
      onClick={onClick}
      className="w-full text-left group rounded-xl border border-border bg-card p-4 transition-all hover:shadow-md hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[44px]"
      aria-label={`Read article: ${article.title}`}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            {article.startHere && (
              <Badge variant="default" className="text-[9px] px-1.5 py-0 h-4 gap-0.5">
                <Star className="w-2.5 h-2.5" /> Start here
              </Badge>
            )}
            {article.tag && (
              <span className="inline-block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {article.tag}
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-foreground leading-snug group-hover:text-primary transition-colors">
            {article.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{article.description}</p>
        </div>
      </div>
    </button>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
      <Search className="w-10 h-10 text-muted-foreground/40 mb-3" />
      <p className="text-sm font-medium text-foreground mb-1">No guides found</p>
      <p className="text-xs text-muted-foreground">
        No results for "<span className="font-medium">{query}</span>". Try a different keyword.
      </p>
    </div>
  );
}

export default function GuideHub() {
  const [open, setOpen] = useState(false);
  const [activeArticle, setActiveArticle] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'explorers' | 'creators'>('explorers');
  const searchRef = useRef<HTMLInputElement>(null);
  const { isRead, markAsRead } = useGuideProgress();

  // Simulate loading on open
  useEffect(() => {
    if (open) {
      setLoading(true);
      const t = setTimeout(() => setLoading(false), 400);
      return () => clearTimeout(t);
    } else {
      setActiveArticle(null);
      setSearchQuery('');
    }
  }, [open]);

  const filteredArticles = useMemo(() => {
    if (!searchQuery.trim()) return null; // null = show tab-based view
    return searchArticles(searchQuery);
  }, [searchQuery]);

  const explorerArticles = useMemo(() => getArticlesByTab('explorers'), []);
  const creatorArticles = useMemo(() => getArticlesByTab('creators'), []);

  const currentArticle = useMemo(
    () => (activeArticle ? guideArticles.find((a) => a.slug === activeArticle) : null),
    [activeArticle]
  );

  const handleOpenArticle = (slug: string) => {
    setActiveArticle(slug);
  };

  const handleBack = () => {
    setActiveArticle(null);
  };

  const renderCards = (articles: GuideArticle[]) => {
    if (loading) {
      return (
        <div className="space-y-3">
          <ArticleCardSkeleton />
          <ArticleCardSkeleton />
          <ArticleCardSkeleton />
        </div>
      );
    }
    if (articles.length === 0) {
      return <EmptyState query={searchQuery} />;
    }
    return (
      <div className="space-y-3">
        {articles.map((a) => (
          <ArticleCard key={a.slug} article={a} onClick={() => handleOpenArticle(a.slug)} />
        ))}
      </div>
    );
  };

  return (
    <>
      {/* Expandable FAB — icon-only, expands on hover/focus */}
      <button
        onClick={() => setOpen(true)}
        className="group fixed right-4 bottom-4 z-[1300] flex items-center h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 ease-out pl-4 pr-4 hover:pr-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        aria-label="Open Guide Hub"
      >
        <HelpCircle className="w-5 h-5 shrink-0" />
        <span className="overflow-hidden max-w-0 group-hover:max-w-[160px] group-focus-visible:max-w-[160px] opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-hover:ml-2 group-focus-visible:ml-2 text-sm font-semibold whitespace-nowrap transition-all duration-300 ease-out">
          How it works
        </span>
      </button>

      {/* Drawer */}
      {open && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="right"
            className="w-full sm:w-[440px] sm:max-w-[440px] p-0 flex flex-col"
          >
            {currentArticle ? (
              /* ── Article detail view ── */
              <GuideArticleView
                article={currentArticle}
                onBack={handleBack}
                onNavigate={handleOpenArticle}
                isRead={isRead(currentArticle.slug)}
                onMarkAsRead={markAsRead}
              />
            ) : (
              /* ── List view ── */
              <>
                <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <SheetTitle className="text-lg font-bold">Guide Hub</SheetTitle>
                      <p className="text-xs text-muted-foreground">Learn how to get the most out of RouteMarket</p>
                    </div>
                  </div>
                </SheetHeader>

                {/* Search */}
                <div className="px-6 pt-4 pb-2 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      ref={searchRef}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search guides…"
                      className="pl-9 pr-8 h-9 text-sm"
                      aria-label="Search guides"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => { setSearchQuery(''); searchRef.current?.focus(); }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {filteredArticles ? (
                  /* ── Search results (cross-tab) ── */
                  <div className="flex-1 overflow-y-auto px-6 py-4">
                    <p className="text-xs text-muted-foreground mb-3">
                      {filteredArticles.length} result{filteredArticles.length !== 1 ? 's' : ''}
                    </p>
                    {renderCards(filteredArticles)}
                  </div>
                ) : (
                  /* ── Tabbed view ── */
                  <Tabs
                    value={activeTab}
                    onValueChange={(v) => setActiveTab(v as 'explorers' | 'creators')}
                    className="flex-1 flex flex-col overflow-hidden"
                  >
                    <div className="px-6 pt-2 shrink-0">
                      <TabsList className="w-full grid grid-cols-2">
                        <TabsTrigger value="explorers" className="text-sm">
                          <Compass className="w-4 h-4 mr-1.5" />
                          Explorers
                        </TabsTrigger>
                        <TabsTrigger value="creators" className="text-sm">
                          <Palette className="w-4 h-4 mr-1.5" />
                          Creators
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent value="explorers" className="flex-1 overflow-y-auto px-6 py-4 mt-0">
                      {renderCards(explorerArticles)}
                    </TabsContent>

                    <TabsContent value="creators" className="flex-1 overflow-y-auto px-6 py-4 mt-0">
                      {renderCards(creatorArticles)}
                    </TabsContent>
                  </Tabs>
                )}
              </>
            )}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
