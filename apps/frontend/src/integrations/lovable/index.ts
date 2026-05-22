// Native Supabase OAuth wrapper (post-migration off Lovable Cloud Auth).
// Keeps the same `lovable.auth.signInWithOAuth` API used elsewhere in the app.
import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const lovable = {
  auth: {
    signInWithOAuth: async (
      provider: "google" | "apple",
      opts?: SignInOptions,
    ) => {
      const redirectTo =
        opts?.redirect_uri ?? `${window.location.origin}/auth/callback`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          queryParams: opts?.extraParams,
        },
      });
      if (error) return { error };
      // Supabase performs a full-page redirect to the provider.
      return { redirected: true, url: data?.url };
    },
  },
};