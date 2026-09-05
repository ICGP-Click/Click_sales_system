# 参与贡献 (Contributing)

> **原作者：秋洛 (QiuLuo)** · **当前维护者：郑 (zhengdaode)**
> 仓库：[zhengdaode/Aoi-system](https://github.com/zhengdaode/Aoi-system)

## 工作纪律

- **每次改动完成后，必须创建一个对应的 Git commit**（便于追踪和回滚，版本锚点见 `docs/ITERATION_LOG.md`）。
- **每次改动完成后，必须编写或更新相关测试，交付前 `npm test` 全绿**（CI 部署前强制执行）。
- 路线图见 [docs/ROADMAP.md](docs/ROADMAP.md)，当前状态见 [docs/STATUS.md](docs/STATUS.md)。

## 项目结构

```
├── index.html              # 页面骨架 + 全部视图（无框架 SPA）
├── css/styles.css          # 自定义样式 + 黑夜模式 + 响应式表格/卡片
├── js/                     # 16 个功能模块（window.Aoi 命名空间）
│   ├── core.js             # 路由/通用工具/撤销/总览
│   ├── data.js             # Supabase 读写 + RPC 错误分类
│   ├── auth.js / team.js   # 认证 / 团队与成员
│   ├── orders.js           # 订单/批次/活动/买家/类型（核心模块）
│   ├── import.js           # Excel 矩阵解析
│   ├── calc.js             # 汇率换算
│   ├── intl.js             # 国际运费分摊 + 仪表盘
│   ├── approval.js         # 交费审核
│   ├── shipping.js         # 发货管理
│   ├── member.js           # 团员端（免登录）
│   ├── notify.js           # 通知生成 + QQ 推送入口
│   ├── bot.js              # OneBot v11 客户端（群发/私聊）
│   ├── limits.js           # 限购购买计划计算器
│   ├── warehouse.js        # 囤货地
│   └── image-upload.js     # 图床适配
├── relay/relay.js          # QQ 机器人 relay（ECS）
├── supabase-schema.sql     # 数据库 schema（可重复执行）
├── scripts/build-config.js # CI 注入密钥
├── tests/                  # Vitest + jsdom（npm test）
└── docs/                   # ROADMAP / STATUS / ITERATION_LOG / design/
```

## 如何贡献

1. **Fork** 本仓库
2. 创建 Feature 分支 (`git checkout -b feature/AmazingFeature`)
3. 修改对应的 JS/CSS/HTML 文件，**同步补充/更新 `tests/` 用例**
4. 提交修改 (`git commit -m 'feat: Add some AmazingFeature'`)
5. 推送到分支 (`git push origin feature/AmazingFeature`)
6. 开启 **Pull Request**（CI 会先跑测试）

## 代码风格

- 全局函数挂在 `window.Aoi` 命名空间上（保持跨模块兼容）
- 原生 JS（var 风格为主，与现有一致），不引入构建步骤
- 渲染用户/云端数据时使用 `escapeHtml()` 防 XSS
- 新增功能尽量在对应的 JS 模块中添加，避免修改 index.html
- 删除/重命名任何被 index.html 内联 onclick 引用的函数前，先全仓 grep 引用

## 安全注意事项

- 绝不硬编码 API Key / URL / Token
- 渲染任何外部数据前调用 `escapeHtml()`
- 修改 RLS 策略前先在 Supabase 控制台验证
- 收款码等敏感图片不上传第三方图床

## 联系

发现 Bug 或有功能建议？提交 [GitHub Issue](https://github.com/zhengdaode/Aoi-system/issues)。
