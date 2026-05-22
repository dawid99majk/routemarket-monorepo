import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_UI_LANGUAGES } from '@/i18n';

const SITE_URL = 'https://routemarket.io';
const SITE_NAME = 'RouteMarket';
const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;

export interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'product';
  noIndex?: boolean;
  structuredData?: object | object[];
  hreflang?: { lang: string; href: string }[];
}

export default function SEO({
  title,
  description = 'Buy and sell curated adventure travel routes with GPX files, trail guides, and interactive maps.',
  image = DEFAULT_IMAGE,
  url,
  type = 'website',
  noIndex = false,
  structuredData,
  hreflang,
}: SEOProps) {
  const { i18n } = useTranslation();
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} - Adventure Travel Routes Marketplace`;
  const canonical = url ? `${SITE_URL}${url}` : undefined;
  const structuredDataArray = structuredData
    ? Array.isArray(structuredData) ? structuredData : [structuredData]
    : [];

  // Auto-generate hreflang for all supported UI languages if not explicitly provided
  const autoHreflang = hreflang ?? SUPPORTED_UI_LANGUAGES.map((l) => ({
    lang: l.code,
    href: url || '/',
  }));

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />

      {canonical && <link rel="canonical" href={canonical} />}
      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:type" content={type === 'product' ? 'product' : 'website'} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      {canonical && <meta property="og:url" content={canonical} />}
      <meta property="og:site_name" content={SITE_NAME} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {/* Hreflang */}
      <html lang={i18n.language} />
      {autoHreflang.map(({ lang, href }) => (
        <link key={lang} rel="alternate" hrefLang={lang} href={`${SITE_URL}${href}`} />
      ))}
      <link rel="alternate" hrefLang="x-default" href={`${SITE_URL}${url || '/'}`} />
      {/* Structured Data */}
      {structuredDataArray.map((sd, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(sd)}
        </script>
      ))}
    </Helmet>
  );
}

// ── Structured Data Builders ──

export function buildProductSchema(route: {
  id: number;
  title: string;
  description: string;
  price: number;
  currency?: string;
  cover_image_key: string | null;
  creator_name: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: route.title,
    description: route.description?.slice(0, 200),
    image: route.cover_image_key || DEFAULT_IMAGE,
    url: `${SITE_URL}/route/${route.id}`,
    brand: { '@type': 'Brand', name: SITE_NAME },
    offers: {
      '@type': 'Offer',
      price: route.price,
      priceCurrency: route.currency || 'USD',
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'Person', name: route.creator_name },
    },
  };
}

export function buildReviewSchema(stats: {
  average_rating: number;
  total_ratings: number;
}) {
  if (!stats.total_ratings) return null;
  return {
    '@type': 'AggregateRating',
    ratingValue: stats.average_rating,
    reviewCount: stats.total_ratings,
    bestRating: 5,
    worstRating: 1,
  };
}

export function buildBreadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  };
}

export function buildOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/favicon.png`,
    description: 'Marketplace tras GPX: rowerowych, motocyklowych, pieszych i samochodowych z przewodnikami PDF i interaktywnymi mapami.',
    sameAs: [],
  };
}

export function buildWebsiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: ['pl', 'en', 'de', 'fr', 'es', 'it', 'nl', 'da'],
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/?search={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}
