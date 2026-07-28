import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, collectDocs, contentBody, publishBody, formatFromName, formatFromContent } from "../src/cli.js";
import { expiryFromDays, randomPin } from "../src/api.js";

describe("parseArgs", () => {
  it("拆出命令、位置参数与布尔/取值 flag", () => {
    const a = parseArgs(["publish", "report.md", "--json", "--expires", "3", "--title=Q3 方案"]);
    expect(a.cmd).toBe("publish");
    expect(a.positional).toEqual(["report.md"]);
    expect(a.flags).toEqual({ json: true, expires: "3", title: "Q3 方案" });
  });
  it("布尔 flag 不吞掉后面的位置参数", () => {
    const a = parseArgs(["revoke", "abc1234", "--json", "g1"]);
    expect(a.positional).toEqual(["abc1234", "g1"]);
  });
  it("`-` 是位置参数(stdin),不是 flag", () => {
    expect(parseArgs(["publish", "-"]).positional).toEqual(["-"]);
  });
  it("`--` 之后一律当位置参数", () => {
    expect(parseArgs(["publish", "--", "--weird-name.md"]).positional).toEqual(["--weird-name.md"]);
  });
});

describe("格式判断", () => {
  it("按后缀", () => {
    expect(formatFromName("a.md")).toBe("markdown");
    expect(formatFromName("a.markdown")).toBe("markdown");
    expect(formatFromName("a.HTML")).toBe("html");
    expect(() => formatFromName("a.txt")).toThrow(/只支持/);
  });
  it("--as 覆盖,typo 不静默通过", () => {
    expect(formatFromName("a.txt", "md")).toBe("markdown");
    expect(formatFromName("a.md", "html")).toBe("html");
    expect(() => formatFromName("a.md", "mdx")).toThrow(/--as/);
  });
  it("stdin 按内容猜", () => {
    expect(formatFromContent("# 标题")).toBe("markdown");
    expect(formatFromContent("<!doctype html><html>")).toBe("html");
    expect(formatFromContent("  <html lang=zh>")).toBe("html");
    // 正文里出现 html 标签不算整页 HTML
    expect(formatFromContent("行内 <b>粗</b>")).toBe("markdown");
  });
});

describe("contentBody", () => {
  it("单篇 → markdown/html + filename", () => {
    expect(contentBody([{ name: "a.md", content: "# x", format: "markdown" }])).toEqual({
      markdown: "# x",
      filename: "a.md",
    });
  });
  it("多篇 → files 合集(保序,可混排)", () => {
    const body = contentBody(
      [
        { name: "1.md", content: "# a", format: "markdown" },
        { name: "2.html", content: "<p>b</p>", format: "html" },
      ],
      "教程",
    );
    expect(body.title).toBe("教程");
    expect(body.files).toEqual([
      { name: "1.md", markdown: "# a" },
      { name: "2.html", html: "<p>b</p>" },
    ]);
  });
  it("空列表报错", () => {
    expect(() => contentBody([])).toThrow();
  });
});

describe("collectDocs", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hspace-cli-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("单文件", () => {
    writeFileSync(join(dir, "a.md"), "# A");
    expect(collectDocs(join(dir, "a.md"))).toEqual([{ name: "a.md", content: "# A", format: "markdown" }]);
  });
  it("目录:按名排序、只收 md/html、不递归", () => {
    writeFileSync(join(dir, "2-b.html"), "<p>B</p>");
    writeFileSync(join(dir, "1-a.md"), "# A");
    writeFileSync(join(dir, "notes.txt"), "忽略我");
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub", "c.md"), "# C");
    expect(collectDocs(dir).map((d) => d.name)).toEqual(["1-a.md", "2-b.html"]);
  });
  it("目录里没有 md/html 时报错", () => {
    writeFileSync(join(dir, "a.txt"), "x");
    expect(() => collectDocs(dir)).toThrow(/没有/);
  });
  it("找不到目标时报错", () => {
    expect(() => collectDocs(join(dir, "nope.md"))).toThrow(/找不到/);
  });
  it("`-` 读 stdin;空 stdin 报错", () => {
    expect(collectDocs("-", undefined, () => "# 从管道来")).toEqual([
      { name: "stdin.md", content: "# 从管道来", format: "markdown" },
    ]);
    expect(() => collectDocs("-", undefined, () => "   ")).toThrow(/stdin/);
  });
});

describe("产品级不变量", () => {
  it("自动密码是 4 位数字", () => {
    for (let i = 0; i < 50; i++) expect(randomPin()).toMatch(/^\d{4}$/);
  });
  it("有效期钳在 1–30 天(没有永久链接)", () => {
    expect(expiryFromDays(undefined)).toBeUndefined();
    expect(expiryFromDays(0)).toBe(86400);
    expect(expiryFromDays(3)).toBe(3 * 86400);
    expect(expiryFromDays(999)).toBe(30 * 86400);
    expect(expiryFromDays(-5)).toBe(86400);
  });
  it("发布一律带自动生成的 4 位密码,调用方给不了密码(结构上做不到)", () => {
    const docs = [{ name: "a.md", content: "# x", format: "markdown" as const }];
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const { body, password } = publishBody(docs);
      expect(password).toMatch(/^\d{4}$/);
      expect(body.password).toBe(password);
      seen.add(password);
    }
    expect(seen.size).toBeGreaterThan(1); // 不是固定值
    // publishBody 的入参里没有 password 这一项:传进去也不会被采纳
    const { body } = publishBody(docs, { password: "hunter2" } as unknown as { title?: string });
    expect(body.password).not.toBe("hunter2");
  });
  it("--expires 透传成 expiresIn 秒;不传则用后端默认档", () => {
    const docs = [{ name: "a.md", content: "# x", format: "markdown" as const }];
    expect(publishBody(docs, { expiresDays: 3 }).body.expiresIn).toBe(3 * 86400);
    expect("expiresIn" in publishBody(docs).body).toBe(false);
  });
});

describe("store(本机状态)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hspace-state-"));
    process.env.HSPACE_CONFIG_DIR = dir;
    delete process.env.HSPACE_API_KEY;
  });
  afterEach(() => {
    delete process.env.HSPACE_CONFIG_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it("记住 / 取回 / 忘掉 editToken", async () => {
    const store = await import("../src/store.js");
    expect(store.recall("abc1234")).toBeUndefined();
    store.remember({ slug: "abc1234", url: "https://abc1234.example", editToken: "t0k", createdAt: 1 });
    expect(store.recall("abc1234")?.editToken).toBe("t0k");
    store.forget("abc1234");
    expect(store.recall("abc1234")).toBeUndefined();
  });
  it("状态文件权限是 0600(里面有 editToken 与 API key)", async () => {
    const store = await import("../src/store.js");
    store.remember({ slug: "s1", url: "u", createdAt: 1 });
    expect(statSync(store.statePath()).mode & 0o777).toBe(0o600);
  });
  it("环境变量的 API key 优先于本机保存的", async () => {
    const store = await import("../src/store.js");
    store.setApiKey("saved-key");
    expect(store.apiKey()).toBe("saved-key");
    process.env.HSPACE_API_KEY = "env-key";
    expect(store.apiKey()).toBe("env-key");
    delete process.env.HSPACE_API_KEY;
  });
  it("logout 清 key 但留下 editToken(匿名页还管得了)", async () => {
    const store = await import("../src/store.js");
    store.setApiKey("k");
    store.remember({ slug: "s2", url: "u", editToken: "t", createdAt: 1 });
    store.setApiKey(undefined);
    expect(store.apiKey()).toBeUndefined();
    expect(store.recall("s2")?.editToken).toBe("t");
  });
});
