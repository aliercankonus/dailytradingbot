// Ambient globals for MCP tool handlers. Tool code is bundled by the mcp-js
// Vite plugin into a Deno Edge Function, where `process.env` is available as
// a polyfill. This ambient declaration keeps the app-side tsc happy without
// pulling all @types/node globals into the browser bundle.
declare const process: {
  env: Record<string, string | undefined>;
};
