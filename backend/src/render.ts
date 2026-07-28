// 边缘渲染:Markdown → 安全 HTML + 标题锚点 + TOC 数据。存原文,渲染即时生效。
import { marked, Tokens, type Token } from "marked";
import { sanitizeRawHtml, safeUrl, escapeAttr } from "./sanitize";
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

// 从标题的行内 token 递归提取纯文本(剥离 **加粗**、`代码`、[链接](url) 等 markdown
// 标记),用于 TOC 标签与 slug —— 否则 TOC 会显示原始 markdown 源码。
function plainText(tokens: Token[]): string {
  return tokens
    .map((t) => {
      const node = t as { text?: string; tokens?: Token[] };
      return node.tokens ? plainText(node.tokens) : (node.text ?? "");
    })
    .join("");
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
        // 用户 md 里内嵌的原始 HTML:过白名单(见 sanitize.ts)。marked 把块级
        // 与行内的原始 HTML 都路由到这里,所以这一个覆写就封住了整条注入路径。
        html(token: Tokens.HTML | Tokens.Tag): string {
          return sanitizeRawHtml(token.text);
        },
        // marked 的 cleanUrl 只做 encodeURI,不看协议 —— javascript: 链接得自己挡。
        link(token: Tokens.Link): string {
          const text = this.parser.parseInline(token.tokens);
          const href = safeUrl(token.href);
          if (href === null) return text; // 协议不安全:留文字,不留链接
          const title = token.title ? ` title="${escapeAttr(token.title)}"` : "";
          return `<a href="${escapeAttr(href)}"${title}>${text}</a>`;
        },
        image(token: Tokens.Image): string {
          const src = safeUrl(token.href);
          if (src === null) return escapeHtml(token.text);
          const title = token.title ? ` title="${escapeAttr(token.title)}"` : "";
          return `<img src="${escapeAttr(src)}" alt="${escapeAttr(token.text)}"${title}>`;
        },
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
    const text = plainText(h.tokens);
    const base = slugify(text) || "section";
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const slug = n === 0 ? base : `${base}-${n}`;
    h.slug = slug;
    if (h.depth >= 2 && h.depth <= 4) toc.push({ level: h.depth, text, slug });
  });
  // marked.lexer()/marked.parser() bypass the automatic walkTokens hook invocation
  // that marked.parse() would normally perform, so extensions like markedHighlight
  // (whose walkTokens hook actually runs hljs.highlight and mutates token.text)
  // never fire. Invoke the merged extension walkTokens hook ourselves here.
  const extensionWalk = marked.defaults.walkTokens;
  if (extensionWalk) marked.walkTokens(tokens, extensionWalk);
  // 设计 §错误处理:高亮/渲染抛错时优雅降级为转义纯文本,而非 500。
  let html: string;
  try {
    html = marked.parser(tokens);
  } catch {
    html = `<pre><code>${escapeHtml(md)}</code></pre>`;
  }
  return { html, toc };
}
