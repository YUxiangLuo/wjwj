# 依赖安全与风险接受

依赖升级后，必须同时运行：

```sh
bun audit
bun run audit:applicable
```

`bun audit` 保留上游公告的完整可见性；`audit:applicable` 是发布门禁，只允许下表中按“公告 ID + 包名”精确匹配的已评估残留。任何新公告、包名变化或 ID 变化都会使门禁失败。

## 当前残留（复核日期：2026-08-09）

| 公告 | 依赖路径 | 适用性结论 |
| --- | --- | --- |
| [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | 开发依赖 `drizzle-kit` → `esbuild` | 不进入生产运行路径。项目开发服务器使用 `Bun.serve`，不运行 esbuild development server。 |
| [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) | 开发依赖 `drizzle-kit` → `tsx` → `esbuild` | 不适用。公告针对 Windows 上的 esbuild development server；项目运行环境为 Linux，且不启动该服务器。 |

React Router 公告已通过升级至 `7.18.2+` 清除；`happy-dom` 的 `ws` 链已升级至包含修复的版本。

## 生产 HTTP 防护

`bun run start` 会先执行生产构建；若直接以 `NODE_ENV=production bun src/index.ts` 启动，则必须预先运行 `bun run build`。生产模式下，Bun 服务从 `dist/` 提供构建产物，并统一设置 CSP（包括 `frame-ancestors 'self'`）、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy` 和同源资源策略。构建脚本使用根路径资源 URL，因此 SPA 深链也能正确加载静态资源。

TLS 与 HSTS 仍由正式环境的反向代理或负载均衡器负责；只有确认所有流量均已强制 HTTPS 后才能启用 HSTS。

## 复核规则

- 每次锁文件或路由架构变化时运行两层审计。
- 若引入 esbuild development server 或 Windows 部署，上述对应接受立即失效。
- 即使 `audit:applicable` 通过，也不得隐藏原始 `bun audit` 结果。
