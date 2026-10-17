---
name: lol-friends-analyzer
description: 读取 Windows 国服英雄联盟客户端与本地日志，分析自己和手选朋友的共同对局，生成可自选日期、查看逐人表现评分和复盘建议的离线 HTML 战绩报告。
---

# LOL 开黑战绩分析

为已登录本机英雄联盟客户端的使用者生成单文件交互报告。朋友在页面手选，不预置昵称、安装路径或账号。支持峡谷、普通大乱斗、海克斯大乱斗；其他模式保留记录但不评分。

## 执行

用 PowerShell 调用本技能内 `scripts/run.ps1`，默认输出到用户 Documents 下的 `LOL-Friends-Reports`，不会写入 skill。Windows 完整包包含 Node；源码版可以从 PATH 或用 `-NodePath` 指定宿主运行时。游戏发现失败才询问安装目录并传 `-GameRoot`；多个客户端须让用户选择并传 `-ClientProcessId`。

```powershell
& '<技能目录>/scripts/run.ps1'
& '<技能目录>/scripts/run.ps1' -GameRoot 'D:/游戏/英雄联盟' -From '2026-10-01' -To '2026-10-17'
```

日期为北京时间，包含起止日。省略时收集全部可获取记录，在报告筛选。更新时再次调用相同输出目录，复用缓存。完成后打开返回的 HTML，说明实际覆盖范围，让使用者勾选朋友。

已有合法导出的原始 LCU 数据可以离线导入，目录应包含 `current-summoner.json`、`details/*.json` 和静态名称映射：

```powershell
& '<技能目录>/scripts/run.ps1' -ImportDirectories @('D:/导出/lcu-data','D:/新增/lcu-data') -OutputDirectory 'D:/我的报告'
```

## 判断与边界

- 只读本机 LCU GET。凭据通过标准输入传入，仅驻留内存；不要打印完整进程命令行、原始客户端日志和认证信息。
- 历史分页可能重复最近 20 场，以索引、日志 ID 和验证过的缓存合并候选并逐局读取；日志名单不能替代赛后详情。说明失败数量和实际可读范围。
- 区服＋PUUID 合并改名；缺失时只用区服内稳定 summonerId 回退。不能用相似昵称合并账号。
- 每位朋友仅统计与当前账号同队的场次。同队出现不自动证明朋友关系或组队关系。
- 评分是本工具的观察指标，不是 Riot、WeGame、世界赛官方个人分，不代表段位、完整贡献或输局责任。
- 评分及建议见 [评分说明](references/scoring.md)。短局和提前结束保留明细，仅排除评分。核对成功数、唯一对局数和筛选口径。
- 失败时保留上次报告，说明原因；不要修改游戏配置或使用其他账号绕过。

下载与普通使用见 [README](README.md)。
