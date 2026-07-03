# HSpace

一键把当前 HTML 文件发布成可分享的公网链接,支持访问密码。专为"把 AI 生成的单页 HTML 快速发给别人看"设计。

Publish any HTML file as a shareable public link in one click, with optional password protection. Built for sharing AI-generated single-page HTML.

## 功能

- ☁️ **一键发布**:打开 `.html` 文件,点编辑器右上角云图标(或右键菜单),链接自动复制到剪贴板
- 🔒 **访问密码**:可为任意页面设置/修改/移除密码,访客需输入密码才能查看(24 小时内免重复输入)
- 🗂 **发布管理**:资源管理器侧栏的「HTML Share · 最近发布」面板,可打开 / 复制链接 / 设密码 / 删除
- ⏳ **自动过期**:匿名发布默认 7 天后自动失效,不留垃圾
- 🛡 **内容隔离**:每个页面独立子域(`<slug>.zhanjian.space`),互不影响,且与 API 域名隔离

## 快速开始

1. 安装扩展
2. 打开任意 `.html` 文件
3. 点击编辑器右上角的 ☁️ 图标
4. 链接已复制,直接粘贴给别人 🎉

无需注册、无需配置,开箱即用。

## 设置密码

三种方式任选:

- 发布成功的通知里点「设置密码」
- 侧栏「最近发布」面板右键页面 →「设置/修改密码」
- 命令面板 → `HTML Share: 设置/修改密码`

输入时留空回车 = 移除密码。

## 配置项

| 设置 | 默认值 | 说明 |
|---|---|---|
| `htmlshare.apiBaseUrl` | 官方托管实例 | 后端 API 地址,可指向自建后端 |
| `htmlshare.defaultExpiryDays` | `7` | 发布链接的默认过期天数 |
| `htmlshare.alwaysAskPassword` | `false` | 每次发布时都询问是否设置密码 |

## 使用限制(默认托管实例)

- 单文件 ≤ 2 MB,仅支持单个 HTML 文件
- 匿名发布默认 7 天过期
- 每 IP 每小时最多发布 20 次
- 禁止发布钓鱼、恶意脚本等违规内容,违规页面会被下架

## 自建后端

后端是一个 Cloudflare Worker(R2 + D1 + KV),完全开源。部署自己的实例后,把 `htmlshare.apiBaseUrl` 指过去即可。详见 [GitHub 仓库](https://github.com/agentx1boss/htmlspace)。

## 隐私说明

发布操作会把当前 HTML 文件内容上传到后端服务器并生成公开链接;除此之外不收集任何数据。删除页面后内容立即不可访问。

## License

MIT
