// 边缘渲染:Markdown → 安全 HTML + 标题锚点 + TOC 数据。存原文,渲染即时生效。
import { marked, Tokens } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import diff from "highlight.js/lib/languages/diff";
import yaml from "highlight.js/lib/languages/yaml";

const LANGS: Record<string, unknown> = {
  javascript, typescript, python, json, bash, xml, css, go, rust, sql, diff, yaml,
};
for (const [name, def] of Object.entries(LANGS)) {
  hljs.registerLanguage(name, def as any);
}
hljs.registerAliases(["js"], { languageName: "javascript" });
hljs.registerAliases(["ts"], { languageName: "typescript" });
hljs.registerAliases(["py"], { languageName: "python" });
hljs.registerAliases(["sh", "shell", "zsh"], { languageName: "bash" });
hljs.registerAliases(["html", "xhtml"], { languageName: "xml" });
hljs.registerAliases(["yml"], { languageName: "yaml" });

export interface TocItem {
  level: number;
  text: string;
  slug: string;
}
export interface Rendered {
  html: string;
  toc: TocItem[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

let configured = false;
function configure(): void {
  if (configured) return;
  configured = true;
  marked.use(
    { gfm: true },
    markedHighlight({
      langPrefix: "hljs language-",
      highlight(code: string, lang: string): string {
        return lang && hljs.getLanguage(lang)
          ? hljs.highlight(code, { language: lang }).value
          : escapeHtml(code);
      },
    }),
    {
      renderer: {
        heading(token: Tokens.Heading): string {
          const text = this.parser.parseInline(token.tokens);
          const slug = (token as Tokens.Heading & { slug?: string }).slug;
          if (!slug) return `<h${token.depth}>${text}</h${token.depth}>\n`;
          return (
            `<h${token.depth} id="${slug}">${text}` +
            `<a class="anchor" href="#${slug}" aria-label="链接到本节">#</a>` +
            `</h${token.depth}>\n`
          );
        },
      },
    },
  );
}

export function renderMarkdown(md: string): Rendered {
  configure();
  const tokens = marked.lexer(md);
  const toc: TocItem[] = [];
  const seen = new Map<string, number>();
  marked.walkTokens(tokens, (t) => {
    if (t.type !== "heading") return;
    const h = t as Tokens.Heading & { slug?: string };
    const base = slugify(h.text) || "section";
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const slug = n === 0 ? base : `${base}-${n}`;
    h.slug = slug;
    if (h.depth >= 2 && h.depth <= 4) toc.push({ level: h.depth, text: h.text, slug });
  });
  // marked.lexer()/marked.parser() bypass the automatic walkTokens hook invocation
  // that marked.parse() would normally perform, so extensions like markedHighlight
  // (whose walkTokens hook actually runs hljs.highlight and mutates token.text)
  // never fire. Invoke the merged extension walkTokens hook ourselves here.
  const extensionWalk = marked.defaults.walkTokens;
  if (extensionWalk) marked.walkTokens(tokens, extensionWalk);
  const html = marked.parser(tokens);
  return { html, toc };
}
