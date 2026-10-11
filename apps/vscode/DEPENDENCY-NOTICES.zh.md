# 打包原生依赖声明

[English](DEPENDENCY-NOTICES.md) | 中文

社区扩展的 MIT 许可证不替代打包依赖的条款。VSIX 在 `runtime/node_modules/` 中保留依赖的版权、许可证及声明；`runtime/pnpm-lock.yaml` 记录准确版本。仓库的[第三方声明](../../THIRD_PARTY_NOTICES.md)介绍直接依赖；本参考文档列出需要额外源代码及许可说明的原生组件。

## Sharp 和 libvips

Windows 图像依赖包含 `@img/sharp-win32-x64` 0.35.5 及 libvips 8.18.7。其 README 列明内嵌库及各自条款，包括 LGPL 组件。VSIX 随附 [GPL 3](licenses/GPL-3.0.txt) 和 [LGPL 3](licenses/LGPL-3.0.txt) 副本；上游包的 Apache 许可证及署名保持不变。

源代码和构建脚本位于 [Sharp 0.35.5](https://github.com/lovell/sharp/tree/v0.35.5)、[sharp-libvips 1.3.4](https://github.com/lovell/sharp-libvips/tree/v1.3.4) 及 [Windows libvips 8.18.7](https://github.com/libvips/build-win64-mxe/tree/v8.18.7)。Windows 构建脚本列明内嵌库的源代码下载地址及补丁。安装包的 `versions.json` 标明这些库的版本；其 `lib/` 目录保留可单独替换的 libvips DLL。此扩展不禁止为调试修改后的 LGPL 组件而进行修改或逆向工程。

## LibreOffice 转换套件

LibreOffice kit 和 Windows 引擎保留 MPL-2.0 声明、版权说明、许可文本及源代码元数据。已安装引擎的 `sources/` 目录包含源代码修订、局部修改及构建脚本；[kit 源代码仓库](https://github.com/deepseek-harness/libreoffice-kit)提供适配器及对应引擎源代码说明。重新分发引擎文件时请保留这些材料。
