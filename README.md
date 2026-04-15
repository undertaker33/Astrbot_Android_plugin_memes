# Android Meme Manager

安卓端本地表情包管理与自动发送插件 v2。

这个插件只依赖安卓端插件 v2 总纲中公开的双文件包协议、`js_quickjs` runtime、公开 hook 名称，以及结果装饰 API 名称。它不依赖 Web 后台、云图床、Python、宿主私有类或宿主数据库。

命令实现遵循总纲 14.4 的 command 注册合同：
- 插件通过 `registerCommandHandler(...)` 显式注册命令路径
- 注册值使用不带前导 `/` 的命令名
- 用户实际输入时仍使用 slash command，例如 `/表情管理 链路测试 happy`

## 已实现能力

- 内置全部本地表情包资源到插件自身 `memes/` 目录
- 基于打包时生成的资源清单建立分类索引
- 在 `on_llm_response` 阶段识别显式标签和关键词
- 在 `on_decorating_result` 阶段尝试追加本地图片附件
- 支持 `append` 和 `followup` 两种发送模式
- 支持 `/表情管理` 系列命令
- 支持 `/表情管理 链路测试 <标签>`
- 支持配置 schema、默认配置和运行日志

## 未实现能力

- Web 管理后台
- 云端同步、云图床、CDN
- Python 图像处理、静态图转 GIF
- 桌面端全部运营和图库管理能力
- 宿主私有 API 才能保证的高级消息能力

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

## 资源来源说明

- 资源源目录: `C:\Users\93445\Desktop\Astrbot\插件\astrbot_plugin_meme_manager-main\memes`
- 已复制到插件自身目录: `memes/<标签>/...`
- 运行时不再依赖原桌面端目录
- 当前目录名已经是稳定 ASCII 标签，因此没有做目录名重命名
- 标签与目录为一一对应关系，README 和默认配置中的标签名即目录名

当前内置分类:

- angry
- baka
- color
- confused
- cpu
- fool
- givemoney
- happy
- like
- meow
- morning
- reply
- sad
- see
- shy
- sigh
- sleep
- surprised
- work

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

## 最保守假设说明

- 总纲公开了 `appendAttachment` / `replaceAttachments` / `appendText` 等结果装饰 API 名称，但没有公开附件对象的完整字段结构。
- 本插件因此采用最保守的 JSON-like 附件对象:

```json
{
  "type": "image",
  "kind": "image",
  "sourceKind": "PLUGIN_ASSET",
  "path": "memes/happy/example.jpg",
  "assetPath": "memes/happy/example.jpg",
  "mimeType": "image/jpeg",
  "label": "happy"
}
```

- 如果宿主公开桥接支持这类本地插件资源附件，插件会直接发图。
- 如果宿主对附件字段有更严格要求，需要按宿主后续公开 bridge 样例微调该 JSON-like 对象。
- 总纲没有公开“运行时读取宿主设置”的固定 JS API 名称，因此插件通过 feature detection 尝试 `getSettings` / `getPluginSettings` / `readSettings` / `getConfig`，若都不存在则退回 `config/defaults.json` 内置默认值。
- 总纲没有公开“运行时文件系统访问” API，因此 `重建索引` 采用“从打包时生成的 `runtime/generated_meme_manifest.js` 重新构建索引”的保守做法，而不是运行时直接遍历磁盘。

## 导入与扩展

1. 将当前目录打包为 zip
2. 确认 zip 根目录包含:
   - `manifest.json`
   - `android-plugin.json`
   - `runtime/bootstrap.js`
3. 导入安卓端插件系统 v2
4. 首次导入后观察 bootstrap 日志
5. 使用 `/表情管理 查看分类` 和 `/表情管理 链路测试 happy` 验证链路

扩展本地表情包时:

1. 向 `memes/<标签>/` 新增图片
2. 重新生成 `runtime/generated_meme_manifest.js`
3. 如需关键词匹配，同时更新 `config/defaults.json`
4. 重新打包导入
