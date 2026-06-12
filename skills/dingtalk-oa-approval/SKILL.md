---
name: dingtalk-oa-approval
description: 钉钉 OA 审批审阅与提醒工作流。凡是用户提到钉钉审批、OA、待审批、同意/拒绝/退回、录用、离职、请假、出差、外出、财务付款、报销、合同、晋升、立项特批，或让你定时检查新审批/超过 3 天审批，都必须使用本 skill。它要求先完整读取审批详情、流水、附言、附件、链接文档、PDF、面试记录、试用期考核标准等材料，再给出审批决策和附言；DWS 优先，DWS 读不到全文时按用户授权打开钉钉界面补读。
---

# DingTalk OA Approval Review

这个 skill 用于帮助 Derek 审阅钉钉 OA 审批。目标不是快速给结论，而是先把审批材料读完整，再按公司审批逻辑给出可执行意见。

## 与其他 DingTalk skills 的边界

不要把本 skill 合并进其他 DingTalk skill。它们负责不同业务，合并后会让触发范围过宽，容易在审批、文档、听记和知识库清理之间误用工具。

- `dws doc` / `dws wiki`：负责钉钉文档/知识库的创建、读取、写入、成员权限等文档与知识库操作。
- `dingtalk-browser-export`：负责从已登录 Chrome 导出当前 DingTalk/Alidocs 文档为 Word、PDF 或 Markdown。
- `dingtalk-knowledge-organize`：负责知识库盘点、分类、移动、重命名和 CSV 审批式整理。
- `dingtalk-minutes-access-request`：只负责钉钉 AI 听记权限申请、权限页复查和阻塞诊断；听记读取走 `dws minutes`。

审批内如果出现钉钉文档、Alidocs、知识库文件或 AI 听记链接，可以按材料类型临时调用对应能力读取材料；但审批判断、审批意见、附言和审批动作仍以 `dingtalk-oa-approval` 为主。AI 听记正文、摘要和转写读取统一走 `dws minutes`，只有遇到权限阻塞时才使用 `dingtalk-minutes-access-request`。

## 基本原则

1. **先审阅，后动作。** 同意和拒绝属于审批决策动作，只有用户明确说“批了/同意/拒绝”，并且你已经读完材料、拿到 `taskId` 后，才执行。评论不是同意或拒绝；只要审阅结论不是执行同意或执行拒绝，就自动把清晰的审阅意见评论到审批里，不再单独等待用户确认评论。
2. **所有可访问材料必须读完。** 包括审批详情、审批流水、审批附言/评论、附件、链接文档、PDF、合同、报销凭证、面试记录、试用期考核标准、交接文档等。
3. **通过的前提是所有实质文件都已审阅完成，并且有相应标准/依据文档。** 只要审批中的附件、链接、PDF、合同、面试记录、试用期标准、BRD、工时评估、制度依据、预算依据等任一实质材料未读到、未读完或缺少标准文档，不得建议或执行同意。
4. **缺材料和读不到是两回事，但处理动作相同：不得通过。** 如果审批里没有材料，说明缺口并建议退回补充；如果 DWS、API、网页或钉钉客户端都读不到材料，要明确说“工具未读到”，并退回要求申请人在评论或表单中补充可访问链接/重新上传可访问文件，不得用“附言要求后补”替代审批前审阅。
5. **不要根据标题直接判断。** 标题只能用于识别流程类型，不能替代表单、附件和附言。
6. **一般优先退回补充，不直接拒绝。** 但若存在明显不一致、矛盾、虚假、不合规或高风险事项，可以建议直接拒绝。
7. **退回不是拒绝。** `revoke` 是撤回自己发起的审批，不是退回；`reject` 是拒绝审批，不能当作“退回补材料”使用。DWS 当前没有可靠的“退回上一环节”命令时，不要用 `reject` 冒充退回；应通过审批评论要求申请人补充材料/可访问链接，并保持待办不通过。只有用户明确要求“拒绝”时才调用 `reject`。
8. **当前不需要 Derek 处理的审批要跳过。** 如果详情或任务列表显示当前 `RUNNING` 任务不属于 Derek，不做完整材料审阅，也不提醒为待处理事项；只记录为列表口径异常或他人待办。

## 工具顺序

优先使用 `dws`，所有命令加 `--format json`。

先读取 DWS skill（如果当前会话还没有读过）：

```bash
sed -n '1,220p' /Users/derek/.agents/skills/dws/SKILL.md
```

常用只读命令：

```bash
dws oa approval list-pending --page 1 --size 30 --format json
dws oa approval detail --instance-id <processInstanceId> --format json
dws oa approval records --instance-id <processInstanceId> --format json
dws oa approval tasks --instance-id <processInstanceId> --format json
```

如果 CLI 包装层疑似丢字段，直接走 canonical MCP CLI 再试一次：

```bash
dws mcp oa get_processInstance_detail --json '{"processInstanceId":"<processInstanceId>"}' --format json
```

如果 `detail` 返回 `formValueVOS: [{"details":[]}]`、附言只有 `ADD_REMARK` 但无正文，或详情接口解析失败：

- 明确记录 DWS 版本、实例 ID、返回症状。
- 继续读取 `records` 和 `tasks`，但不要基于空详情做通过判断。
- 如果用户已授权使用 API，并且本机有 `~/.dingtalk-skills/config`，用 OpenAPI 补读详情；不要在输出里打印 access token、AppKey、AppSecret。
- 若用户已授权打开钉钉界面，切到钉钉客户端或 Chrome 读取页面详情。
- 若钉钉界面仍失败，向用户说明具体失败点，并要求打开对应审批详情页后继续。

## OpenAPI 详情补读

当 DWS 详情为空、字段丢失、或任务归属异常时，允许调用已授权的钉钉 OA OpenAPI/API 作为补充事实源。当前 OA 详情不完整时不能强行只用 DWS；以后如果 DWS 新增完整详情能力，再优先收敛到 DWS。前提是用户已授权，且应用已开通 `qyapi_aflow` 权限。

获取 token 和详情：

```bash
set -a; source ~/.dingtalk-skills/config; set +a
token=$(curl -sS "https://oapi.dingtalk.com/gettoken?appkey=${DINGTALK_APP_KEY}&appsecret=${DINGTALK_APP_SECRET}" | jq -r '.access_token // empty')
curl -sS -X POST "https://oapi.dingtalk.com/topapi/processinstance/get?access_token=${token}" \
  -H 'Content-Type: application/json' \
  -d '{"process_instance_id":"<processInstanceId>"}'
```

常用提取：

```bash
jq -r '
  .process_instance as $p |
  "TITLE: \($p.title)",
  "BUSINESS: \($p.business_id)",
  "CREATE: \($p.create_time)",
  "STATUS: \($p.status) RESULT: \($p.result)",
  "ORIGINATOR_DEPT: \($p.originator_dept_name)",
  "FIELDS:",
  ($p.form_component_values[]? | "- [\(.component_type)] \(.name // "") = \(.value // "")"),
  "REMARKS:",
  ($p.operation_records[]? | select(.remark != null and .remark != "") | "- \(.date) \(.operation_type) \(.operation_result): \(.remark)"),
  "TASKS:",
  ($p.tasks[]? | "- \(.taskid) \(.task_status) \(.task_result) user=\(.userid) url=\(.url // "")")
'
```

OpenAPI 审阅要点：

- `form_component_values` 是表单字段的事实源，可能包含 DDBizSuite JSON、附件数组、链接、表格行等嵌套内容。
- `operation_records` 是审批附言/评论事实源；审批留言里的补充信息必须纳入判断。
- `tasks` 是审批动作和是否需要处理的事实源；只审阅、提醒、操作当前用户且 `task_status=RUNNING` 的任务。若待办列表仍显示但 OpenAPI 中当前 RUNNING 任务不属于当前用户，跳过该审批，不做完整材料审阅，也不要操作。
- 附件里的 `DDAttachment.fileId`/`spaceId` 先按“OA 附件读取降级路径”处理。不要把 `fileId` 直接当 `dws drive download --node` 的 dentryUuid，也不要把同名 `doc search` 结果直接当作附件正文；同名文档只能作为补充候选，必须和原附件文件名、正文关键信息或审批事实交叉验证。
- 输出和日志中不得暴露 token、AppKey、AppSecret、cookie 或 OAuth code。
- 在 `ceo-agent-service` 自动化里，API token、AppKey、AppSecret、cookie、OAuth code、签名下载 URL 不得写入 SQLite、日志、报告、DingTalk 回复、agent 输出或 `audit_summary`；只能记录“已使用授权 API 补读详情”这类事实。

## 钉钉界面 fallback

当 DWS 不能读全文且用户允许打开审批页时：

1. 先尝试钉钉客户端内的 `审批 -> 审批中心 -> 待处理的`。
2. 如果工作通知里有审批通知，也可以从 `工作通知:北京星尘纪元智能科技有限公司` 打开对应卡片。
3. Chrome 直达审批页可能缺钉钉客户端身份，出现“用户信息验证失败”；这时不要继续在 Chrome 硬试，改用钉钉客户端。
4. 直达详情 URL 可从 PC bundle 路由推导，但 PC 客户端可能提示“暂时无法打开该链接，请在手机上查看”。遇到这种情况要如实报告。
5. 智能合同里的合同正文/附件如果 DWS 和文档搜索都读不到，可以在钉钉客户端审批中心搜索申请人、合同名或业务编号，打开审批详情里的 `合同正文 -> 预览`。预览页通常能显示 Word/PDF 正文、AI 概览和页码；需要逐页滚动读完。预览页 URL 可能含临时签名、STS token 或下载参数，不得复制到报告、日志或回复里。
6. 只读审阅时不要点击同意、拒绝、撤销按钮；但若当前任务要求自动评论，且已经确认不是同意/拒绝动作，可以提交评论。

审批中心链接：

```text
https://aflow.dingtalk.com/dingtalk/pc/query/pchomepage.htm?corpid=ding8ffc70a4ef94915f35c2f4657eb6378f&swfrom=mainNav#/upcoming?type=upcoming
```

移动详情 URL 模板（不保证 PC 可打开）：

```text
https://aflow.dingtalk.com/dingtalk/mobile/query/formService?dd_share=false&showmenu=false&dd_progress=false&dd_enable_replace=true&corpid=ding8ffc70a4ef94915f35c2f4657eb6378f&bizType=approve#/detail?procInstId=<processInstanceId>
```

## 审阅流程

每条审批按这个顺序处理：

1. 从 `list-pending` 提取标题、流程类型、`processInstanceId`、`processCode`、状态和更新时间。
2. 先用 `tasks` 或 OpenAPI `tasks` 确认当前 `RUNNING` 任务是否属于 Derek；不属于就跳过，不继续打开附件、文档或链接。
3. 用 `detail` 读取业务编号、创建时间、发起部门、表单字段、附件和任务节点。
4. 用 `records` 读取审批流水和附言/评论。若有 `ADD_REMARK` 但无正文，必须说明正文未读到。
5. 打开审批内所有可访问链接、附件、文档和 PDF。
6. 若任一实质材料读不到或缺少对应标准/依据文档，停止实质判断；建议动作必须是退回补充，建议附言必须要求申请人在评论或表单中补可访问链接/重新上传文件，并列出未读到的材料名称。
7. 如果是录用审批，必须读取面试记录和试用期考核标准；没有读到不得下结论为同意。
8. 如果是财务/报销/付款，必须读取付款依据、预算/项目归属、发票/凭证、合同/订单/账单、费用说明和风险。
9. 如果是出差/差旅/报销，先检索内部差旅制度，再对照审批内容判断。
10. 给出建议动作、核心理由、制度依据、关键风险、建议附言。
11. 只有用户确认执行同意或拒绝时，再用 `tasks` 中当前用户的 `taskId` 调用 approve/reject；若结论是补材料、暂缓、暂不判断或材料不可读，直接用审批评论写清楚缺口和下一步要求。

## 审批材料读取补充

### OA 附件读取降级路径

OA 表单里的 `DDAttachment.fileId` 是审批附件 ID，不等同于 `dws drive download --node` 需要的 32 位 dentryUuid。审批附件优先走钉钉官方审批附件下载接口；只有官方下载失败时，才用文档搜索、企业检索或钉钉界面补读。

1. 先从 OpenAPI 原始字段提取 `fileName`、`fileType`、`fileSize`、`fileId`、`spaceId`，保留这些信息用于比对。
2. 优先调用官方审批附件下载接口获取真实附件：

```bash
# 使用新版 OpenAPI token；不要打印 token 或 downloadUri。
curl -sS -X POST "https://api.dingtalk.com/v1.0/workflow/processInstances/spaces/files/urls/download" \
  -H "x-acs-dingtalk-access-token: <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"processInstanceId":"<processInstanceId>","fileId":"<fileId>"}'
```

接口返回 `result.downloadUri` 后，用该临时地址下载二进制附件，再按 `fileType` 抽取正文：`docx` 解 `word/document.xml`，`xlsx` 读工作表 XML/sharedStrings，`pdf` 用 PDF 文本抽取，图片用 OCR 或人工查看。下载地址通常短期有效，且可能含签名；不得写入日志、SQLite、审批评论、DingTalk 回复或 agent 输出。

在 `ceo-agent-service` 中，优先使用服务侧已封装的 `DwsClient.download_oa_process_attachment(processInstanceId, fileId)` 和 worker 注入的 `downloaded_attachment.text`，不要让子 agent 自己把 `fileId` 当 drive node 下载。

3. 如果官方审批附件下载接口返回 `noPermission`、超时或网络错误，可重试一次；仍失败时，记录具体错误，并用文件名查找可读的钉钉文档节点作为候选：

```bash
dws doc search --query "<fileName without extension or key title words>" --page-size 10 --format json
dws mcp aisearch search_enterprise --json '{"queries":["<fileName> <审批标题> <关键业务词>"],"searchTypes":["document"],"timeRange":""}' --format json
```

4. 对搜索结果只接受能和原附件匹配的候选：文件名/标题高度一致，并且正文 snippet 明确包含审批中的项目、客户、金额、主体、日期等关键字段。不要因为搜到同名或相似文件就默认匹配；同名在线文档可能是模板、旧版本或另一个节点。
5. 搜到 `nodeId` 后按类型读取：
   - `extension=adoc`：`dws doc read --node "<nodeId>" --format json`
   - `extension=axls`：`dws sheet list` 后用 `dws sheet range read`
   - `extension=docx|pptx|pdf|md` 且 `doc info/download` 可用：`dws doc download --node "<nodeId>" --format json`，再用本地工具抽取文本；若企业搜索已返回完整可判断 snippet，也可作为辅助证据，但合同/关键财务附件仍应尽量下载或读取全文。
6. 如果 `doc search` 找不到，但 `aisearch search_enterprise` 能返回带完整正文片段的同名文件，可引用该检索结果继续判断，并在材料记录中说明“通过企业知识检索按文件名补读”。
7. 如果应用已开通开放平台权限 `Storage.Dentry.Search`，可用官方存储搜索接口按附件名、空间或其他线索定位 dentry；若接口返回 `Forbidden.AccessDenied.AccessTokenPermissionDenied`，说明当前应用缺少该权限，继续走文档搜索、企业检索和钉钉界面，不要把它当成附件不存在。
8. 只有官方审批附件下载、文档搜索、企业检索、官方存储搜索和已授权钉钉界面都无法读到时，才把附件列为“工具无法访问/材料缺口”。一旦列为材料缺口，本单不得建议通过；必须建议退回，要求申请人在审批评论或表单中补充可访问链接或重新上传可读文件。

已验证案例：
- OA 附件 `项目实施计划（第三曲线大模型解决方案）(2)(2)(1).docx` 不能用同名 `dws doc search` 结果替代；同名 Alidoc 节点曾是空模板。正确路径是用 OpenAPI 详情中的 `fileId=224596585916` 调官方审批附件下载接口，真实 docx 可读到项目范围、责任分工、T+30/T+60 里程碑、风险评估和交付物清单。
- OA 附件 `专家网络平台一期工时评估.pdf` 的 `drive download` 因空间权限失败，但 `dws doc search --query "专家网络平台一期工时评估"` 可找到同名 Alidoc 节点并用 `dws doc read` 读取全文。
- OA 附件 `背景_统一事实底稿模板.docx` 的 `drive download` 因空间权限失败，但 `dws doc search --query "背景_统一事实底稿模板"` 可找到同名 Alidoc 节点并读取转让定价事实底稿全文。
- 智能合同正文 `0526星尘设备交接单.docx` 的 `drive download` 因空间权限失败，`doc search` 和企业检索也没有可信同名结果；钉钉客户端审批中心搜索 `Lynne` 后打开对应合同审批，在 `合同正文 -> 预览` 中可逐页读取 Word 正文和 AI 概览。

钉钉文档和表格：

- `alidocs.dingtalk.com/i/nodes/<nodeId>` 可能是在线文档，也可能是钉钉表格。
- 在线文档用 `dws doc read --node "<url-or-nodeId>" --format json`。
- 如果提示 `当前节点是钉钉表格（扩展名=axls）`，改用：

```bash
dws sheet list --node "<nodeId>" --format json
dws sheet info --node "<nodeId>" --sheet-id "<sheetId>" --format json
dws sheet range read --node "<nodeId>" --sheet-id "<sheetId>" --range "A1:Z80" --format json
```

面试系统：

- 录用审批里的 `https://interview.hr.startask.net/candidates/<candidateId>` 直连通常会跳到登录页。
- 打开登录接口即可带钉钉身份登录：

```text
https://interview.hr.startask.net/api/auth/dingtalk/login?next=/candidates/<candidateId>
```

- 进入候选人页后优先点击“导出完整评审包”，保存 HTML 后读取全文；评审包通常包含简历摘要、HR 判断、每轮面试记录、AI 综合分析、附件清单和流程时间线。
- 若页面已显示“已提取文本”的简历/听记附件，也要优先读取导出的评审包；只在评审包缺失关键信息时再逐个下载附件。
- 面试记录如果只读到列表摘要，不算读完；必须展开或导出后读到每轮评价、风险和总结。

## 差旅制度检索

审阅出差、差旅报销、交通费、住宿费、餐费时，先用企业知识检索：

```bash
dws mcp aisearch search_enterprise --json '{"queries":["公司差旅制度 出差标准 费用额度 报销材料 先申请后消费 高铁 飞机 住宿 餐费"],"searchTypes":["document"],"timeRange":""}' --format json
```

注意：普通 `dws aisearch` 只暴露搜人能力；企业知识检索必须走 `dws mcp aisearch search_enterprise`。

常用差旅依据：

- 必须“先申请/报备 -> 后消费 -> 再报销”。
- 可出差场景包括客户新签合同、交付/验收问题、供应商考察/培训、KA 客户维护、有明确商机的拓客。
- 出差申请通常提前 3 天提交；紧急情况需说明。
- 国内交通原则是低价、合理、节约成本；高铁超过 5 小时才可考虑飞机，机票需 <= 5 折并有比价截图。
- 一类城市住宿：员工级 250-300 元/天，总监及以上 400-450 元/天。
- 餐费：一类城市 80 元/天，其他城市 50 元/天；有招待餐不享受餐补。
- 报销材料包括出差申请、出差报告、酒店明细、机票/车票行程单、比价截图、付款凭证等。

## 审批判断规则

### 立项特批

看项目是否符合公司战略，是否能带来产品、算法或交付效率升级。仅毛利率低、但没有战略价值、产品升级价值或算法提效价值的，建议退回上一环节重写理由。

### 第一曲线标注项目

第一曲线标注项目的综合毛利率必须至少达到 25% 才可以审批通过。若综合毛利率低于 25%，默认不得同意；只有同时满足以下条件时才可作为例外继续审阅：

- 审批类型或表单明确属于特批。
- 有管理负责人在审批流、附言或会议纪要中明确同意该低毛利项目。
- 特批理由写清楚战略价值、客户价值、算法提效、产品升级、交付能力沉淀或后续可复制价值。

若低于 25% 且不满足上述例外条件，自动评论要求补充特批依据和管理负责人明确意见，并保留待办；不得用“后续补充”作为通过前提。

### 录用审批

必须审阅：

- 岗位和业务问题是否清晰。
- 试用期考核标准是否有可衡量目标和关键指标。
- 试用期要求是否直接对应最近会议讨论的问题和当前痛点。
- 薪资是否符合市场标准；必要时联网搜索市场薪资。
- 面试记录是否证明候选人高潜、高匹配。

没有读到试用期考核标准、面试记录或薪资，不得建议同意；建议退回补充，要求申请人在评论或表单中补可访问链接/重新上传材料。

### 离职审批

看交接文档是否清晰完整，接收人是否同意，附言是否有未解决风险。若用户已明确说明“已经离职，直接同意”，可按用户确认执行，但仍要记录交接和后续 HR/行政/IT 风险点。

### 请假

理由合理即可。评论通常表达关心身体、注意休息。

### 财务、报销、付款

重点看流程、依据、风险、项目、预算。没有依据不放行。必须确认：

- 付款/报销对象和金额。
- 预算或项目归属。
- 合同、订单、账单、验收、发票、付款凭证等依据。
- 风险和风险对策。
- 审批附言里是否补充了关键信息。

材料不完整或任一依据文件读不到时建议退回补充；明显不合规时建议拒绝。

### 晋升

审阅所有晋升材料，并结合会议中关于此人或部门的问题，看晋升计划是否覆盖当前问题和需要提高的地方。

### 出差

先查内部差旅制度，再看出差是否符合场景、人数、交通、预算、住宿、餐费、提前申请和后续报销材料要求。依据不足时在评论里要求补充。

### 外出

一般合理即可同意。

### 合同

必须审核合同正文，并输出关键风险分析。没有风险对策时建议退回。明显违法、权责失衡或关键条款矛盾时可以建议拒绝。

## 输出格式

普通审阅输出每条包含：

```text
标题：
流程类型：
业务编号：
创建/更新时间：
是否超过 3 天：
审批链接：
建议动作：同意 / 退回补充 / 拒绝 / 暂不判断
核心理由：
制度依据：
关键风险：
建议附言：
材料缺口：
```

如果是定时 heartbeat，只提醒两类事项：

1. 上次检查后新出现的审批。
2. 创建时间距当前已超过 3 天且仍在 RUNNING 的审批。

heartbeat 输出要简洁，按风险优先排序。不要执行同意或拒绝动作；但对需要补材料、暂缓、暂不判断或材料不可读的审批，应自动评论清楚审阅意见和补充要求。如果没有新审批也没有超过 3 天审批，明确说明无需处理。

## 执行动作

同意和拒绝只在用户明确确认后执行。审批评论不属于同意或拒绝；只要不是执行同意或拒绝，就按审阅结论自动评论。

同意：

```bash
dws oa approval approve --instance-id <processInstanceId> --task-id <taskId> --remark "<审批意见>" --format json --yes
```

评论补材料/暂缓/暂不判断：

```bash
dws oa approval oa-comments --instance-id <processInstanceId> --text "<审阅意见、材料缺口和补充要求>" --format json
```

拒绝：

```bash
dws oa approval reject --instance-id <processInstanceId> --task-id <taskId> --remark "<明确理由和需补充材料>" --format json --yes
```

不要用 `reject` 执行“退回补材料”。如果钉钉界面有明确“退回”按钮，可以在用户明确要求退回时使用界面退回；否则用评论要求补材料并保留待办。

执行同意或拒绝后必须用 `list-pending` 复查该审批是否离开待办列表，并把结果告诉用户。执行评论后必须用 `records` 或 OpenAPI `operation_records` 复查评论是否写入成功。
