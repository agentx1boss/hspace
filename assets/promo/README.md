# 推广册子(源文件)

这三篇是**线上推广合集的源文件**,用于社媒引流与落地页「亲自体验」入口:

- 线上地址:https://q0i7otn.zhanjian.space · 访问密码 **1024**
- 落地页 `亲自体验` 区块与社媒帖子都指向它
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
curl -s -X PATCH https://html-share.kzhan.workers.dev/pages/q0i7otn \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d @/tmp/promo.json
```

> 定位/slogan 变更时,记得同步这里(见 docs/operations.md 的发布 checklist)。
