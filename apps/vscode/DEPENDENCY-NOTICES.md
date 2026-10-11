# Bundled native dependency notices

English | [中文](DEPENDENCY-NOTICES.zh.md)

The community extension's MIT license does not replace bundled dependency terms. The VSIX retains dependency copyrights, licenses and notices under `runtime/node_modules/`; its `runtime/pnpm-lock.yaml` records exact versions. The repository's [third-party notices](../../THIRD_PARTY_NOTICES.md) describe direct dependencies; this reference identifies native components with additional source and license requirements.

## Sharp and libvips

The Windows image dependency includes `@img/sharp-win32-x64` 0.35.5 and libvips 8.18.7. Its README lists the embedded libraries and their terms, including LGPL components. Copies of the [GPL 3](licenses/GPL-3.0.txt) and [LGPL 3](licenses/LGPL-3.0.txt) accompany the VSIX; the upstream package's Apache license and attribution remain unchanged.

Source and build recipes are available in [Sharp 0.35.5](https://github.com/lovell/sharp/tree/v0.35.5), [sharp-libvips 1.3.4](https://github.com/lovell/sharp-libvips/tree/v1.3.4), and [Windows libvips 8.18.7](https://github.com/libvips/build-win64-mxe/tree/v8.18.7). The Windows build recipes identify source downloads and patches for the embedded libraries. The installed package's `versions.json` identifies their versions; its `lib/` directory retains separate replaceable libvips DLLs. This extension adds no prohibition on modification or reverse engineering for debugging modified LGPL components.

## LibreOffice conversion kit

The LibreOffice kit and Windows engine retain MPL-2.0 declarations, notices, license texts and source metadata. The installed engine's `sources/` directory includes the source revision, local changes and build scripts; the [kit source repository](https://github.com/deepseek-harness/libreoffice-kit) supplies the adapter and corresponding engine-source instructions. Keep these materials with any redistributed engine files.
