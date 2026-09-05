# Changelog

## v1.7.0 (2026-09-06)

### Fixed
- **团员端保存静默丢失（P0 根因①）** — `update_team_data_by_member_key` 旧版只执行 update：`team_data` 缺行时影响 0 行仍返回成功，表现为"保存成功但什么都没写"（仅团员端复现，团长端走 upsert 自动补行故正常）。改为 `insert ... on conflict do update`
- **错误吞噬（P0 根因②）** — `getTeamDataByMemberKey` 此前把 RPC 缺失 / 网络失败 / 密钥错误全部吞成"密钥无效"。新增 `Aoi.explainRpcError` 分类透出（RPC 不存在→提示重跑 schema；版本冲突→提示刷新；密钥无效→提示向团长确认），`member.enter` 补 try/catch
- **整 blob 覆盖竞态（P0 根因③）** — 写入 RPC 新增可选 `expected_updated_at` 乐观锁参数并返回新 `updated_at`；团员端 `Aoi.member.persist` 统一携带/更新版本号，冲突时清空本地版本并提示刷新
- **`supabase-schema.sql` 幂等升级** — 团员端两个 RPC 改为 drop 后重建（`create or replace` 无法变更签名，旧库重跑会报错），文件头附线上重跑验证清单与排查 SQL

### Added
- **QQ 机器人私聊推送** — 此前 `sendPrivate` 定义了但全链路无调用方，私聊功能实际不存在；新增 `Aoi.bot.pushPrivate`（按 `memberMeta` QQ 逐人私聊，返回成功/失败/未绑定清单），通知推送提供「群发(@) / 私聊 / 全部」三选；群发 @ 改为直接按 buyer→qq 映射，不再依赖 body 前缀格式
- **relay 转发节流** — NapCat 转发改串行队列，相邻两条间隔 ≥1s（批量私聊防风控）
- **relay https 校验** — https 站点下保存 http relay 地址直接拦截并说明原因（浏览器混合内容拦截）；设置页 placeholder 同步提示
- **团员端掩码回执** — 地址保存成功后显示掩码回执（首尾各 2 字 + `****`），确认"保存的确实是刚输入的"且不暴露原文
- **测试基建** — `package.json` + vitest + jsdom（`npm test`）；harness 将 index.html 装入 jsdom 并 eval `js/` 模块，首批 26 个用例覆盖 calc 换算、intl 分摊、错误分类、乐观锁 persist、私聊推送、掩码

### Changed
- `getTeamDataByMemberKey` 返回结构新增 `updatedAt`（数据版本），失败改为抛错（不再返回 null 吞错）

## v1.6.0 (2026-08-17)

### Added
- **每人应付国际费改版** — 表头改为 4 列（购买者 / 购买内容 / 国际金额 / 国内额外金额）；国内额外金额为每人手动可编辑字段（`payments[].domesticFee`），不参与国际费重算
- **全表导出图片** — 所有数据表新增「导出图片」按钮（html2canvas CDN，白底 PNG 下载）
- **全表行号** — 各数据表首列新增行号，方便核对行数

### Changed
- **表格可读性** — 表头底色 + 斑马纹（`tbody tr:nth-child(even)`）+ 点线行分隔，方便查行数

### Fixed
- 团员端提交动作（地址 / QQ 绑定 / 改圈名 / 凭证 / 收货 / 换囤货地）统一 try/catch 容错并 toast
- 催缴通知：已交费 / 待审核成员自动清除过期的未发催缴
- QQ 机器人群发改为 @ 提及（`[CQ:at]`，有绑定 QQ 者），替代逐条私聊
- `get_team_by_member_key` SQL 的 `member_key = member_key` 自引用歧义 → 表别名 + `limit 1`

## v1.5.1 (2026-08-16)

### Fixed
- **登录页下滑露出主体内容** — `#screen-app` 的 `md:flex` 在桌面端覆盖 `hidden`，导致主体常驻可见；改为 `flex`
- **建立我的团无任何效果** — `team_members` 的 `members_select` 策略自引用触发 `infinite recursion`，读团队/成员/数据全部失败；新增 `is_team_member`（security definer）替代自引用 EXISTS
- **建团/读团失败被静默吞掉** — `loadTeam` 不再把 `r.error` 当「无团队」，改为抛错并在 `enterApp` 里 toast 出真实原因

### Added
- **团名可修改** — 团长在「账号与设置」团队信息卡可改名（复用 `teams_update_owner` RLS，无新 RPC）

### Changed
- **部署密钥注入** — `js/config.js`（真实 anon key）已 gitignore，新增 `js/config.example.js` 模板；GitHub Actions（`.github/workflows/deploy.yml`）与 Netlify（`netlify.toml` + `scripts/build-config.js`）在部署时注入密钥

## v1.5.0 (2026-08-16)

### Added
- **批次命名** — 新建到货批次支持命名（可改名），可展开查看批次内活动
- **总览「开设 IP 一览」** — 列出所有 IP，点 IP 查看其活动，活动可跳转订单管理
- **删除 IP** — 清除该 IP 在订单/周边/活动/常用类型中的关联
- **类型筛选与大类折叠** — 按 IP 常用类型加模糊搜索；手动录入类型面板按发货线路分组可折叠
- **国际计算「保存分摊到订单」** — 分摊结果落库到每件商品（`orders.intlFee`）与每人待交国际运费（`payments.intlFee`），配合催缴通知
- **活动/订单联动** — 活动管理点击活动名跳转订单管理（按活动筛选）
- **买家（CN）管理** — 活动管理页新增买家列表（圈名 / 订单数 / 未处理完数），可手动删除；删除活动时自动清理无待处理订单的买家 CN

### Fixed
- 无法删除到货批次（各批次下拉未同步刷新）
- 国际计算器无法选择已创建的到货批次
- 活动管理无法查看已有活动（订单反推活动补全）
- 删除活动无效（`ensure()` 反推导致活动复现）

## v1.4.0 (2026-08-12)

### 🧭 项目方向
Aoi-system 从 mossasari fork 独立为完全独立仓库，聚焦**团长管理端**。团员端代码保留不再主动推进。

### Added
- **国际运费加权计算器** — 嵌入为独立 screen，按重量分摊国际运费
  - 实时计算面板（去皮总重、目标金额、差额、均价）
  - 可编辑表格（单重和加权费用可手动覆盖）
  - 从团购系统按团次导入商品，同商品数量按 CN 累加
  - 国际排发表 tab（按买家汇总清单、国际运费、打包费）
  - CSV 导出和复制表格
  - localStorage 持久化（`ifc_` 前缀隔离）
  - 独立仓库 [zhengdaode/intl-freight-calc](https://github.com/zhengdaode/intl-freight-calc)
- **P6 黑夜模式** — 全局切换按钮，57 条 CSS 覆盖，`prefers-color-scheme` 自动检测
- **P12 功能开关** — 云端可配置，`applyFeatureToggles` 统一控制
- **P15 自定义背景** — 纯色/图片背景 + 自动遮罩层
- **图片裁切** — Cropper.js CDN + `image-crop.js` 弹窗式裁切 UI
- **本地调试账户** — `test@test.com` / `test123`，绕过 Supabase 认证
- **P1 首次引导** — 首次访问自动弹出覆盖层，逐一说明功能入口

### Security
- 自定义确认弹窗 `showConfirmModal` 替换所有 `confirm()`
- 30 秒撤销机制（柄图删除和订单删除后可恢复）
- 交肾两步确认（提交前弹出摘要确认卡）
- 行内表单验证（blur 实时校验，空字段红框）
- 63 处 `innerHTML` 全部包裹 `escapeHtml()`
- 移除硬编码 Supabase URL/Key → 占位符
- 移除硬编码图床 API 默认值

### Changed
- **模块化拆分** — ~2900 行单文件 index.html → 11 个独立 JS 模块
- **仪表盘 tab 调整** — 国际运费 + 云端设置移至 tab 栏末尾
- **首页精简** — 移除计算器入口，仅在仪表盘显示（受功能开关控制）
- P2 云端设置信息过载 → 6 区块拆为 3 分组
- P3 对比度修复（11 处）+ 触控目标 36→44px

### Fixed
- CSP 阻止外部图床
- `initCloudData` 竞态条件
- XLSX 矩阵导入行偏移（fake header 导致数据下移一行）
- 图床上传 API 灵活适配
- `saveQueryKey` 模块拆分丢失
- Debug 模式刷新改为页面重载

### Docs
- CHANGELOG.md
- IMPROVEMENT_PLAN.md (P0-P24)
- CONTRIBUTING.md
- DESIGN.md, PRODUCT.md

---

## v1.3.0 and earlier

See git history for details prior to v1.3.0.
