export interface GuideChecklistItem {
  label: string;
  checked?: boolean;
}

export interface GuideFAQItem {
  question: string;
  answer: string;
}

export interface GuideStep {
  title: string;
  description: string;
}

export interface GuideArticle {
  slug: string;
  title: string;
  description: string;
  icon: string; // lucide icon name
  tag?: string;
  tab: 'explorers' | 'creators';
  readingTimeMinutes: number;
  lastUpdated: string;
  keywords: string[];
  tldr: string;
  steps: GuideStep[];
  commonMistakes: string[];
  faq: GuideFAQItem[];
  checklist: GuideChecklistItem[];
  ctaTitle: string;
  ctaDescription: string;
  ctaButtonLabel: string;
  ctaButtonHref: string;
  startHere?: boolean;
  relatedSlugs?: string[];
}

export const guideArticles: GuideArticle[] = [
  // ── Explorers ──
  {
    slug: 'how-to-use-gpx-files',
    title: 'How to use GPX files?',
    description: 'Learn how to import GPX tracks into your favourite navigation app and hit the trail.',
    icon: 'Map',
    tag: 'Getting Started',
    tab: 'explorers',
    startHere: true,
    relatedSlugs: ['top-navigation-apps', 'global-payments-faq'],
    readingTimeMinutes: 5,
    lastUpdated: '2026-03-20',
    keywords: ['gpx', 'import', 'navigation', 'garmin', 'komoot', 'strava'],
    tldr: 'A GPX file is a universal GPS track format. After purchasing a route, download the .gpx file and import it into any compatible app (Komoot, Strava, Garmin Connect, OsmAnd) to get turn-by-turn guidance on your adventure.',
    steps: [
      { title: 'Purchase & download the route', description: 'Go to "My Routes", find your purchase, and tap the GPX download button. The file will save to your device.' },
      { title: 'Choose a navigation app', description: 'Open your preferred app — Komoot, Strava, Garmin Connect, OsmAnd, or Locus Map all support GPX imports.' },
      { title: 'Import the GPX file', description: 'Most apps have an "Import" or "Open file" option. On mobile, you can also tap the downloaded file and choose "Open with…" to pick your app.' },
      { title: 'Review the route on the map', description: 'Check the track overlay, elevation profile, and any waypoints before you head out.' },
      { title: 'Start navigating', description: 'Hit "Navigate" or "Start" in your app. Make sure GPS is enabled and you have offline maps downloaded for remote areas.' },
    ],
    commonMistakes: [
      'Forgetting to download offline maps — GPS tracks work without cell service, but the basemap won\'t load.',
      'Not checking the file format — some older devices need .fit instead of .gpx. Use a free converter if needed.',
      'Skipping the elevation profile — a flat-looking route on the map might still have 1,500 m of climbing.',
      'Ignoring waypoints — creators often add POIs (water, shelters, viewpoints) that are easy to miss if you only follow the line.',
    ],
    faq: [
      { question: 'Can I use GPX files without internet?', answer: 'Yes! Once imported, the track works offline. Just make sure you download offline map tiles in your app beforehand.' },
      { question: 'Which app is best for GPX navigation?', answer: 'It depends on your activity. Komoot is great for hiking & cycling, OsmAnd for off-road, and Garmin Connect for watch integration.' },
      { question: 'Can I edit the GPX route?', answer: 'Most apps let you trim, reverse, or add waypoints after importing. This is useful for adapting routes to your starting point.' },
    ],
    checklist: [
      { label: 'Download the GPX file from My Routes' },
      { label: 'Install a compatible navigation app' },
      { label: 'Import the file into the app' },
      { label: 'Download offline maps for the area' },
      { label: 'Check the elevation profile' },
      { label: 'Charge your phone / device' },
      { label: 'Share your itinerary with someone' },
    ],
    ctaTitle: 'Ready to explore?',
    ctaDescription: 'Browse hundreds of curated routes from local creators around the world.',
    ctaButtonLabel: 'Browse Routes',
    ctaButtonHref: '/',
  },
  {
    slug: 'top-navigation-apps',
    title: 'Top Navigation Apps',
    description: 'A curated list of the best apps for hiking, cycling, and trail running with GPX support.',
    icon: 'Compass',
    tag: 'Recommended',
    tab: 'explorers',
    relatedSlugs: ['how-to-use-gpx-files', 'global-payments-faq'],
    readingTimeMinutes: 4,
    lastUpdated: '2026-03-18',
    keywords: ['apps', 'komoot', 'strava', 'garmin', 'osmand', 'alltrails', 'navigation'],
    tldr: 'The best GPX-compatible navigation apps are Komoot (hiking & cycling), OsmAnd (offline & off-road), Strava (performance tracking), Garmin Connect (device sync), and Locus Map (advanced users). Each has free tiers and handles GPX imports.',
    steps: [
      { title: 'Komoot — Best for hiking & cycling', description: 'Beautiful maps, voice navigation, and a massive community. Free for one region; unlock all maps with a one-time purchase.' },
      { title: 'OsmAnd — Best for offline & off-road', description: 'Open-source, fully offline maps based on OpenStreetMap. Highly customizable with plugins for contour lines, slope shading, and more.' },
      { title: 'Strava — Best for performance tracking', description: 'Ideal if you care about segments, splits, and competing with others. GPX import is available on the website and in-app.' },
      { title: 'Garmin Connect — Best for watch users', description: 'Syncs GPX courses directly to Garmin watches and bike computers. Great for turn-by-turn on your wrist.' },
      { title: 'Locus Map — Best for power users', description: 'Supports multiple map layers, track recording, geocaching, and detailed route planning. Popular in Central Europe.' },
    ],
    commonMistakes: [
      'Using Google Maps for trail navigation — it lacks off-road trails and doesn\'t support GPX.',
      'Not testing the app before your trip — familiarise yourself with the interface at home first.',
      'Relying only on your phone — bring a power bank or a dedicated GPS device for long adventures.',
    ],
    faq: [
      { question: 'Are these apps free?', answer: 'All have free tiers. Premium features (offline maps, advanced stats) usually cost €3-6/month or a one-time purchase.' },
      { question: 'Which app works best with RouteMarket GPX files?', answer: 'All of them! Our GPX files follow the universal standard. Komoot and OsmAnd are our most popular choices.' },
      { question: 'Can I use Apple or Google Maps?', answer: 'Neither supports GPX imports natively. You\'ll need a dedicated outdoor app for the best experience.' },
    ],
    checklist: [
      { label: 'Pick an app that matches your activity' },
      { label: 'Create a free account' },
      { label: 'Download offline maps for your area' },
      { label: 'Test a GPX import at home' },
      { label: 'Enable battery saver mode' },
    ],
    ctaTitle: 'Got your app ready?',
    ctaDescription: 'Find your next adventure and import the GPX in seconds.',
    ctaButtonLabel: 'Explore Routes',
    ctaButtonHref: '/',
  },
  {
    slug: 'global-payments-faq',
    title: 'Global Payments FAQ',
    description: 'Everything you need to know about currencies, refunds, and secure checkout.',
    icon: 'CreditCard',
    tag: 'Payments',
    tab: 'explorers',
    relatedSlugs: ['how-to-use-gpx-files', 'top-navigation-apps'],
    readingTimeMinutes: 3,
    lastUpdated: '2026-03-15',
    keywords: ['payment', 'stripe', 'currency', 'refund', 'checkout', 'secure', 'price'],
    tldr: 'RouteMarket uses Stripe for secure payments. Prices are shown in your local currency, all transactions are encrypted, and refunds are available within 14 days if you haven\'t downloaded the GPX file.',
    steps: [
      { title: 'Browse and select a route', description: 'Prices are displayed in your detected currency (EUR, USD, GBP, PLN, and more). The conversion is automatic.' },
      { title: 'Proceed to checkout', description: 'Click "Buy Route" and you\'ll be redirected to a secure Stripe checkout page. We never see or store your card details.' },
      { title: 'Complete payment', description: 'Pay with credit/debit card, Apple Pay, Google Pay, or local methods like BLIK (Poland) or iDEAL (Netherlands).' },
      { title: 'Access your route instantly', description: 'After payment, the route appears in "My Routes" with full GPX & PDF downloads available immediately.' },
    ],
    commonMistakes: [
      'Thinking the price changed — currency fluctuations can cause small differences between browsing and checkout.',
      'Not checking your spam folder — the purchase confirmation email sometimes lands there.',
      'Requesting a refund after downloading — once the GPX file is downloaded, refund eligibility expires.',
    ],
    faq: [
      { question: 'Is my payment secure?', answer: 'Yes. We use Stripe, which is PCI Level 1 certified — the highest level of payment security.' },
      { question: 'Can I get a refund?', answer: 'Yes, within 14 days of purchase, as long as you haven\'t downloaded the GPX or PDF files. See our Refund Policy for details.' },
      { question: 'Which currencies are supported?', answer: 'We support EUR, USD, GBP, PLN, CZK, CHF, SEK, NOK, and more. Your currency is detected automatically.' },
      { question: 'Do I get an invoice?', answer: 'Yes. A receipt is emailed to you after each purchase and is also available in your account settings.' },
    ],
    checklist: [
      { label: 'Check the price in your currency' },
      { label: 'Review the route details before buying' },
      { label: 'Complete checkout via Stripe' },
      { label: 'Check your email for confirmation' },
      { label: 'Download GPX & PDF from My Routes' },
    ],
    ctaTitle: 'Questions about a purchase?',
    ctaDescription: 'Our support team is here to help with any payment issues.',
    ctaButtonLabel: 'Contact Support',
    ctaButtonHref: '/contact',
  },

  // ── Creators ──
  {
    slug: 'how-to-sell-your-routes',
    title: 'How to sell your routes?',
    description: 'Step-by-step guide to publishing, pricing, and promoting your outdoor routes.',
    icon: 'BookOpen',
    tag: 'Essentials',
    tab: 'creators',
    startHere: true,
    relatedSlugs: ['creating-high-quality-pdfs', 'global-ai-translations'],
    readingTimeMinutes: 6,
    lastUpdated: '2026-03-22',
    keywords: ['sell', 'publish', 'pricing', 'creator', 'earn', 'monetize', 'promote'],
    tldr: 'Become a creator, upload your GPX track, add a compelling description and photos, set your price, and publish. RouteMarket handles payments, currency conversion, and delivery — you earn 85% of each sale.',
    steps: [
      { title: 'Apply to become a creator', description: 'Go to "Become a Creator" and fill in your profile. Approval is usually instant for verified accounts.' },
      { title: 'Connect your Stripe account', description: 'Link your bank account through Stripe Connect so you can receive payouts in your local currency.' },
      { title: 'Create a new route', description: 'Upload your GPX file, add a cover photo, write a description, and fill in route details (distance, elevation, difficulty).' },
      { title: 'Set your price', description: 'Choose a price between €1 and €50. Consider the route\'s uniqueness, length, and the effort you put into the guide.' },
      { title: 'Add a PDF guide (optional)', description: 'Upload a detailed PDF with tips, photos, and local recommendations. Routes with PDF guides sell 3× better.' },
      { title: 'Publish and promote', description: 'Hit publish and share the link on social media, forums, and outdoor communities. Your route is now live worldwide.' },
    ],
    commonMistakes: [
      'Skipping the description — a GPX file alone won\'t convince buyers. Write about what makes the route special.',
      'Pricing too high for a bare route — if you only upload a GPX without photos or a guide, keep the price low (€1-3).',
      'Not adding a cover photo — routes without images get 80% fewer clicks.',
      'Forgetting to test the GPX — always verify your track in a navigation app before uploading.',
    ],
    faq: [
      { question: 'How much do I earn per sale?', answer: 'You keep 85% of each sale. Stripe processing fees (≈2.9%) are deducted from the remaining 15% platform fee.' },
      { question: 'Can I sell the same route on other platforms?', answer: 'Yes, you retain full ownership. RouteMarket is non-exclusive.' },
      { question: 'How do payouts work?', answer: 'Stripe sends payouts to your bank account on a rolling basis (typically every 7 days after your first sale).' },
      { question: 'Can I update my route after publishing?', answer: 'Absolutely. You can edit the description, replace files, and adjust the price at any time.' },
    ],
    checklist: [
      { label: 'Apply as a creator' },
      { label: 'Connect Stripe for payouts' },
      { label: 'Upload a tested GPX file' },
      { label: 'Write a compelling description (200+ words)' },
      { label: 'Add at least one high-quality cover photo' },
      { label: 'Set a fair price' },
      { label: 'Upload a PDF guide for premium value' },
      { label: 'Publish and share on social media' },
    ],
    ctaTitle: 'Start earning today',
    ctaDescription: 'Turn your adventures into income. Join our creator community.',
    ctaButtonLabel: 'Become a Creator',
    ctaButtonHref: '/become-creator',
  },
  {
    slug: 'creating-high-quality-pdfs',
    title: 'Creating high-quality PDFs',
    description: 'Tips on formatting professional route guides that buyers will love.',
    icon: 'FileText',
    tag: 'Content',
    tab: 'creators',
    relatedSlugs: ['how-to-sell-your-routes', 'global-ai-translations'],
    readingTimeMinutes: 5,
    lastUpdated: '2026-03-19',
    keywords: ['pdf', 'guide', 'format', 'template', 'design', 'content', 'quality'],
    tldr: 'A well-crafted PDF guide transforms a simple GPX track into a premium product. Include an overview map, day-by-day breakdown, local tips, gear recommendations, and high-resolution photos to maximise buyer satisfaction and reviews.',
    steps: [
      { title: 'Start with a cover page', description: 'Include the route name, a hero photo, distance, duration, and difficulty. First impressions matter.' },
      { title: 'Add an overview map', description: 'Screenshot the full route from a mapping app and annotate key waypoints. Include start/end points and notable landmarks.' },
      { title: 'Write a day-by-day breakdown', description: 'For multi-day routes, break the itinerary into stages with distances, elevation, and estimated times for each.' },
      { title: 'Include local tips', description: 'Recommend restaurants, water sources, camping spots, and hidden gems. This is the content buyers can\'t find on Google.' },
      { title: 'Add gear & preparation notes', description: 'List recommended equipment, clothing, permits needed, and any seasonal considerations.' },
      { title: 'Use consistent formatting', description: 'Stick to 2-3 fonts, use headers and bullet points, and keep the layout clean. Tools like Canva or Google Docs work great.' },
    ],
    commonMistakes: [
      'Using low-resolution images — they look blurry when printed. Aim for at least 1500px wide.',
      'Writing walls of text — use short paragraphs, bullet points, and visual breaks.',
      'Forgetting practical info — buyers want water sources, toilets, and parking, not just scenery descriptions.',
      'Not proofreading — typos and broken formatting hurt your credibility.',
    ],
    faq: [
      { question: 'What tool should I use to create the PDF?', answer: 'Canva (free) is great for visual guides. Google Docs or Notion work for text-heavy guides. Export as PDF when done.' },
      { question: 'How long should the guide be?', answer: '4-12 pages is the sweet spot. Enough detail to be useful, not so long that it\'s overwhelming.' },
      { question: 'Should I include the GPX map in the PDF?', answer: 'Yes! Include a static overview map. Buyers will have the interactive GPX separately, but a visual reference in the PDF is very helpful.' },
    ],
    checklist: [
      { label: 'Design a cover page with hero photo' },
      { label: 'Include an annotated overview map' },
      { label: 'Write a clear day-by-day itinerary' },
      { label: 'Add local tips & hidden gems' },
      { label: 'List gear & preparation notes' },
      { label: 'Use consistent fonts and formatting' },
      { label: 'Export as PDF (not Word/Pages)' },
      { label: 'Proofread everything twice' },
    ],
    ctaTitle: 'Upload your guide',
    ctaDescription: 'Routes with PDF guides sell 3× better. Add yours now.',
    ctaButtonLabel: 'Go to Creator Dashboard',
    ctaButtonHref: '/creator/dashboard',
  },
  {
    slug: 'global-ai-translations',
    title: 'Global AI Translations explained',
    description: 'How our AI engine auto-translates your route descriptions to reach a worldwide audience.',
    icon: 'Globe',
    tag: 'International',
    tab: 'creators',
    relatedSlugs: ['how-to-sell-your-routes', 'creating-high-quality-pdfs'],
    readingTimeMinutes: 3,
    lastUpdated: '2026-03-17',
    keywords: ['translation', 'ai', 'language', 'international', 'global', 'multilingual', 'audience'],
    tldr: 'RouteMarket automatically translates your route title and description into 10+ languages using AI. This means a route written in Polish can be discovered and purchased by buyers in Germany, Japan, or Brazil — without you lifting a finger.',
    steps: [
      { title: 'Write your route in any language', description: 'Create your route in the language you\'re most comfortable with. We detect the source language automatically.' },
      { title: 'AI translation kicks in', description: 'Within minutes of publishing, our AI engine translates your title and description into all supported languages.' },
      { title: 'Buyers see routes in their language', description: 'When someone browses RouteMarket, they see route descriptions in their browser language. The GPX & PDF remain in the original language.' },
      { title: 'Review & edit translations', description: 'You can review auto-translations in your Creator Dashboard and make manual corrections if needed.' },
    ],
    commonMistakes: [
      'Writing in slang or heavy dialect — AI handles standard language better. Save local flavour for the PDF guide.',
      'Using abbreviations without context — "Turn R at km 3.5" translates poorly. Write "Turn right at kilometre 3.5" instead.',
      'Not reviewing key translations — while AI is accurate, checking the English version (your biggest market) is worth the 2 minutes.',
    ],
    faq: [
      { question: 'Which languages are supported?', answer: 'English, Polish, German, French, Spanish, Italian, Portuguese, Dutch, Czech, and more. We add new languages regularly.' },
      { question: 'Is the translation really free?', answer: 'Yes, AI translation is included for all creators at no extra cost. It\'s part of our mission to make routes accessible globally.' },
      { question: 'Can I disable translations?', answer: 'Not currently, but you can edit any translation to match your preferred wording.' },
      { question: 'Does it translate the PDF too?', answer: 'Not yet. PDF translation is on our roadmap. For now, only the title and description are translated.' },
    ],
    checklist: [
      { label: 'Write clear, standard-language descriptions' },
      { label: 'Avoid heavy slang or abbreviations' },
      { label: 'Publish your route' },
      { label: 'Wait a few minutes for translations' },
      { label: 'Review the English translation in your dashboard' },
    ],
    ctaTitle: 'Go global',
    ctaDescription: 'Your routes can reach explorers in 50+ countries. Start creating.',
    ctaButtonLabel: 'Create a Route',
    ctaButtonHref: '/create-route',
  },
];

export function getArticlesByTab(tab: 'explorers' | 'creators'): GuideArticle[] {
  return guideArticles.filter((a) => a.tab === tab);
}

export function getArticleBySlug(slug: string): GuideArticle | undefined {
  return guideArticles.find((a) => a.slug === slug);
}

export function getAdjacentArticles(slug: string): { prev: GuideArticle | null; next: GuideArticle | null } {
  const article = getArticleBySlug(slug);
  if (!article) return { prev: null, next: null };
  const tabArticles = getArticlesByTab(article.tab);
  const idx = tabArticles.findIndex((a) => a.slug === slug);
  return {
    prev: idx > 0 ? tabArticles[idx - 1] : null,
    next: idx < tabArticles.length - 1 ? tabArticles[idx + 1] : null,
  };
}

export function searchArticles(query: string): GuideArticle[] {
  const q = query.toLowerCase().trim();
  if (!q) return guideArticles;
  return guideArticles.filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.keywords.some((k) => k.includes(q))
  );
}

export function getRelatedArticles(slug: string): GuideArticle[] {
  const article = getArticleBySlug(slug);
  if (!article?.relatedSlugs) return [];
  return article.relatedSlugs
    .map((s) => guideArticles.find((a) => a.slug === s))
    .filter(Boolean) as GuideArticle[];
}
