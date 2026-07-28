// md 阅读页的原始 HTML 净化 + URL 协议闸门(issue #19)。
//
// 作用范围:只处理「用户 md 里内嵌的原始 HTML」与 markdown 链接/图片的 URL,
// 不碰 marked 自己生成的结构(标题锚点、hljs 高亮、GFM 任务框由 render.ts 直出)。
//
// 设计取舍:宁可把可疑构造降级成可见文本,也不放过一次执行 —— 因此输出是「重建」
// 出来的,未命中白名单的 `<` 一律转义,攻击者无法靠嵌套/截断(`<scr<script>ipt>`)
// 把碎片重新拼回标签。
//
// 分档:HTML 稿(.html 直接托管)不走这里 —— 它的卖点是「原样能跑」,策略另定
// (2026-07-28 决策:这轮不动)。

/** 允许留在阅读页里的标签:纯排版用。交互/嵌入/表单类一律不给 */
const ALLOWED_TAGS = new Set([
  "a", "abbr", "address", "article", "aside", "b", "bdi", "bdo", "big", "blockquote", "br",
  "caption", "center", "cite", "code", "col", "colgroup", "dd", "del", "details", "dfn", "div",
  "dl", "dt", "em", "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hgroup", "hr", "i", "img", "ins", "kbd", "li", "main", "mark", "nav", "ol", "p",
  "pre", "q", "rp", "rt", "ruby", "s", "samp", "section", "small", "span", "strike", "strong",
  "sub", "summary", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "time", "tr", "tt",
  "u", "ul", "var", "wbr",
]);

/**
 * 连内容一起吃掉的**容器型**元素 —— 只丢标签会把脚本正文/CSS/SVG 源码当正文显示出来。
 *
 * ⚠️ 只放真正有闭合标签的容器。空元素(`<source>`、`<meta>`、`<link>`、`<base>`、
 * `<embed>`…)永远等不到 `</x>`,一旦进这张表就会把整段后文吃到结尾 —— 而内容是
 * 存原文动态渲染的,那等于一部署就悄悄截断已发布的老稿。空元素交给下面的兜底
 * 逻辑「未命中白名单 → 只丢标签」即可,它们本身没有可执行内容。
 *
 * 其余未命中白名单的标签(form、input、marquee、自定义元素…)同样只丢标签、留文字:
 * 表单控件已在这张表或白名单外被剥掉,`<form>` 自身没了也就没有可提交的东西。
 */
const DROP_WITH_CONTENT = new Set([
  "script", "style", "iframe", "frameset", "object", "applet", "noscript",
  "template", "svg", "math", "canvas", "audio", "video", "map",
  "head", "title", "textarea", "select", "option", "optgroup",
  "button", "dialog", "xmp", "plaintext", "listing",
]);

/**
 * 原始文本元素:内容在 HTML 里本就是字面文本。只有这类标签缺闭合时才允许「吃到结尾」
 * —— 否则把 JS/CSS 源码当正文倒出来太难看(安全上转义过了也不会执行)。
 */
const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title", "xmp", "plaintext", "listing"]);

/**
 * 任何标签都可带的属性(纯语义/排版;style 与 on* 不在列内 = 一律剥掉)。
 *
 * **不含 `class`**:正文与阅读页外壳共用同一份全局 CSS,放行 class 等于让正文点名
 * 复用外壳的样式 —— `<a class="lb open">` 会直接套上图片 lightbox 的
 * `position:fixed;inset:0;z-index:2147483646`,变成盖满全屏的可点击外链(钓鱼/挡读)。
 * 用户内容里的 `<style>` 与 style 属性都已被剥掉,class 对作者也没有任何用处,直接不留。
 */
const GLOBAL_ATTRS = new Set(["id", "title", "lang", "dir", "align", "role"]);

/** 按标签额外允许的属性 */
const TAG_ATTRS: Record<string, string[]> = {
  a: ["href", "target"],
  img: ["src", "alt", "width", "height"],
  ol: ["start", "reversed"],
  li: ["value"],
  details: ["open"],
  time: ["datetime"],
  q: ["cite"],
  blockquote: ["cite"],
  del: ["cite", "datetime"],
  ins: ["cite", "datetime"],
  td: ["colspan", "rowspan", "headers", "scope"],
  th: ["colspan", "rowspan", "headers", "scope", "abbr"],
  col: ["span"],
  colgroup: ["span"],
};

/** 值要过协议闸门的属性 */
const URL_ATTRS = new Set(["href", "src", "cite"]);

/** 自闭合标签:不回吐 `</br>` 这类无意义闭合 */
const VOID_TAGS = new Set(["br", "wbr", "hr", "img", "col"]);

const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

/** data: 只放行位图 —— data:image/svg+xml 能带脚本,data:text/html 是跳转型 XSS */
const SAFE_DATA_URL = /^data:image\/(png|jpe?g|gif|webp|avif|bmp|ico);base64,[a-z0-9+/=]+$/;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", colon: ":", tab: "\t",
  newline: "\n", sol: "/", nbsp: " ", semi: ";",
};

/** 解实体:`&#106;avascript:` / `java&Tab;script:` 这类绕过必须先还原再判协议 */
function decodeEntities(s: string): string {
  return s.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);?/g, (whole, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return "";
      try {
        return String.fromCodePoint(code);
      } catch {
        return "";
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? whole;
  });
}

/**
 * URL 闸门:放行相对路径/锚点与 http(s)/mailto/tel 与 base64 位图 data:,
 * 其余(javascript:、vbscript:、data:text/html、file:、blob:…)返回 null = 整个属性丢掉。
 */
export function safeUrl(raw: string): string | null {
  const decoded = decodeEntities(raw);
  // 判协议前先抹掉空白与控制字符:`java\tscript:` / ` javascript:` 都要判成同一个东西
  const probe = decoded.replace(/[\u0000-\u0020\u007f-\u00a0\s]/g, "").toLowerCase();
  const scheme = probe.match(/^([a-z][a-z0-9+.-]*):/);
  if (!scheme) return decoded; // 相对路径、#锚点、//host
  if (SAFE_SCHEMES.has(scheme[1])) return decoded;
  if (scheme[1] === "data" && SAFE_DATA_URL.test(probe)) return decoded;
  return null;
}

/** 文本节点:只需断掉标签起始,`&` 保留原样(实体解出来也只是文字,不成标签) */
function escapeText(s: string): string {
  return s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 属性值:断掉引号与标签起始即可 */
export function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const ATTR_RE = /([A-Za-z_:][-\w:.]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'`=<>]+))?/g;

/** 按白名单重建开标签 */
function openTag(name: string, body: string): string {
  const allowed = new Set([...GLOBAL_ATTRS, ...(TAG_ATTRS[name] ?? [])]);
  const rest = body.replace(/^\s*[A-Za-z][A-Za-z0-9]*/, "");
  const attrs: string[] = [];
  const seen = new Set<string>();
  let blankTarget = false;
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(rest))) {
    const key = m[1].toLowerCase();
    if (!allowed.has(key) || seen.has(key)) continue;
    let val = m[2] ?? "";
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (URL_ATTRS.has(key)) {
      const safe = safeUrl(val);
      if (safe === null) continue;
      val = safe;
    }
    if (key === "target") {
      if (val !== "_blank") continue;
      blankTarget = true;
    }
    // 外壳的 id 命名空间不给正文占用:`hspace-nav-host` 被 DOM clobbering 抢走会
    // 让悬浮导航挂到用户的元素上(不是执行,但会坏掉阅读体验)
    if (key === "id" && val.toLowerCase().startsWith("hspace-")) continue;
    seen.add(key);
    attrs.push(`${key}="${escapeAttr(val)}"`);
  }
  // target=_blank 一律配 noopener:不让接收方的新标签把 window.opener 交出去
  if (blankTarget) attrs.push('rel="noopener noreferrer"');
  return `<${name}${attrs.length ? " " + attrs.join(" ") : ""}>`;
}

const TOKEN_RE = /<(!--[\s\S]*?--|!\[CDATA\[[\s\S]*?\]\]|[!?][^>]*|\/?[A-Za-z][^>]*)>/g;

/**
 * 净化一段原始 HTML:白名单标签按属性白名单重建,危险元素连内容吃掉,
 * 其余标签丢掉但保留文字,标签之外的一切转义。
 */
export function sanitizeRawHtml(chunk: string): string {
  let out = "";
  let cursor = 0;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(chunk))) {
    out += escapeText(chunk.slice(cursor, m.index));
    cursor = TOKEN_RE.lastIndex;
    const body = m[1];
    if (body[0] === "!" || body[0] === "?") continue; // 注释 / DOCTYPE / CDATA / 处理指令:丢
    const closing = body[0] === "/";
    const named = /^\/?\s*([A-Za-z][A-Za-z0-9]*)/.exec(body);
    if (!named) continue;
    const name = named[1].toLowerCase();
    if (DROP_WITH_CONTENT.has(name)) {
      if (!closing) {
        const close = new RegExp(`</\\s*${name}\\s*>`, "i").exec(chunk.slice(cursor));
        if (close) {
          cursor = cursor + close.index + close[0].length; // 吃到对应闭合标签
          TOKEN_RE.lastIndex = cursor;
        } else if (RAW_TEXT_TAGS.has(name)) {
          cursor = chunk.length; // 原始文本元素没闭合:吃到结尾(截断的 `<script` 同样不留)
          TOKEN_RE.lastIndex = cursor;
        }
        // 其余容器没闭合时**只丢标签**:内容继续走正常净化(转义后的文字不可执行),
        // 绝不因为少一个 `</x>` 就把后文全截掉 —— 内容是存原文动态渲染的,
        // 那种截断会在部署当天悄悄改写已发布的老稿。
      }
      continue;
    }
    if (!ALLOWED_TAGS.has(name)) continue; // 未知/无关标签:丢标签,留文字
    if (closing) {
      if (!VOID_TAGS.has(name)) out += `</${name}>`;
    } else {
      out += openTag(name, body.replace(/^\//, ""));
    }
  }
  out += escapeText(chunk.slice(cursor));
  return out;
}
