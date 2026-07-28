// 内容子域上的响应头。两档,刻意分开(issue #19):
//
//  · HTML 稿(.html 直接托管)= rawHtmlHeaders():保「原样能跑」,内联/外链脚本、
//    CDN 都照旧,只禁被嵌套。2026-07-28 决策:这轮不收紧。
//  · 第一方外壳(密码页 / md 阅读页 / 合集目录页 / 404 / 锁定页)= shellHeaders():
//    真 CSP。外壳本来就是自包含内联的,天然适配 nonce —— 脚本只认本次响应的
//    nonce,md 里注入的脚本一律不执行;connect-src 关死,追踪回传也出不去。
//    图片按 2026-07-28 决策放行 https:(用户 md 里的外链图片照常显示)。

import { randomToken } from "./crypto";

const COMMON = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
} as const;

/** HTML 稿:允许页面自带内联/外链脚本(AI 生成常见),但禁止被主站以外嵌套 */
export function rawHtmlHeaders(): HeadersInit {
  return { ...COMMON, "Content-Security-Policy": "frame-ancestors 'none';" };
}

export function nonce(): string {
  return randomToken(16);
}

/**
 * 第一方外壳的 CSP。
 * style-src 留 'unsafe-inline':外壳的悬浮导航把 <style> 塞进 Shadow DOM(innerHTML),
 * 拿不到 nonce;而净化后的 md 里既没有 <style> 也没有 style 属性,且 CSS 能引的远程
 * 资源(背景图)本就在 img-src 放行范围内,不构成新增出口。脚本侧保持严格 nonce。
 */
export function shellHeaders(n: string): HeadersInit {
  return {
    ...COMMON,
    "Content-Security-Policy": [
      "default-src 'none'",
      `script-src 'nonce-${n}'`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' https: data:",
      "font-src 'self' data:",
      "connect-src 'none'",
      "form-action 'self'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join("; ") + ";",
  };
}

/**
 * 给外壳自己内联的 <script> 打上本次响应的 nonce。
 * 前提(由 sanitize.ts 保证并有测试兜底):正文里不可能出现真正的 <script> 标签
 * —— md 内嵌的脚本要么连内容被吃掉,要么已被转义成文字。
 */
export function withNonce(html: string, n: string): string {
  return html.replace(/<script(?=[\s>])/gi, `<script nonce="${n}"`);
}
