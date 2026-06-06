# DingTalk Agent Skills

一组面向钉钉、叮当 OKR 和 DingTalk/Alidocs 工作流的本地 Agent Skills。

这个项目不是钉钉官方 SDK，也不是 `dws` 的替代品。它的定位是把可复用的业务流程、审阅规则、输出格式和浏览器兜底路径沉淀成 skills；具体的钉钉原子操作优先交给 `dws` 执行。

## 包含的 Skills

| Skill | 作用 |
| --- | --- |
| `dingdang-okr-export` | 从叮当 OKR 页面导出 OKR Excel：每人一个 tab，O/KR 分层，包含权重、进度、KR 进度说明和采集质量标记。 |
| `dingtalk-browser-export` | 从已登录 Chrome 当前打开的 DingTalk/Alidocs 文档导出为 docx、PDF 或 Markdown，用作网页导出兜底。 |
| `dingtalk-knowledge-organize` | 对钉钉知识库做盘点、分类、移动、重命名、去重和 CSV 审批式整理。底层操作优先走 `dws doc` / `dws wiki`。 |
| `dingtalk-minutes-access-request` | 只处理钉钉 AI 听记权限申请、权限复查和阻塞诊断。听记正文、摘要、转写读取应走 `dws minutes`。 |
| `dingtalk-oa-approval` | 审阅钉钉 OA 审批，要求读完整审批详情、流水、附件、链接文档和依据材料后再给审批意见。 |

## 适用场景

- 你已经用 Codex、Claude Code 或类似 Agent 运行本地 skills。
- 你使用 `~/.agents/skills` 作为本机 skills 安装目录。
- 你希望把钉钉相关的“固定业务流程”版本化，而不是每次临时写提示词。
- 你已经有可用的 `dws` 命令或登录态，用来完成实际钉钉操作。

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

## 使用方式

安装后，在支持 skills 的 Agent 中直接提出任务即可。例如：

```text
导出 2026 Q2 叮当 OKR，整理成每个人一个 tab 的 Excel
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

## 权限和凭证

不同 skill 的权限来源不一样：

| Skill | 是否需要开放平台 AppKey/AppSecret |
| --- | --- |
| `dingdang-okr-export` | 当前不需要。它使用已登录 Chrome 中的叮当 OKR 页面，前提是当前浏览器账号本身有 OKR 查看权限。 |
| `dingtalk-browser-export` | 当前不需要。它使用已登录 Chrome 中当前打开的 DingTalk/Alidocs 页面。 |
| `dingtalk-minutes-access-request` | 当前不需要开放平台 key。它使用浏览器登录态申请或复查 AI 听记访问权限；正文读取走 `dws minutes`。 |
| `dingtalk-knowledge-organize` | 通常需要可用的 `dws` 授权，部分旧脚本也支持读取本机 `~/.dingtalk-skills/config`。不要把配置提交到仓库。 |
| `dingtalk-oa-approval` | 优先使用 `dws oa` 授权；只有在 DWS 详情缺字段且用户已授权时，才会用本机开放平台配置补读。 |

`dingdang-okr-export` 目前不是纯 API 实现。未来如果 `dws okr` 或叮当 OKR 官方 API 可用，才需要根据对应 API 的企业权限、应用授权或服务开通方式配置凭证。

## 设计原则

1. **dws 优先。** 文档、知识库、审批、AI 听记等钉钉原子能力优先使用 `dws`。
2. **一个业务边界一个 skill。** OKR、审批、知识库整理、听记权限、浏览器导出不要合并成一个宽泛 skill。
3. **不保存敏感状态。** 仓库不应包含 token、cookie、浏览器 profile、storage state、真实导出数据或本地配置。
4. **可审计输出。** 涉及批量整理、审批或 OKR 导出时，保留可复查的 CSV、JSON 或 Excel 质量说明。

## 目录结构

```text
.
├── install.sh
├── skills/
│   ├── dingdang-okr-export/
│   ├── dingtalk-browser-export/
│   ├── dingtalk-knowledge-organize/
│   ├── dingtalk-minutes-access-request/
│   └── dingtalk-oa-approval/
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
