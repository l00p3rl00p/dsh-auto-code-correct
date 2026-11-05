# Attribution

This repository includes work derived from, built on, or inspired by open-source projects. This file records those relationships explicitly so the origin of reused ideas and code remains clear.

## dsh-lens-lite

**Project:** [ben7am1n/dsh-lens-lite](https://github.com/ben7am1n/dsh-lens-lite)
**License:** MIT
**Copyright:** Copyright (c) 2026 dsh-lens-lite contributors

`dsh-auto-code-correct` (ACC) was derived from `dsh-lens-lite` and preserves its MIT attribution. The original project established the DeepSeek Harness post-edit diagnostics pattern: observe successful file-mutating tools, run configured checkers, and attach diagnostics to the same tool result through native Harness extension points.

ACC extends that foundation into a broader automatic code-correction and verification plugin, including language-specific correction pipelines, language-server integration, tool discovery/linking, code-hygiene behavior, native settings and the session-scoped AutoCorrect results tab, and ACC-specific runtime policy.

The MIT license notice applicable to the derived work is preserved in this repository's [LICENSE](LICENSE).

## pi-lens — acknowledged prior art

**Project:** [apmantza/pi-lens](https://github.com/apmantza/pi-lens)
**License:** MIT

The upstream `dsh-lens-lite` project identifies `pi-lens` as prior art for the post-edit-feedback idea. `dsh-lens-lite` states that its implementation against DeepSeek Harness extension points is independent and shares no code with `pi-lens`.

ACC preserves that acknowledgement. This is an attribution of prior art, not a claim that ACC contains copied `pi-lens` source code.

## DeepSeek Harness

**Project:** [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
**License:** MIT
**Copyright:** Copyright (c) 2026 DeepSeek

ACC is a native DeepSeek Harness plugin and uses Harness-published APIs and packages, including Cordis composition, tool execution events, sessions, subprocess/LSP services, client UI extension points, sandbox/policy services, and related plugin interfaces.

DeepSeek Harness is a platform dependency and extension target. This attribution does not imply that ACC is part of, endorsed by, or maintained by DeepSeek.

## Cordis

**Project:** [cordiverse/cordis](https://github.com/cordiverse/cordis)

ACC uses Cordis through the DeepSeek Harness plugin architecture. Cordis supplies the composition/runtime model that allows ACC to register and remove behavior through native plugin seams rather than modifying the Harness core.

## Third-party dependencies

ACC also depends on third-party packages declared in [package.json](package.json). Those packages remain subject to their own licenses, copyright notices, and attribution requirements.

This file is intended to make ACC's direct derivation and architectural lineage explicit. It does not replace the license texts of any dependency or upstream project.
