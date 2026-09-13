# Source Pins

This file records the source snapshots prepared for the future web port.

| Component | Local path | Upstream | Revision |
|---|---|---|---|
| xu4 | `vendor/xu4` | `https://github.com/xu4-engine/u4.git` | `6a7ee3d0079cfdc1c8fb9ba7a3c710a957155a71` |
| Faun | `vendor/faun` | `https://codeberg.org/wickedsmoke/faun.git` | `e175dbfabab468008906e724e9d3872097bdb560` |
| GLV | `vendor/glv` | `https://git.code.sf.net/p/outguard/glv` | `20ab75d39ae1ab27c55f1eea09c83b3985738110` |
| Boron | `vendor/boron` | `https://git.code.sf.net/p/urlan/boron/code` | `84e7a81f68aa7588419f7b164e94e096a1c3fa07` |
| emsdk | not vendored | `https://github.com/emscripten-core/emsdk.git` | tag `4.0.23`, tag commit `c0bb220cb6e6f4e0fabb6f6db9efd53390ef5e56` |

## Original Game Data Policy

Original Ultima IV data is not included in this repository.

Research located and verified one DOS ZIP at:

```text
https://ultima.thatfleminggent.com/ultima4.zip
```

Verified research hash:

```text
SHA-256: 94aa748cfa1d0e7aa2e518abebb994f3c18acf7edb78c3bd37cd0a4404e6ba74
Size: 529099 bytes
```

That ZIP was used only for planning and validation notes. It must not be committed, uploaded to GitHub Pages, added to public CI artifacts, or bundled in `dist/`.

## What Is Fully In This Repository

- Planning documents and handoff records.
- Pinned xu4 source snapshot.
- Pinned Faun, GLV, and Boron source snapshots.
- License files included by the upstream source snapshots.
- GitHub Pages target and deployment policy.

## What Is Intentionally Not In This Repository

- Original Ultima IV data files.
- Extracted private text corpus from original binaries.
- Generated build directories.
- Local browser/test evidence artifacts.
