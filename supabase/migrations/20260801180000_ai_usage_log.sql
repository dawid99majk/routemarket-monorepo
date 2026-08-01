-- Rejestr zużycia AI. Osobno mierzymy KOSZT (co operacja naprawdę kosztowała
-- w API) i CENĘ (ile obciążamy użytkownika) — bez tego rozdziału nie da się
-- powiedzieć, czy model biznesowy się spina, ani zmienić cennika bez przepisywania
-- pomiarów.
create table if not exists public.ai_usage_log (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  operation text not null,
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  -- rzeczywisty koszt po stronie dostawcy, w mikrodolarach (unika zaokrągleń)
  cost_micro_usd integer,
  -- ile tokenów aplikacji pobrano od użytkownika (null = jeszcze nie rozliczane)
  charged_tokens integer,
  duration_ms integer,
  project_id uuid,
  success boolean not null default true,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_log_user_idx on public.ai_usage_log(user_id, created_at desc);
create index if not exists ai_usage_log_operation_idx on public.ai_usage_log(operation, created_at desc);

alter table public.ai_usage_log enable row level security;

drop policy if exists "Users read their own usage" on public.ai_usage_log;
create policy "Users read their own usage" on public.ai_usage_log
  for select using (auth.uid() = user_id);

grant select on public.ai_usage_log to authenticated;

-- Podsumowanie kosztów per operacja: podstawa do ustalenia cennika
create or replace view public.ai_usage_summary as
select
  operation,
  count(*) as calls,
  round(avg(total_tokens)) as avg_tokens,
  round(avg(cost_micro_usd)) as avg_cost_micro_usd,
  round(sum(cost_micro_usd) / 1000000.0, 4) as total_cost_usd,
  round(avg(duration_ms)) as avg_ms,
  count(*) filter (where not success) as failures
from public.ai_usage_log
group by operation
order by sum(cost_micro_usd) desc nulls last;
