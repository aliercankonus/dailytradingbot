// Ambient globals for MCP tool handlers. Tool code is bundled by the mcp-js
// Vite plugin into a Deno Edge Function, where `process.env` is available.
// `moduleDetection: force` in tsconfig treats every file as a module, so we
// must augment the global scope explicitly.
export {};

declare global {
  const process: {
    env: Record<string, string | undefined>;
  };
}
