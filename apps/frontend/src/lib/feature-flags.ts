/**
 * Feature Flag System
 *
 * Flags are evaluated per-session using a stable hash of the user ID
 * (or a random anonymous ID stored in sessionStorage). This guarantees
 * consistent behaviour within a session while supporting percentage rollout.
 *
 * Environment hierarchy:  development → staging → production
 * Set VITE_APP_ENV to "staging" or "production"; defaults to "development".
 */

// ── Flag definitions ────────────────────────────────────────────────
export type FeatureFlagName =
  | 'ff_compliance_gate'
  | 'ff_creator_declarations'
  | 'ff_ai_assisted_filter'
  | 'ff_route_safety_panel';

type Rollout = { development: number; staging: number; production: number };

interface FlagConfig {
  /** Human-readable description */
  description: string;
  /** Percentage (0-100) enabled per environment */
  rollout: Rollout;
}

const FLAG_REGISTRY: Record<FeatureFlagName, FlagConfig> = {
  ff_compliance_gate: {
    description: 'Buyer consent / compliance gate before checkout',
    rollout: { development: 100, staging: 100, production: 10 },
  },
  ff_creator_declarations: {
    description: 'Require creator declarations before publishing',
    rollout: { development: 100, staging: 100, production: 10 },
  },
  ff_ai_assisted_filter: {
    description: 'AI-assisted filter on route listing',
    rollout: { development: 100, staging: 100, production: 10 },
  },
  ff_route_safety_panel: {
    description: 'Trust & Safety panel on route detail page',
    rollout: { development: 100, staging: 100, production: 10 },
  },
};

// ── Environment detection ───────────────────────────────────────────
type AppEnv = 'development' | 'staging' | 'production';

function getAppEnv(): AppEnv {
  const env = (import.meta.env.VITE_APP_ENV as string) ?? '';
  if (env === 'staging') return 'staging';
  if (env === 'production') return 'production';
  return 'development';
}

// ── Stable session identity ─────────────────────────────────────────
function getSessionIdentity(userId?: string | null): string {
  if (userId) return userId;
  const KEY = '__ff_anon_id';
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

// ── Deterministic hash (0-99) ───────────────────────────────────────
function hashToPercent(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 100;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Check whether a feature flag is enabled for the current session.
 *
 * @param flag  – one of the registered flag names
 * @param userId – optional authenticated user id (improves sticky bucketing)
 */
export function isFeatureEnabled(flag: FeatureFlagName, userId?: string | null): boolean {
  const config = FLAG_REGISTRY[flag];
  if (!config) return false;

  const env = getAppEnv();
  const pct = config.rollout[env];

  // Fast paths
  if (pct >= 100) return true;
  if (pct <= 0) return false;

  const identity = getSessionIdentity(userId);
  const bucket = hashToPercent(`${flag}:${identity}`);
  return bucket < pct;
}

/** Return all flag states (useful for debug / admin panel) */
export function getAllFlags(userId?: string | null): Record<FeatureFlagName, boolean> {
  const entries = Object.keys(FLAG_REGISTRY) as FeatureFlagName[];
  return Object.fromEntries(entries.map((f) => [f, isFeatureEnabled(f, userId)])) as Record<FeatureFlagName, boolean>;
}

/** Get the raw config (for admin view) */
export function getFlagRegistry() {
  return FLAG_REGISTRY;
}
