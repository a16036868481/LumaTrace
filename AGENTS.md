# AGENTS.md

本仓库实现 LumaTrace，一个 clean-room 跨平台性能测试工具。

## 硬性规则

- 不复制任何商业工具的代码、UI、图标、协议、文案、产品布局或私有实现。
- 不绕过系统权限。
- 不使用越狱或 ROOT 作为默认方案。
- 不使用私有 API。
- 不打包许可证不清晰的二进制。
- 默认本地优先，不上传云端。
- 默认不采集隐私日志。
- logcat、syslog 等日志能力必须显式开启，并且必须经过脱敏。
- 不收集 token、cookie、账号信息或其他敏感凭据。
- 导出报告默认脱敏设备序列号、用户路径、邮箱、token 和本地敏感路径。

## 指标真实性

- 所有指标必须标记 `source`、`precision`、`confidence` 和 availability。
- 不可采集的指标必须显示 `unavailable`、`requires_tool`、`requires_permission`、`requires_xcode`、`requires_developer_signing`、`requires_manual_trace` 或 `experimental`，不得伪造。
- Mock 数据必须明确标记为 mock source，不得伪装成真实平台采集。
- 设备级指标不得伪装为 App 或进程级指标。
- Android、iOS、PC 采集器必须实现统一 `MetricCollector` 接口。

## 外部命令

- 所有外部命令必须经过统一 `CommandRunner`。
- 命令必须有 timeout、stdout/stderr 捕获、exitCode、durationMs、abort 支持、maxOutputBytes 和日志脱敏。
- 工具缺失、权限不足、解析失败必须降级为 ToolStatus、MetricAvailability 或 diagnostics，不得导致整个应用崩溃。

## 测试要求

- 没有真实设备时，mock collector 也必须能让 UI、API、实时曲线、存储和报告完整运行。
- 每个 parser 都必须有 fixture 和单元测试。
- 每次改动后运行 lint、test、typecheck，并在回复中报告结果。
- 不要一次性做大范围改动。每次提交一个小批次。

## 优先级

1. 可运行；
2. 可测试；
3. 数据真实；
4. 指标诚实；
5. 架构可扩展；
6. UI 专业但不模仿任何商业产品。
