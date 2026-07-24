// highlight.js's real declaration file (types/index.d.ts) contains
// `/// <reference lib="dom" />`, which pollutes the whole TS program with
// DOM lib globals (e.g. a DOM-flavored ArrayBuffer/Uint8Array) and conflicts
// with @cloudflare/workers-types elsewhere in this Worker (see crypto.ts).
// This local shim covers just the subset of the API render.ts uses, so we
// can import "highlight.js/lib/core" without pulling in the dom lib.
// Runtime resolution is unaffected — this only redirects type-checking
// (see the "paths" entry in tsconfig.json).
declare module "highlight.js/lib/core" {
  interface HighlightResult {
    value: string;
    language?: string;
    relevance: number;
  }

  interface HLJSApi {
    highlight(code: string, options: { language: string; ignoreIllegals?: boolean }): HighlightResult;
    registerLanguage(name: string, language: unknown): void;
    registerAliases(aliases: string | string[], opts: { languageName: string }): void;
    getLanguage(name: string): unknown;
  }

  const hljs: HLJSApi;
  export default hljs;
}
