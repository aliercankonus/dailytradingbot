// The MCP tool handlers run inside the plugin-generated Deno Edge Function,
// where `process.env` is polyfilled by the bundle. This ambient declaration
// tells the app-side tsc that `process.env` exists in these modules; it never
// runs in the browser bundle.
declare const process: {
  env: Record<string, string | undefined>;
};

export function getSupabaseServerEnv() {
  return {
    url: process.env.SUPABASE_URL,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
  };
}
