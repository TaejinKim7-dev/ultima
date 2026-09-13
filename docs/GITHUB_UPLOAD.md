# GitHub Upload And Pages Target

Target repository:

```text
https://github.com/TaejinKim7-dev/ultima
```

SSH write remote:

```text
git@github.com:TaejinKim7-dev/ultima.git
```

Expected GitHub Pages URL:

```text
https://taejinkim7-dev.github.io/ultima/
```

## Current Upload Scope

This initial upload is documentation and open-source source snapshots only:

- plan and handoff documents;
- pinned source snapshots in `vendor/`, including xu4, Faun, GLV, and Boron;
- root README and policy notes.

Public-by-default scope for future work:

- implementation code;
- Korean translation source JSON;
- test policy and test harnesses;
- GitHub Actions workflow files;
- release documentation.

It intentionally does not include:

- original Ultima IV ZIP/data files;
- built web artifacts;
- save files;
- local research checkouts;
- private extracted text corpus;
- evidence screenshots/traces.

The intent is that a future developer can clone this repository and continue from the plan without depending on the local research checkouts under `engine/` or `.omo/research/`.

## Future Pages Deployment

The implementation plan requires a GitHub Actions workflow that runs after pull requests merge to `main` and:

1. installs pinned build tools;
2. builds and tests the static web artifact;
3. verifies `dist/index.html` exists at the artifact root;
4. verifies the site base path is `/ultima/`;
5. verifies no original game data is included;
6. uploads `dist/` with the official Pages actions;
7. deploys to GitHub Pages.

Pages Source should be configured to GitHub Actions.
