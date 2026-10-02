# 参与开发

## 开始修改

只适配 Obsidian 默认主题。新增功能应明确设置对象、默认行为和支持的平台，避免新增另一套影响默认结果的整组样式。

需要 Node.js 18 或更新版本。构建和逻辑测试无需安装第三方依赖。

```sh
npm run check
```

用户可见名称统一为“外观工坊 / Appearance Studio”。插件 ID、命令 ID、视图类型和配置字段用于定位已有数据，仍保留 `snippet-editor` 等内部标识；安装目录与发布校验保持一致。

编辑 `src/`，运行 `npm run build` 生成 `main.js`。部署只需把 `main.js`、`manifest.json`、`styles.css` 复制到库的 `<配置目录>/plugins/snippet-editor/`，保留已有 `data.json`，然后在 Obsidian 中关闭再启用插件。

| 文件 | 职责 |
| --- | --- |
| `src/constants.js` | 保存时序、历史上限、布局断点和触摸尺寸等实现常量 |
| `src/core.js` | 文件操作、会话、保存队列、冲突与历史 |
| `src/builtin.js` / `src/builtin-view.js` | 内置样式、配置兼容、窗口生命周期与可视化设置 |
| `src/control-model.js` / `src/control-view.js` | 按对象的统一参数、迁移、样式生成与控件 |
| `assets/builtin/` | 窗口材质和状态栏的内部样式 |
| `src/appearance.js` | 已保存数值参数及旧版分享格式的兼容定义 |
| `src/view.js` | 列表、外观表单、源码编辑 |
| `src/ui.js` | 输入确认、快速搜索、历史恢复、选色 |
| `src/main.js` | 生命周期、配置迁移、持久化、自动保存、Obsidian 适配 |
| `src/highlight.js` / `src/colors.js` | 高亮与传统色数据 |
| `scripts/build.js` | 无第三方依赖的 CommonJS 打包 |
| `tests/*.test.js` | Node 内置测试框架的逻辑回归 |

可选浏览器夹具：本机已有 Playwright 和 Chromium 时，运行 `node tests/browser-check.js`。可通过 `CHROMIUM_EXECUTABLE` 指定浏览器、`OBSIDIAN_BASE_CSS` 指定已提取的原生 CSS、`ARTIFACT_DIR` 指定截图目录。夹具只操作内存模拟文件，不读写实际库。

## 测试

```sh
npm run check
```

提交前检查生成文件与源码一致，并运行相关浏览器夹具。浏览器测试需要自行准备 Playwright 和 Chromium，不包含在插件运行依赖中。

已在 Obsidian 1.14.3 对应的原生 CSS 浏览器夹具检查浅/深色、260/320/390/540/768/1440px 分栏，以及内置开关、卸载清理、外观保存、默认值、源码保存、冲突、副本、搜索、重命名、开关和回收站。逻辑测试覆盖异步写入与恢复路径。

浏览器夹具使用模拟 Obsidian API；移动设备的输入法、软键盘、VoiceOver 与 iCloud 跨设备同步仍需真机验证。不含打印和笔记导出；支持外观配置导入导出。

多窗口生命周期使用 Obsidian 官方的 [Workspace API](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts)；片段开关仍通过集中适配的内部接口处理。



浏览器检查还包括 `tests/platform-browser-check.js`（配置导入导出与折叠）、`tests/translucency-check.js`（窗口材质）。六级标题颜色在阅读和实时预览中逐级核验，恢复默认核对原生主题颜色。

### 自定义 CSS 兼容性样例

`tests/fixtures/compatibility/` 包含 5 份默认关闭的测试片段、测试笔记和预期说明，覆盖变量、直接选择器、深浅色、容器查询、图文混排、层叠层与强制覆盖。运行 `node tests/compatibility-browser-check.js`（环境要求同上）验证源码保存、开关、阅读/实时预览、多尺寸、加载顺序和卸载恢复。内置“默认”会让出对应覆盖，自定义 CSS 仍按正常层叠规则生效；一般第三方 CSS 不会自动转为内置表单。

优先级专用回归：`node tests/priority-browser-check.js`，环境要求同其他浏览器检查。

窗口边角回归：使用当前 Obsidian 的 `app.css`，设置 `OBSIDIAN_BASE_CSS` 后运行 `node tests/chrome-browser-check.js`（需要 Playwright 与 Chromium）。

跨平台检查：`node tests/device-browser-check.js`，使用与其他浏览器夹具相同的环境变量，覆盖平台控件、运行时样式、导入跳过与撤销、临时禁用和布局切换。

实现常量集中在 `src/constants.js`，参数范围仍由设置模型定义；平台能力在 `src/capabilities.js` 维护。`note-prose`、`note-list`、图片 `center` 标记属于兼容约定，不随常量重构改名。浏览器测试使用系统临时目录，可通过 `ARTIFACT_DIR` 覆盖。

## 提交问题和改动

问题报告请注明 Obsidian 版本、系统、浅色或深色外观、最小复现步骤，以及是否启用了其他 CSS。优先在空白库复现；不要附上 `data.json`、私人笔记或整个库。截图和配置名称也可能包含个人信息。

修改源文件后重新生成 `main.js` 与 `src/bundled.js`，一起提交。提交前运行 `git diff --check`，说明影响的行为和实际测试范围。涉及平台特性的改动应区分逻辑模拟与真机验证。
