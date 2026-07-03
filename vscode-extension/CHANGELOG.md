# Changelog

## 0.1.x

首个公开版本。
- **发布强制带密码**:每次发布自动生成随机 4 位数字密码,通知中直接显示
- 剪贴板改为复制「链接 + 密码」,可直接粘贴分享
- 暂时屏蔽 `htmlshare.alwaysAskPassword` 配置项(询问逻辑移除,后续版本可能恢复)
- 插件更名为 **HSpace**(ID `agentx1boss.hspace`),publisher 改为 `agentx1boss`
- README 拆分中英双语(README.md 英文 / README.zh-CN.md 中文)
- 新增 CI:打 tag 自动发布到 VS Code Marketplace 与 Open VSX
- 一键发布当前 HTML 文件,链接自动复制
- 「最近发布」侧栏面板:打开 / 复制链接 / 设密码 / 删除
- 匿名发布默认 7 天过期,可配置
- 可选 API Key 登录(永久链接)与自建后端支持
