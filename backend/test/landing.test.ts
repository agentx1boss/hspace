import { describe, it, expect } from "vitest";
import { landingPage } from "../src/landing";

const LANGS = ["en", "zh"] as const;

describe("落地页渲染完整性", () => {
  // L 的类型是 Record<string, string>,少写一个键 tsc 不报错,运行时会渲染成 "undefined"
  it.each(LANGS)("%s:没有未定义的文案键", (lang) => {
    expect(landingPage(lang)).not.toContain("undefined");
  });

  // 红线是「不引外部脚本/字体/图片」;canonical / alternate 是元数据,不产生资源请求,不在此列。
  it.each(LANGS)("%s:自包含,不引外部脚本/样式/字体/图片", (lang) => {
    const html = landingPage(lang);
    expect(html).not.toMatch(/<script[^>]+\bsrc=/);
    expect(html).not.toMatch(/<link[^>]+rel="(?:stylesheet|preload|preconnect)"/);
    expect(html).not.toMatch(/<img[^>]+src="https?:\/\//);
    expect(html).not.toMatch(/@import|url\(https?:\/\//);
  });
});

// 口径守卫:positioning.md §4「事实边界」里写明「别说」的表述,任何渠道都不许出现。
// 对应实现收敛见 positioning.md §9 与 issue #18 / #19;实现补齐后才可放宽这里。
describe("落地页口径守卫(positioning §4 事实边界)", () => {
  it.each(LANGS)("%s:不宣称无限定的即时撤回(改共享密码有 24h 会话窗口,#18)", (lang) => {
    const html = landingPage(lang);
    expect(html).not.toContain("instant revoke");
    expect(html).not.toContain("旧密码立即失效");
    expect(html).not.toContain("改密码即撤回");
  });

  it.each(LANGS)("%s:不宣称所有页面必须有密码(裸 API 可发公开页)", (lang) => {
    const html = landingPage(lang);
    expect(html).not.toContain("必须输入密码");
    expect(html).not.toContain("requires a password");
  });

  it.each(LANGS)("%s:不宣称阅读页无任何第三方请求(用户 md 里的外链会照常加载,#19)", (lang) => {
    const html = landingPage(lang);
    expect(html).not.toContain("无任何第三方请求");
    expect(html).not.toContain("no third-party requests");
  });

  it.each(LANGS)("%s:营销语境不自称托管", (lang) => {
    const html = landingPage(lang);
    expect(html).not.toContain("HTML 托管");
    expect(html).not.toContain("HTML host");
  });

  it.each(LANGS)("%s:不暗示永久链接", (lang) => {
    const html = landingPage(lang);
    expect(html).not.toContain("永久链接,");
    expect(html).not.toContain("permanent link.");
  });
});

describe("落地页定位口径(Markdown 优先,HTML 副位)", () => {
  it.each(LANGS)("%s:编辑器 mock 的主角是 .md 文件", (lang) => {
    expect(landingPage(lang)).toContain(".md — my-project");
  });

  it.each(LANGS)("%s:hero 文案提到 Markdown/.md", (lang) => {
    const html = landingPage(lang);
    const lead = html.slice(html.indexOf('class="lead"'), html.indexOf('class="tension"'));
    expect(lead).toMatch(/\.md|Markdown/);
  });

  it("en:meta description 以私密 Markdown 分享领衔", () => {
    expect(landingPage("en")).toContain("Publish Markdown privately");
  });

  it("zh:meta description 以私密阅读页领衔", () => {
    expect(landingPage("zh")).toContain("排成私密阅读页");
  });
});
