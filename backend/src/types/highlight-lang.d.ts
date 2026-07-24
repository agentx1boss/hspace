// Shim target for the "highlight.js/lib/languages/*" wildcard path mapping
// in tsconfig.json (see src/types/highlight-core.d.ts for why we avoid
// highlight.js's real declaration files). highlight.js ships no .d.ts for
// individual language grammar modules at all, so every import of
// "highlight.js/lib/languages/<name>" is redirected here; render.ts only
// ever passes the default export straight into hljs.registerLanguage as
// `unknown`, so no richer typing is needed.
declare const language: unknown;
export default language;
