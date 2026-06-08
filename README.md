# Stardust Skills

星尘公用 Agent Skills 仓库，用来沉淀公司内部可复用的 Agent 工作流、判断标准、输出格式和工具调用边界。

这个项目不是钉钉官方 SDK，也不是 `dws`、小青 MCP 或任何业务系统的替代品。它的定位是让 Agent 在星尘的真实业务里按统一规则工作：先读事实源，再按业务判断标准分析，最后在用户确认后执行高影响操作。

当前仓库覆盖钉钉、叮当 OKR、DingTalk/Alidocs、OA 审批、知识库整理、AI 听记权限、候选人面试和小青面试系统。具体原子操作仍交给对应工具完成：钉钉能力优先走 `dws`，候选人和面评业务事实优先走 `xiaoqing_interview` MCP，浏览器只作为明确授权后的兜底路径。

## 包含的 Skills

| Skill | 作用 |
| --- | --- |
| `dingtang-okr-review` | 从叮当 OKR 页面导出 OKR Excel，并按 CEO 视角在 KR 层级做证据核实、打分和超时折扣。 |
| `dingtalk-browser-export` | 从已登录 Chrome 当前打开的 DingTalk/Alidocs 文档导出为 docx、PDF 或 Markdown，用作网页导出兜底。 |
| `dingtalk-knowledge-organize` | 对钉钉知识库做盘点、分类、移动、重命名、去重和 CSV 审批式整理。底层操作优先走 `dws doc` / `dws wiki`。 |
| `dingtalk-minutes-access-request` | 只处理钉钉 AI 听记权限申请、权限复查和阻塞诊断。听记正文、摘要、转写读取应走 `dws minutes`。 |
| `dingtalk-oa-approval` | 审阅钉钉 OA 审批，要求读完整审批详情、流水、附件、链接文档和依据材料后再给审批意见。 |
| `stardust-interview` | 星尘候选人面试工作流：读取小青候选人材料和岗位画像，按需结合 DWS AI 听记，按 Derek 的证据链标准准备面试建议、结构化面评，并在确认后 dry run + 提交小青面评。 |

## 适用场景

- 你已经用 Codex、Claude Code 或类似 Agent 运行本地 skills。
- 你使用 `~/.agents/skills` 作为本机 skills 安装目录。
- 你希望把星尘内部反复使用的业务流程版本化，而不是每次临时写提示词。
- 你希望 Agent 能继承统一的审阅规则、证据标准、提交协议和输出格式。
- 你已经有可用的业务工具授权，例如 `dws`、`xiaoqing_interview` MCP、浏览器登录态或本地开放平台配置。

## 安装

克隆仓库后运行：

```bash
./install.sh
```

安装脚本会把 `skills/*` 同步到：

```text
~/.agents/skills
```

安装时会排除本地状态文件，例如：

- `config.json`
- `.env`
- `node_modules`
- `__pycache__`
- `.storage_state.json`
- `.chrome-profile`
- 导出的 Excel、JSONL、日志和输出目录

## 从本机 Skills 更新仓库

当你在本机 `~/.agents/skills` 里修改了本仓库已有的同名 skill，可以运行：

```bash
./scripts/sync-from-agents.sh
```

脚本只会更新仓库 `skills/` 里已经存在的同名目录，不会把本机其他 skill 自动加入仓库。同步时会排除 `config.json`、`.env`、浏览器状态、输出目录、日志和导出文件。

## 使用方式

安装后，在支持 skills 的 Agent 中直接提出任务即可。例如：

```text
导出 2026 Q2 叮当 OKR，整理成每个人一个 tab 的 Excel，并审核韩露的 KR 完成情况
```

```text
这个钉钉 AI 听记链接打不开，帮我申请访问权限
```

```text
盘点这个钉钉知识库，先给我一个 CSV 整理建议，不要直接移动文件
```

```text
看一下这个钉钉 OA 审批材料是否足够，给出审批意见
```

```text
根据 AI 听记和小青候选人材料，帮我准备这个候选人的三面结构化面评
```

## 权限和凭证

不同 skill 的权限来源不一样。仓库只保存流程和规则，不保存 token、cookie、浏览器状态或私有导出数据。

| Skill | 是否需要开放平台 AppKey/AppSecret |
| --- | --- |
| `dingtang-okr-review` | 当前导出不需要。它使用已登录 Chrome 中的叮当 OKR 页面，前提是当前浏览器账号本身有 OKR 查看权限。CEO review 阶段会按用户授权读取本地文件、`memory_recall` 和 `dws` 资料核实 KR。 |
| `dingtalk-browser-export` | 当前不需要。它使用已登录 Chrome 中当前打开的 DingTalk/Alidocs 页面。 |
| `dingtalk-minutes-access-request` | 当前不需要开放平台 key。它使用浏览器登录态申请或复查 AI 听记访问权限；正文读取走 `dws minutes`。 |
| `dingtalk-knowledge-organize` | 通常需要可用的 `dws` 授权，部分旧脚本也支持读取本机 `~/.dingtalk-skills/config`。不要把配置提交到仓库。 |
| `dingtalk-oa-approval` | 优先使用 `dws oa` 授权；只有在 DWS 详情缺字段且用户已授权时，才会用本机开放平台配置补读。 |
| `stardust-interview` | 需要可用的 `xiaoqing_interview` MCP OAuth 授权；读取 AI 听记时还需要可用的 `dws minutes` 授权。 |

`dingtang-okr-review` 的 OKR 导出目前不是纯 API 实现。未来如果 `dws okr` 或叮当 OKR 官方 API 可用，才需要根据对应 API 的企业权限、应用授权或服务开通方式配置凭证。

## 设计原则

1. **事实源优先。** 先用对应业务系统读取事实，再分析；不要用本地缓存、浏览器页面或猜测替代正式事实源。
2. **一个业务边界一个 skill。** OKR、审批、知识库整理、听记权限、浏览器导出、候选人面试不要合并成一个宽泛 skill。
3. **高影响动作先确认。** 审批同意/拒绝、面评提交、批量移动文件、删除内容等动作必须先展示依据和预期影响，用户确认后再执行。
4. **不保存敏感状态。** 仓库不应包含 token、cookie、浏览器 profile、storage state、真实导出数据或本地配置。
5. **可审计输出。** 涉及批量整理、审批、OKR 导出或面评提交时，保留可复查的证据、字段、链接、revision 或质量说明。

## 目录结构

```text
.
├── install.sh
├── skills/
│   ├── dingtang-okr-review/
│   ├── dingtalk-browser-export/
│   ├── dingtalk-knowledge-organize/
│   ├── dingtalk-minutes-access-request/
│   ├── dingtalk-oa-approval/
│   └── stardust-interview/
└── README.md
```

## 安全说明

公开仓库前请确认：

```bash
rg -n "(secret|token|cookie|authorization|storage_state|config\\.json|password)" .
```

如果需要本地配置，请使用各 skill 的 `config.example.json` 作为模板，在安装后的本机 skill 目录中创建 `config.json`，不要提交到仓库。

## License

MIT
