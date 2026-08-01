-- Usunięcie koncepcji marketplace. Aplikacja przestaje być sklepem z trasami,
-- a staje się planerem podróży rozliczanym tokenami — stare tabele tylko myliły.
-- Kopia zapasowa: /root/backups/przed_usunieciem_marketplace_*.sql

-- Sprzedaż i zakupy
drop table if exists public.purchases cascade;
drop table if exists public.purchase_consents cascade;
drop table if exists public.buyer_risk_acknowledgements cascade;

-- Katalog tras na sprzedaż wraz z satelitami
drop table if exists public.route_images cascade;
drop table if exists public.route_pdfs cascade;
drop table if exists public.route_pois cascade;
drop table if exists public.route_private_details cascade;
drop table if exists public.route_recommendations cascade;
drop table if exists public.route_tips cascade;
drop table if exists public.route_translations cascade;
drop table if exists public.generated_content cascade;
drop table if exists public.routes cascade;
drop table if exists public.categories cascade;

-- Społeczność wokół sklepu
drop table if exists public.favorites cascade;
drop table if exists public.ratings cascade;
drop table if exists public.comments cascade;
drop table if exists public.messages cascade;
drop table if exists public.conversations cascade;

-- Rola twórcy-sprzedawcy i jego rozliczenia
drop table if exists public.creator_declarations cascade;
drop table if exists public.creator_profiles cascade;

-- Stare waluty: tokeny zarabiane na sprzedaży i kredyty sklepowe.
-- Nowy model to tokeny KUPOWANE i wydawane na AI — mieszanie jednego z drugim
-- dawałoby dwie niezgodne definicje tego samego słowa.
drop table if exists public.token_transactions cascade;
drop table if exists public.credit_transactions cascade;

-- Kampanie reklamowe sklepu
drop table if exists public.campaign_creatives cascade;
drop table if exists public.campaign_events cascade;
drop table if exists public.campaigns cascade;

-- Analityka sklepu
drop table if exists public.analytics_events cascade;

-- Salda ze starego modelu
alter table public.profiles
  drop column if exists credit_balance,
  drop column if exists promo_token_balance,
  drop column if exists earned_token_balance,
  drop column if exists token_balance;
