# Aoi-system · 迭代改进日志（2026-09-06 审阅轮）

> 本日志记录 2026-09-06 对 v2.0.0 的审阅与多轮改进，每轮一个独立 Git commit
> （含当时全部项目资产，可随时 checkout 回退），并附回退方式。
> 十项问题主迭代（v1.7.0–v2.0.0）的变更见 CHANGELOG.md 与各版本 tag。

## 回退方式

```bash
git tag                       # 查看所有版本锚点
git checkout <tag|commit>     # 查看某状态（只读）
git revert <commit>           # 撤销某一轮改进
git reset --hard <tag|commit> # 整体回退到某状态（谨慎，会丢弃其后的提交）
```

| 锚点 | 说明 |
|---|---|
| `v1.7.0` / `v1.8.0` / `v1.9.0` / `v2.0.0` | 十项问题主迭代四个版本（tag 指向对应 commit） |

---

## 第 0 轮 · 状态写入与版本锚点

- **改动**：`docs/STATUS.md` 头部重写为 v2.0.0 状态速览（含待线上操作清单：重跑 schema / 重新部署 / relay 重启）；新建本日志；为 v1.7.0–v2.0.0 四个版本打 git tag。
- **目的**：固化当前状态，明确"明早测试 Supabase"前需要做什么。

## 第 1 轮 · 修复回归：周边表单 previewRmb 引用悬空（审阅发现）

- **问题**：v1.8.0 重写录入逻辑时删除了 `Aoi.orders.previewRmb` 函数，但 `index.html` 周边（预建商品）表单的 `pCurrency` / `pPrice` 仍引用它 → 录入周边价格时控制台报错、无预览。
- **改动**：
  - `js/orders.js`：恢复通用 `previewRmb(priceId, currencyId, outId)`（周边表单保留自动预览；订单表单已改用 v1.8.0 的 `previewEntry` 双模式，互不影响）。
  - `tests/orders-entry.test.js`：新增回归测试（周边表单两个元素引用的函数存在且可执行）。总用例 62，全绿。
- **教训**：删除公共函数前应全仓 grep 引用（本次主迭代遗漏了 index.html 内联 onclick 的引用方式）。

## 第 2 轮 · CI 质量门禁 + 部署前测试

- **改动**：`.github/workflows/deploy.yml` 部署前增加 `npm ci && npm test` 步骤——测试不通过则不部署。
- **目的**：把"交付前测试全绿"的工作纪律固化为 CI 强制约束（对应 AGENTS.md 注意事项第 2 条）。

## 第 3 轮 · 文件结构重组（仅移动，不删除任何文件）

- **改动**（`git mv`，内容零变更，历史保留）：
  - `DESIGN.md` / `DESIGN-claude.md` / `PRODUCT.md` → `docs/design/`（根目录只留 README / CHANGELOG / CONTRIBUTING / AGENTS / CLAUDE 五个高频入口文档）
  - 同步更新 `AGENTS.md`、`CLAUDE.md`、`README.md`、`docs/ROADMAP.md` 中的路径引用。
- **待检查清单（暂不删除，明早确认后处理）**：
  - `DESIGN-claude.md`（内容为 Claude 官网风格分析，与本项目视觉关联弱，建议明日确认后归档或删除）
  - `node_modules/` 中遗留的 `playwright` / `playwright-core`（无 package.json 声明，疑似历史残留）

## 第 4 轮 · README 重写 + CONTRIBUTING 同步

- **改动**：`README.md` 全量重写（产品概述 / 功能全景 / 架构 / 部署 / 团员侧升级 / 测试 / 结构 / QQ 机器人 / 安全）；`CONTRIBUTING.md` 项目结构章节同步 16 模块现状。
