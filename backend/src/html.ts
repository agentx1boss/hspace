// 内嵌页面模板：密码输入页 / 404

export function passwordPage(slug: string, error = false): string {
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>需要密码</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
       display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#0f1115;color:#e6e6e6}
  .card{background:#1a1d24;padding:32px;border-radius:12px;width:320px;box-shadow:0 8px 30px rgba(0,0,0,.4)}
  h1{font-size:18px;margin:0 0 16px}
  input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #333;background:#0f1115;color:#fff;font-size:14px}
  button{width:100%;margin-top:12px;padding:10px;border:0;border-radius:8px;background:#4f7cff;color:#fff;font-size:14px;cursor:pointer}
  .err{color:#ff6b6b;font-size:13px;margin-top:8px}
</style></head>
<body>
  <form class="card" method="POST" action="/">
    <h1>🔒 此页面受密码保护</h1>
    <input type="password" name="password" placeholder="请输入密码" autofocus required>
    <button type="submit">查看</button>
    ${error ? '<div class="err">密码不正确，请重试。</div>' : ""}
  </form>
</body></html>`;
}

export function lockedPage(): string {
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>尝试次数过多</title>
<style>body{font-family:sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#0f1115;color:#888;text-align:center}</style>
</head><body><div><h1>⏳ 尝试次数过多</h1><p>密码错误次数过多，请 15 分钟后再试。</p></div></body></html>`;
}

export function notFoundPage(): string {
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>页面不存在</title>
<style>body{font-family:sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#0f1115;color:#888}</style>
</head><body><div><h1>404</h1><p>该页面不存在、已删除或已过期。</p></div></body></html>`;
}
