import { createClient } from '@supabase/supabase-js';

/**
 * Pomiar zużycia AI. Rozdzielamy dwie rzeczy, które łatwo pomylić:
 *  - KOSZT: ile operacja naprawdę kosztowała u dostawcy (liczony z tokenów),
 *  - CENA: ile pobierzemy od użytkownika w tokenach aplikacji.
 * Bez tego rozdziału nie da się ocenić marży ani zmienić cennika bez ruszania
 * pomiarów. Na razie zapisujemy koszt; cena dochodzi, gdy ustalimy cennik.
 */

// Cennik dostawcy w mikrodolarach za 1000 tokenów (stan na sierpień 2026).
// Trzymany tutaj, a nie w bazie, bo zmienia się rzadko i musi być wersjonowany z kodem.
const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  'gemini-2.5-flash': { in: 30, out: 250 },
  'gemini-2.0-flash': { in: 10, out: 40 }
};

export interface UsageRecord {
  operation: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs?: number;
  userId?: string | null;
  projectId?: string | null;
  success?: boolean;
  errorMessage?: string;
}

function costMicroUsd(model: string, promptTokens = 0, completionTokens = 0): number | null {
  const price = MODEL_PRICING[model];
  if (!price) return null;
  return Math.round((promptTokens / 1000) * price.in + (completionTokens / 1000) * price.out);
}

let client: ReturnType<typeof createClient> | null = null;
function getClient() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/**
 * Zapis pojedynczego wywołania. Świadomie nie rzuca wyjątków i nie blokuje
 * odpowiedzi — pomiar nie może psuć funkcji, którą mierzy.
 */
export async function recordUsage(record: UsageRecord): Promise<void> {
  const cost = costMicroUsd(record.model, record.promptTokens, record.completionTokens);
  const line = `[usage] ${record.operation} ${record.model} ${record.totalTokens ?? '?'} tok` +
    `${cost != null ? ` ≈ $${(cost / 1_000_000).toFixed(5)}` : ''}` +
    `${record.durationMs ? ` ${record.durationMs}ms` : ''}${record.success === false ? ' FAILED' : ''}`;
  console.log(line);

  const supabase = getClient();
  if (!supabase) return;
  try {
    await (supabase as any).from('ai_usage_log').insert({
      user_id: record.userId ?? null,
      operation: record.operation,
      model: record.model,
      prompt_tokens: record.promptTokens ?? null,
      completion_tokens: record.completionTokens ?? null,
      total_tokens: record.totalTokens ?? null,
      cost_micro_usd: cost,
      duration_ms: record.durationMs ?? null,
      project_id: record.projectId ?? null,
      success: record.success !== false,
      error_message: record.errorMessage ?? null
    });
  } catch (err) {
    console.warn('[usage] Nie udało się zapisać zużycia:', err);
  }
}

/**
 * Opakowanie wywołania Gemini, które przy okazji mierzy. Zwraca surową
 * odpowiedź, więc podmiana w istniejącym kodzie jest jednoliniowa.
 */
export async function callGeminiTracked(
  url: string,
  body: unknown,
  meta: { operation: string; model: string; userId?: string | null; projectId?: string | null }
): Promise<any> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text();
      void recordUsage({ ...meta, durationMs: Date.now() - started, success: false, errorMessage: `HTTP ${res.status}` });
      throw new Error(`Gemini ${meta.operation} error ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json() as any;
    const usage = data.usageMetadata || {};
    void recordUsage({
      ...meta,
      promptTokens: usage.promptTokenCount,
      completionTokens: usage.candidatesTokenCount,
      totalTokens: usage.totalTokenCount,
      durationMs: Date.now() - started
    });
    return data;
  } catch (err: any) {
    if (!String(err.message).startsWith('Gemini ')) {
      void recordUsage({ ...meta, durationMs: Date.now() - started, success: false, errorMessage: err.message });
    }
    throw err;
  }
}
