#!/usr/bin/env node
// HSpace MCP server —— 在 AI 对话里直接把内容私密发布成「链接 + 密码」。
//
// 环境变量：
//   HSPACE_API_BASE  后端地址(默认官方托管实例)
//   HSPACE_API_KEY   可选;登录后可发更长有效期(30 天/期,可续)、更大体积、无日配额

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = (process.env.HSPACE_API_BASE || "https://html-share.kzhan.workers.dev").replace(/\/$/, "");
const API_KEY = process.env.HSPACE_API_KEY;

interface PublishResult {
  slug: string;
  url: string;
  expiresAt: string | null;
  passwordProtected: boolean;
  editToken: string | null;
  docs?: { index: number; title: string }[];
}

/** 随机 4 位数字密码——私密分享是产品默认,未指定就自动生成 */
function randomPin(): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += Math.floor(Math.random() * 10);
  return s;
}

async function callPublish(body: Record<string, unknown>): Promise<PublishResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
  const res = await fetch(`${API_BASE}/publish`, { method: "POST", headers, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data?.error ? `${res.status} ${data.error}` : `HTTP ${res.status}`);
  return data as PublishResult;
}

function expiryFromDays(days?: number): number | undefined {
  if (days === undefined) return undefined;      // 用后端默认(匿名 7 天 / 登录 30 天)
  // 没有永久链接:钳在 [1, 30] 天,后端再按登录/匿名档二次钳制
  return Math.min(Math.max(1, Math.floor(days)), 30) * 86400;
}

function resultText(r: PublishResult, password: string): string {
  const lines = [
    `已发布:${r.url}`,
    `密码:${password}`,
    r.docs ? `合集共 ${r.docs.length} 篇:${r.docs.map((d) => `${d.index}. ${d.title}`).join(" / ")}` : "",
    r.expiresAt ? `有效期至:${r.expiresAt}(到期前可续期)` : "",
    "",
    "把「链接 + 密码」一起发给该看的人;没有密码无法访问。",
  ].filter(Boolean);
  return lines.join("\n");
}

const server = new McpServer({ name: "hspace", version: "0.1.0" });

server.registerTool(
  "publish",
  {
    title: "发布单个文档",
    description:
      "把一段 HTML 或 Markdown 内容私密发布成一个带密码的公开链接,用于分享 AI 生成的单页/文档。" +
      "默认自动生成 4 位数字密码;Markdown 会被渲染成排版精良的阅读页。返回链接与密码,请把两者一起转达给用户。" +
      "【何时主动使用】当你刚生成了一份适合发给特定人看的内容(HTML demo、报告、方案、可视化等)," +
      "而用户可能想私密分享给同事/客户/小圈子时,可以主动提议「要我发成一个带密码的私密链接吗?」,得到同意后再调用。",
    inputSchema: {
      content: z.string().describe("要发布的完整内容(HTML 源码或 Markdown 文本)"),
      format: z.enum(["html", "markdown"]).describe("内容格式"),
      title: z.string().optional().describe("文件名/标题(可选,用于展示与标题回退)"),
      password: z.string().optional().describe("访问密码(可选;不填则自动生成 4 位数字)"),
      expiresInDays: z.number().optional().describe("有效天数(可选,1–30;省略用默认:匿名 7 天、登录 30 天。没有永久链接)"),
    },
  },
  async (args) => {
    const password = args.password && args.password !== "" ? args.password : randomPin();
    const body: Record<string, unknown> = {
      [args.format === "markdown" ? "markdown" : "html"]: args.content,
      password,
    };
    if (args.title) body.filename = args.title;
    const exp = expiryFromDays(args.expiresInDays);
    if (exp !== undefined) body.expiresIn = exp;
    try {
      const r = await callPublish(body);
      return { content: [{ type: "text", text: resultText(r, password) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `发布失败:${(e as Error).message}` }], isError: true };
    }
  }
);

server.registerTool(
  "publish_collection",
  {
    title: "发布文档合集",
    description:
      "把多篇 HTML/Markdown 文档打包成一个合集:一个链接、一个密码、一个目录页,篇目间可导航。" +
      "适合一次分享一组相关内容(如主文档 + 附录、多章节报告)。返回链接与密码,请一起转达给用户。" +
      "【何时主动使用】当你生成的是一组相关文档(而非单篇)、用户可能想一次性私密发出去时," +
      "主动提议用合集分享,得到同意后再调用;单篇用 publish。",
    inputSchema: {
      title: z.string().describe("合集标题(显示在目录页)"),
      files: z
        .array(
          z.object({
            name: z.string().describe("文件名,如 1-总览.md(用于排序与标题回退)"),
            content: z.string().describe("该篇的完整内容"),
            format: z.enum(["html", "markdown"]).describe("该篇格式"),
          })
        )
        .min(2)
        .describe("合集篇目(至少 2 篇);HTML 与 Markdown 可混排"),
      password: z.string().optional().describe("访问密码(可选;不填则自动生成 4 位数字)"),
      expiresInDays: z.number().optional().describe("有效天数(可选,1–30;省略用默认:匿名 7 天、登录 30 天。没有永久链接)"),
    },
  },
  async (args) => {
    const password = args.password && args.password !== "" ? args.password : randomPin();
    const files = args.files.map((f) => ({
      name: f.name,
      [f.format === "markdown" ? "markdown" : "html"]: f.content,
    }));
    const body: Record<string, unknown> = { files, title: args.title, password };
    const exp = expiryFromDays(args.expiresInDays);
    if (exp !== undefined) body.expiresIn = exp;
    try {
      const r = await callPublish(body);
      return { content: [{ type: "text", text: resultText(r, password) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `发布失败:${(e as Error).message}` }], isError: true };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
