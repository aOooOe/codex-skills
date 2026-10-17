# 我的 Codex Skills

存放自己制作、总结并持续完善的 skills。每个 skill 使用独立目录，包含 `SKILL.md` 及按需加载的参考资料。

## 已收录

| Skill | 用途 |
|---|---|
| [easyeda-datasheet-design](skills/easyeda-datasheet-design/SKILL.md) | 按确切芯片手册学习参考板、设计原理图，并按电流回路审查 PCB；包含连接核对、保存重载回读和验证边界。 |
| [lol-friends-analyzer](skills/lol-friends-analyzer/SKILL.md) | 读取 Windows 国服 LOL 共同对局，手选朋友和日期，生成离线交互报告、可解释评分与个人复盘建议。 |

## LOL 战绩分析：下载即用

[下载 Windows x64 完整包](https://github.com/aOooOe/codex-skills/releases/download/lol-friends-analyzer-v1.0.0/lol-friends-analyzer-windows-x64.zip) · [使用说明](skills/lol-friends-analyzer/README.md)

完整解压后登录英雄联盟客户端，双击 `Start.cmd` 即可生成报告。包内包含 Node.js 运行时，不需要额外安装 Python、npm 或申请 API Key。双击 `Install-Skill.cmd` 可同时安装为 AI Skill。GitHub 自动生成的源码 ZIP 不含运行时。

## 使用

将需要的整个 skill 目录复制到本机的 `~/.codex/skills/` 下，保留其参考文件和相对路径。安装后可在新会话中用 `$easyeda-datasheet-design` 明确调用。

嘉立创EDA skill 需要环境中有可用的连接器、MCP 或 CLI 才能操作实际工程；仅整理离线方案不表示已经修改工程。

## 后续维护

新增 skill 放在 `skills/<skill-name>/`，并更新此索引。保留方法和可复用资料，避免提交账号凭据、私有工程标识、投板工程文件及未经授权再分发的第三方资料。
