# 安全边界

系统面向受信任内网，但仍须使用合成或充分脱敏的总体数据。学生可重抽并导出被抽中行的全部字段，不能依赖“一次样本”保护隐私；真实受限数据需要先实现字段级披露控制和相应审计。

## 鉴权与账号

- 角色使用独立 Cookie 会话；服务端始终校验会话、角色与资源归属。前端的预期账号约束只用于阻止标签页共享 Cookie 导致的串号，不是凭据，URL 中绝不放会话 token。
- 登录、退出、主动改密和检测到身份变化后整页跳转。退出只有服务端确认撤销成功才离开页面；失败时明确提示尚未安全退出。
- 密码使用 Argon2，并限制计算并发。不存在账号与密码错误统一返回 `INVALID_CREDENTIALS`。
- 学生、教师新建或重置后的密码分别为学号、工号；管理员使用独立密码。主动改密会旋转当前会话并清除旧会话；重置、删除账号和会话清理必须在同一事务完成。
- 生产构建将 `DEV_AUTH_MODE` 固定为 `"0"`。不要用未构建的 `NODE_ENV=production bun src/index.ts` 上课，也不得公开部署 `DEMO_MODE=1`。
- 本项目不提供首次改密、登录失败锁定或登录限速。硬删除及级联范围见[教学指南](docs/TEACHING.md)，备份见 [DATABASE.md](DATABASE.md)。

附件会校验允许的扩展名和基础文件签名，响应 MIME 不信任上传声明。生产仍建议将用户文件置于独立文件域名或对象存储。

## HTTP 与部署

生产响应统一设置 CSP、frame 防护、内容类型嗅探防护、Referrer/Permissions Policy 和同源资源策略。TLS、可信代理和 HSTS 前提见[运行与部署](docs/OPERATIONS.md)。

## 依赖审计

依赖或锁文件变化必须运行：

```sh
bun audit
bun run audit:applicable
```

`audit:applicable` 是发布门禁，但不能替代或隐藏完整的 `bun audit` 结果。当前仅接受开发依赖 `drizzle-kit` 间接引入的 esbuild 公告 [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) 和 [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr)：项目不运行 esbuild development server，后一公告还仅影响 Windows。若运行该服务器、改为 Windows 部署、公告 ID 或包路径变化，接受立即失效。
