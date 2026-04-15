# ElymBot Plugin Meme Manager

安卓端本地表情包管理与自动发送插件 v2。

## 已实现能力

- 内置全部本地表情包资源到插件自身 `memes/` 目录
- 基于打包时生成的资源清单建立分类索引
- 在 `on_llm_response` 阶段识别显式标签和关键词
- 在 `on_decorating_result` 阶段尝试追加本地图片附件
- 支持 `append` 和 `followup` 两种发送模式
- 支持 `/表情管理` 系列命令
- 支持 `/表情管理 链路测试 <标签>`
- 支持配置 schema、默认配置和运行日志

## 目录结构

```text
manifest.json
android-plugin.json
config/
  defaults.json
memes/
  angry/
  baka/
  color/
  confused/
  cpu/
  fool/
  givemoney/
  happy/
  like/
  meow/
  morning/
  reply/
  sad/
  see/
  shy/
  sigh/
  sleep/
  surprised/
  work/
runtime/
  bootstrap.js
  commands.js
  config.js
  decorate.js
  generated_meme_manifest.js
  host_api.js
  logger.js
  match.js
  meme_index.js
schemas/
  settings-schema.json
  static-config.json
README.md
```



## 命令说明

插件内部注册形式：

- 注册一条根命令：`command="表情管理"`, `groupPath=[]`
- 用户仍然通过 slash command 使用，例如 `/表情管理 链路测试 happy`
- 根命令命中后，插件在命令 handler 内继续解析 `查看分类`、`查看配置`、`链路测试`、`随机测试`、`重建索引`、`状态`

- `/表情管理`
  返回命令帮助
- `/表情管理 查看分类`
  列出全部分类和图片数量
- `/表情管理 查看分类 <标签>`
  查看单个分类详情
- `/表情管理 查看配置`
  输出当前关键配置摘要
- `/表情管理 链路测试 <标签>`
  直接挑选该标签的一张本地图片并尝试发送，用于验证资源打包、索引、匹配、附件链路
- `/表情管理 随机测试`
  随机选择一张内置表情发送
- `/表情管理 重建索引`
  重新从打包时生成的资源清单重建内存索引
- `/表情管理 状态`
  查看插件启用状态、索引数量和待发送队列

## 配置项

- `enabled`
  是否启用插件
- `defaultCategory`
  没有明确命中时可用的默认分类
- `sendMode`
  `append` 或 `followup`
- `matchMode`
  `tag_only` 或 `tag_and_keyword`
- `randomPick`
  是否随机选图
- `maxImagesPerReply`
  每次最多发送的图片数，当前最小实现按 1 张处理
- `categories`
  分类元信息列表
- `keywords`
  分类到关键词的额外映射
- `replySuffixEnabled`
  是否在文本后追加 `[表情:<标签>]` 说明
- `streamingCompatibility`
  流式兼容模式，优先采用更保守的附件发送策略

默认配置位于 [config/defaults.json](C:/Users/93445/Desktop/Astrbot/Plugin/Astrbot_Android_plugin_memes/config/defaults.json)。

## 运行方式

推荐事件链路:

1. `on_llm_response`
   读取模型输出文本，识别标签或关键词，命中后保存待装饰状态
2. `on_decorating_result`
   读取待装饰状态并追加图片附件
3. `after_message_sent`
   当 `sendMode=followup` 时尝试补发图片

## 感谢

**[astrbot_plugin_meme_manager](https://github.com/anka-afk/astrbot_plugin_meme_manager)** :一个功能强大的 AstrBot 表情包管理插件，支持 🤖 AI 智能发送表情、🌐 WebUI 管理界面、☁️ 云端同步等特性。
