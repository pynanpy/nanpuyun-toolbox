# 南浦云工具箱

本地运行的效率工具箱：图片、视频、音频、文档与文件处理，**所有文件只在本地浏览器 / WebView 里处理，不上传到任何服务器**，保护隐私。

最终目标：打包成 APK，通过 GitHub Release 直接下载安装。

## 功能（v0.1.0）

### 1. 图片
- 压缩（质量滑杆、JPG / WebP / PNG 转换）
- 尺寸调整（按宽或按高，等比缩放）
- 裁剪（按 X / Y / 宽 / 高）
- 加水印（文字、五个位置）
- 格式转换、图片转 PDF

### 2. 视频
- 查看信息（分辨率、时长、大小）
- 提取封面（当前帧 → PNG）
- 裁剪时长、压缩重编码（MediaRecorder 方案，输出 WebM）
- 提取音频（WebM 音频）

> 说明：浏览器没有 ffmpeg，视频压缩与裁剪是对播放流重编码，画质取决于浏览器支持的编码器；大文件需要等待播放完成。

### 3. 音频
- 裁剪、格式转换（→ WAV）、变速（0.25–4 倍）、合并多个音频
- 导出为 WAV（浏览器原生无 MP3 编码器，MP3 导出后续可接入 lamejs）

### 4. 文档与文件
- PDF 合并 / 拆分（pdf-lib）
- 图片转 PDF、文本转 PDF（中文可正常显示）
- 文件批量重命名（`{n}` / `{name}` / `{ext}` 占位符，下载即为重命名后的副本）
- 文本对比（按行）、字数统计

## 本地开发

```bash
npm install
npm run dev      # 开发服务器 http://localhost:5173
npm run build    # 构建到 dist/
```

## 打包 APK（GitHub Actions）

本地没有 Java / Android SDK，**不要在本地跑 Android 构建**，全部走 GitHub Actions：

1. 推送到 `main`：自动构建一次验证，APK 作为 artifact 上传（不发 Release）。
2. 打 tag 并推送，例如：
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
   自动构建 `assembleDebug` APK 并创建 GitHub Release，附上 APK 文件，可在 Release 页面直接下载。

工作流见 `.github/workflows/android.yml`，步骤是：检出代码 → 安装 Node 20 → `npm ci` → `npm run build` → 安装 Java 17 与 Android SDK → 生成 Android 工程（如不存在）并 `npx cap sync android` → `cd android && ./gradlew assembleDebug` → 上传 `android/app/build/outputs/apk/debug/app-debug.apk`。

> 注意：这是 Debug 包，可直接安装体验；正式上架应用商店需要签名 Release 包，后续再做。

## 技术路线

- Vite + 原生 JavaScript（不使用重型框架）
- Capacitor（Android 壳）：包名 `com.nanpuyun.toolbox`，应用名「南浦云工具箱」
- pdf-lib 处理 PDF，Canvas / Web Audio API / MediaRecorder 处理媒体
- TypeScript 钉在 5.6：Capacitor CLI 7 解析 `capacitor.config.ts` 时与新版 TypeScript 不兼容（`Cannot read properties of undefined (reading 'CommonJS')`），不要随意升级
