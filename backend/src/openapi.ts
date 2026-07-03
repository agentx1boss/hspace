// HSpace OpenAPI 3 规范 —— 供 GPT Actions / agent 框架 / 函数调用直接消费。
// 由 GET /openapi.json 提供,servers.url 按请求 origin 动态填充。

export function openapiSpec(origin: string): Record<string, unknown> {
  return {
    openapi: "3.0.3",
    info: {
      title: "HSpace API",
      version: "0.2.1",
      license: { name: "MIT" },
      description:
        "私密分享 AI 生成的内容:把一段 HTML/Markdown(或一批文档的合集)发布成带密码的公开链接。\n\n" +
        "**给 AI 调用方的要点:**\n" +
        "- 私密是产品默认。要让页面受保护,必须在 `password` 里传一个访问密码(建议生成 4 位数字);" +
        "省略 `password` 会创建任何人可访问的公开页面。\n" +
        "- 发布成功后请把返回的 `url` 和你使用的密码**一起**转达给用户——没有密码无法访问。\n" +
        "- Markdown 会被渲染成排版精良的阅读页;合集(`files`)会生成一个目录页与逐篇导航。",
    },
    servers: [{ url: origin, description: "HSpace API" }],
    // 匿名可用({} 表示无需鉴权);登录用户用 Bearer API Key 解锁永久链接与更高配额
    security: [{}, { bearerAuth: [] }],
    paths: {
      "/publish": {
        post: {
          operationId: "publish",
          summary: "发布内容为带密码的私密链接",
          description:
            "发布单个文档(`html` 或 `markdown` 三选一其一)或一个合集(`files`,≥2 篇)。" +
            "要保持私密请务必传 `password`。",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PublishRequest" },
                examples: {
                  markdown: {
                    summary: "发布一篇 Markdown(带密码)",
                    value: { markdown: "# 标题\n\n正文……", password: "4831", filename: "note.md" },
                  },
                  collection: {
                    summary: "发布一个合集(md/html 混排)",
                    value: {
                      title: "Q3 方案",
                      password: "4831",
                      files: [
                        { name: "1-总览.md", markdown: "# 总览\n…" },
                        { name: "2-附录.html", html: "<!doctype html><title>附录</title>…" },
                      ],
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "发布成功",
              content: { "application/json": { schema: { $ref: "#/components/schemas/PublishResult" } } },
            },
            "400": { description: "请求无效(missing_content / collection_too_few / too_many_docs)", content: errContent() },
            "401": { description: "API Key 无效(invalid_api_key)", content: errContent() },
            "413": { description: "内容超过体积上限(too_large)", content: errContent() },
            "422": { description: "内容被安全扫描拦截(content_blocked)", content: errContent() },
            "429": { description: "发布过于频繁(rate_limited)", content: errContent() },
            "503": { description: "服务繁忙,全局日配额熔断(service_busy)", content: errContent() },
          },
        },
      },
      "/pages/{slug}": {
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" }, description: "页面/合集短码" },
        ],
        patch: {
          operationId: "updatePage",
          summary: "修改密码 / 有效期(内容覆盖仅限登录、非合集)",
          description:
            "改密码或有效期。匿名不可移除密码、不可改为永久、不可覆盖内容;合集不支持改内容。" +
            "鉴权用 Bearer(登录)或 `X-Edit-Token`(匿名发布时返回的凭据)。",
          parameters: [{ $ref: "#/components/parameters/EditToken" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateRequest" },
              },
            },
          },
          responses: {
            "200": { description: "已更新", content: { "application/json": { schema: okSchema() } } },
            "400": { description: "无可更新字段 / 类型不符 / 合集不可变", content: errContent() },
            "403": { description: "无权限或该操作需登录", content: errContent() },
            "404": { description: "页面不存在", content: errContent() },
          },
        },
        delete: {
          operationId: "deletePage",
          summary: "删除页面/合集(链接立即失效)",
          parameters: [{ $ref: "#/components/parameters/EditToken" }],
          responses: {
            "200": { description: "已删除", content: { "application/json": { schema: okSchema() } } },
            "403": { description: "无权限", content: errContent() },
            "404": { description: "页面不存在", content: errContent() },
          },
        },
      },
      "/pages": {
        get: {
          operationId: "listPages",
          summary: "列出当前账户的页面(需登录)",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "页面列表",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      pages: { type: "array", items: { $ref: "#/components/schemas/PageSummary" } },
                    },
                  },
                },
              },
            },
            "401": { description: "未登录(unauthorized)", content: errContent() },
          },
        },
      },
      "/health": {
        get: {
          operationId: "health",
          summary: "健康检查",
          security: [{}],
          responses: {
            "200": {
              description: "服务正常",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { ok: { type: "boolean" }, service: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "账户 API Key" },
      },
      parameters: {
        EditToken: {
          name: "X-Edit-Token",
          in: "header",
          required: false,
          schema: { type: "string" },
          description: "匿名发布时返回的编辑凭据(改/删非本账户页面时使用)",
        },
      },
      schemas: {
        PublishRequest: {
          type: "object",
          description: "`html`、`markdown`、`files` 三者恰选其一。要保持私密请传 `password`。",
          properties: {
            html: { type: "string", description: "HTML 源码(单文件发布)" },
            markdown: { type: "string", description: "Markdown 文本(单文件发布,渲染成阅读页)" },
            files: {
              type: "array",
              minItems: 2,
              description: "合集篇目(≥2 篇);每项 `html`/`markdown` 二选一,可混排",
              items: { $ref: "#/components/schemas/CollectionFile" },
            },
            title: { type: "string", description: "合集标题(仅 files 时用)" },
            filename: { type: "string", description: "文件名(单文件,用于展示与标题回退)" },
            password: {
              type: "string",
              description: "访问密码。省略则页面公开可访问;要私密务必提供(建议 4 位数字)。",
            },
            expiresIn: {
              type: "integer",
              nullable: true,
              description: "有效期(秒)。匿名钳制在 [60, 604800];null=永久(需登录)。省略用默认 7 天。",
            },
          },
        },
        CollectionFile: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", description: "文件名,如 1-总览.md(用于排序与标题回退)" },
            html: { type: "string" },
            markdown: { type: "string" },
          },
        },
        UpdateRequest: {
          type: "object",
          properties: {
            password: { type: "string", nullable: true, description: "新密码;null 或空串=移除密码(仅登录)" },
            expiresIn: { type: "integer", nullable: true, description: "新有效期(秒);null=永久(仅登录)" },
            html: { type: "string", description: "覆盖内容(仅登录、非合集、类型需一致)" },
            markdown: { type: "string", description: "覆盖内容(仅登录、非合集、类型需一致)" },
          },
        },
        PublishResult: {
          type: "object",
          properties: {
            slug: { type: "string" },
            url: { type: "string", description: "分享链接;私密页面需配合密码访问" },
            expiresAt: { type: "string", nullable: true, description: "过期时间 ISO8601;null=永久" },
            passwordProtected: { type: "boolean" },
            docs: {
              type: "array",
              description: "合集时返回的篇目清单",
              items: {
                type: "object",
                properties: { index: { type: "integer" }, title: { type: "string" } },
              },
            },
            editToken: {
              type: "string",
              nullable: true,
              description: "匿名发布返回的编辑凭据;请妥善保存,是后续改/删的唯一凭据",
            },
          },
        },
        PageSummary: {
          type: "object",
          properties: {
            slug: { type: "string" },
            filename: { type: "string", nullable: true },
            created_at: { type: "integer" },
            expires_at: { type: "integer", nullable: true },
            hits: { type: "integer" },
            protected: { type: "integer", description: "1=有密码" },
          },
        },
        Error: {
          type: "object",
          properties: { error: { type: "string" }, file: { type: "string" }, maxBytes: { type: "integer" } },
        },
      },
    },
  };
}

function errContent() {
  return { "application/json": { schema: { $ref: "#/components/schemas/Error" } } };
}
function okSchema() {
  return { type: "object", properties: { ok: { type: "boolean" }, slug: { type: "string" } } };
}
