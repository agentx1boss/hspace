import { describe, expect, it } from "vitest";
import { passwordPage, PW_AUTOFILL_JS } from "../src/html";

function runAutofill(href: string): {
  value: string;
  replacedWith: string[];
  focused: boolean;
  removedAttrs: string[];
} {
  const loc = { href, hash: new URL(href).hash };
  const removedAttrs: string[] = [];
  const input = {
    value: "",
    removeAttribute(name: string) {
      removedAttrs.push(name);
    },
  };
  let focused = false;
  const button = {
    focus(opts: unknown) {
      expect(opts).toEqual({ preventScroll: true });
      focused = true;
    },
  };
  const doc = {
    querySelector(selector: string) {
      if (selector === "input[name=password]") return input;
      if (selector === "button[type=submit]") return button;
      return null;
    },
  };
  const replacedWith: string[] = [];
  const hist = {
    replaceState(_state: unknown, _title: string, url: string) {
      replacedWith.push(url);
    },
  };

  new Function("location", "document", "history", PW_AUTOFILL_JS)(loc, doc, hist);
  return { value: input.value, replacedWith, focused, removedAttrs };
}

describe("PW_AUTOFILL_JS", () => {
  const positives = [
    ["#p=1234", "1234"],
    ["#a=1&p=1234", "1234"],
    ["#p=1234&a=1", "1234"],
    ["#p=%E4%BD%A0%23%26", "你#&"],
    ["#p=100%", "100%"],
    ["#p=a+b", "a+b"],
  ] as const;

  for (const [fragment, expected] of positives) {
    it(`预填并清理 ${fragment}`, () => {
      const r = runAutofill(`https://draft.zhanjian.space/${fragment}`);
      expect(r.value).toBe(expected);
      expect(r.replacedWith).toEqual(["https://draft.zhanjian.space/"]);
      expect(r.focused).toBe(true);
      // autofocus 必须被摘掉,否则它的候选刷新会把焦点从提交按钮抢回输入框
      expect(r.removedAttrs).toEqual(["autofocus"]);
    });
  }

  const negatives = ["#pp=9", "#help=1", "#p=", "", `#p=${"a".repeat(200)}`];

  for (const fragment of negatives) {
    it(`拒绝或忽略 ${fragment || "无 hash"}`, () => {
      const r = runAutofill(`https://draft.zhanjian.space/${fragment}`);
      expect(r.value).toBe("");
      expect(r.replacedWith).toEqual([]);
      expect(r.focused).toBe(false);
      // 没预填就不许动 autofocus —— 输入框仍该是落焦点的地方
      expect(r.removedAttrs).toEqual([]);
    });
  }

  it("清理 fragment 时保留 query", () => {
    const r = runAutofill("https://draft.zhanjian.space/?lang=zh#p=1");
    expect(r.value).toBe("1");
    expect(r.replacedWith).toEqual(["https://draft.zhanjian.space/?lang=zh"]);
    expect(r.focused).toBe(true);
    expect(r.removedAttrs).toEqual(["autofocus"]);
  });
});

describe("passwordPage 的预填脚本输出", () => {
  it("正常密码页输出纯内联脚本,不引用外部脚本", () => {
    const page = passwordPage(false, "en", null);
    expect(page).toContain(`<script>${PW_AUTOFILL_JS}</script>`);
    expect(page).not.toContain("<script src");
    expect(PW_AUTOFILL_JS).not.toMatch(/https?:\/\//);
  });

  it("密码错误页不输出脚本,避免旧 fragment 再次预填", () => {
    expect(passwordPage(true, "en", null)).not.toContain("<script");
  });
});
