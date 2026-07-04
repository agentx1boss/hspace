# 推广册子(源文件)

这三篇是**线上推广合集的源文件**,用于社媒引流与落地页「亲自体验」入口:

- **中文册子**:https://q0i7otn.zhanjian.space · 密码 **1024**(源文件在本目录根)
- **英文册子**:https://aqm3anv.zhanjian.space · 密码 **1024**(源文件在 `en/`)
- 落地页 `亲自体验` 入口按语言分流:中文版指向 q0i7otn,英文版指向 aqm3anv(`landing.ts` 的 `trySlug`)
- 它本身就是用 HSpace 发布的(dogfooding);含 2 篇 Markdown + 1 篇自包含 HTML,演示合集、目录导航、html 篇目悬浮目录

## 更新(改文案不换链接)

改完本目录三篇后,用 founder API Key 走 PATCH 升版——**链接与密码 1024 不变**:

```bash
cd backend
KEY=$(grep '^HSPACE_API_KEY=' ../.env | cut -d= -f2)
python3 - <<'PY'
import json
d="../assets/promo"
files=[
 {"name":"1-邀请函.md","markdown":open(d+"/1-邀请函.md").read()},
 {"name":"2-能做什么.md","markdown":open(d+"/2-能做什么.md").read()},
 {"name":"3-一个例子.html","html":open(d+"/3-一个例子.html").read()},
]
json.dump({"title":"HSpace 邀请函","files":files}, open("/tmp/promo.json","w"), ensure_ascii=False)
PY
# 中文册子 q0i7otn / 英文册子 aqm3anv(改对应目录后各 PATCH 一次)
curl -s -X PATCH https://html-share.kzhan.workers.dev/pages/q0i7otn \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d @/tmp/promo.json
```

> 定位/slogan 变更时,记得同步这里(见 docs/operations.md 的发布 checklist)。

## 社媒 copy 模板(引流到册子;统一带密码 1024)

**X / Twitter(英文,≤280)**
> I hid the actual point of this post behind a password 👇
> q0i7otn.zhanjian.space · pass 1024
> (you'll get it once you're in — that's the product)
> Ship to one, not to all. — HSpace, targeted sharing for AI-built demos.

**即刻(中文,口语)**
> 做了个东西一句话说不清,给你一份"稿"自己翻 👇
> q0i7otn.zhanjian.space,密码 1024
> 翻到第 3 页有个真·demo。进去你就懂了——这套"输密码才看得到"的体验,就是我做的工具。

**小红书(中文,标题党 + emoji)**
> 🔒 我把这篇笔记的"正文"锁起来了,密码 1024
> 👉 q0i7otn.zhanjian.space
> AI 写完的 demo/方案,只想发给该看的人?点开这份"稿",你就体验了一遍 ✨
> #AI编程 #Cursor #开发者工具 #私密分享
