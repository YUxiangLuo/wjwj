# 依赖安全与风险接受

依赖升级后，必须同时运行：

```sh
bun audit
bun run audit:applicable
```

`bun audit` 保留上游公告的完整可见性；`audit:applicable` 是发布门禁，只允许下表中按“公告 ID + 包名”精确匹配的已评估残留。任何新公告、包名变化或 ID 变化都会使门禁失败。

## 当前残留（复核日期：2026-07-29）

| 公告 | 依赖路径 | 适用性结论 |
| --- | --- | --- |
| [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2) | `react-router-dom` → `react-router` | 不适用。公告限定于 unstable RSC API；本项目三入口均为声明式 `BrowserRouter`，未使用 RSC 路由或 action。 |
| [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | 开发依赖 `drizzle-kit` → `esbuild` | 不进入生产运行路径。项目开发服务器使用 `Bun.serve`，不运行 esbuild development server。 |
| [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) | 开发依赖 `drizzle-kit` → `tsx` → `esbuild` | 不适用。公告针对 Windows 上的 esbuild development server；项目运行环境为 Linux，且不启动该服务器。 |

React Router 的通用路由、开放重定向和 Framework Mode DoS 公告已通过升级至 `7.18.1+` 清除；`happy-dom` 的 `ws` 链已升级至包含修复的版本。

## 复核规则

- 每次锁文件或路由架构变化时运行两层审计。
- 若引入 React Router Framework/RSC Mode、esbuild development server 或 Windows 部署，上述对应接受立即失效。
- 即使 `audit:applicable` 通过，也不得隐藏原始 `bun audit` 结果。
