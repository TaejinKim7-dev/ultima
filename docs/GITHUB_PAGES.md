# GitHub Pages

- 저장소: https://github.com/TaejinKim7-dev/ultima (SSH 쓰기 remote `git@github.com:TaejinKim7-dev/ultima.git`)
- 사이트: https://taejinkim7-dev.github.io/ultima/ (project site, base `/ultima/`)
- workflow: `.github/workflows/pages.yml`

Verified deployment: https://taejinkim7-dev.github.io/ultima/ (Actions run 36316708881)

## 한 번만 하는 설정

Pages Source는 "GitHub Actions"여야 합니다(브랜치 배포가 아님). 이 저장소는 2026-09-27에 아래 명령으로 설정했습니다.

```bash
gh api -X POST repos/TaejinKim7-dev/ultima/pages -f build_type=workflow
gh api repos/TaejinKim7-dev/ultima/pages --jq .build_type   # workflow
```

웹에서 하려면 저장소 Settings → 왼쪽 메뉴 Pages → Build and deployment → Source를 **GitHub Actions**로 고릅니다. Settings → Actions → General 화면은 이 설정과 관계없습니다.

설정하지 않으면 `build`는 성공해도 `deploy`가 `actions/configure-pages`의 "Get Pages site failed … Not Found"로 실패합니다.

## workflow가 하는 일

`build` job (push, PR, 수동 실행 모두):

1. Node 22.23.3 설치, `npm ci`
2. `npm run verify:repo-sources`, `npm run typecheck`, wasm 엔진 suite를 뺀 유닛 테스트
3. emsdk 4.0.23 설치 (`emscripten-core/setup-emsdk`)
4. Faun용 apt 헤더(`libpulse-dev libvorbis-dev libflac-dev`) → `npm run deps:host` → `npm run build:modules` → `npm run deps:wasm` → `npm run build:wasm`
5. wasm 엔진 유닛 suite (`tests/unit/wasm-symbols.test.ts`)
6. `npm run build:site -- --base=/ultima/`
7. `npm run audit:dist -- --require-engine` — 원본 데이터·개발 도구 파일이 있거나 `dist/engine/{xu4.mjs,xu4.wasm,modules/render.pak,modules/Ultima-IV.mod}` 중 하나라도 없으면 실패
8. `npm run verify:workflow` — 이 workflow 파일 자체를 정적 검사
9. `dist/.nojekyll` 생성, `dist/`를 Pages artifact로 업로드(`include-hidden-files: "true"`)

`deploy` job은 **`main`에 push했을 때만** 돕니다(`pages: write`, `id-token: write`, `actions/deploy-pages`). `gh workflow run Pages --ref <branch>` 같은 수동 실행은 build만 하고 배포는 건너뜁니다. 모든 단계가 배포를 막는 gate이고 `continue-on-error`는 없습니다(`verify:workflow`가 강제).

모든 action은 full commit SHA로 고정돼 있고, workflow는 git push를 하지 않습니다.

## 배포 확인 방법

```bash
gh run list --workflow Pages --branch main --limit 3
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://taejinkim7-dev.github.io/ultima/engine/xu4.wasm
```

`xu4.wasm`이 `200 application/wasm`이면 엔진이 배포된 것입니다. 그 뒤 브라우저에서 사이트를 열고 원본 `ultima4.zip`을 선택해 타이틀 화면이 나오는지 봅니다.

## 첫 배포 기록 (2026-09-27)

- main push run `36316708881`: build=success, deploy=success.
- `https://taejinkim7-dev.github.io/ultima/` 200 text/html, `/ultima/engine/xu4.wasm` 200 application/wasm, `/ultima/engine/modules/Ultima-IV.mod` 200.
- 라이브 사이트에서 Playwright(Chromium 136)로 로컬 `ultima4.zip`을 선택 → 엔진 시작, 4xx/5xx 응답 0, 타이틀 화면 렌더(`.omo/evidence/ultima-web/task-19/live-pages-smoke.json`, 로컬 전용).
- 그 전에 branch 수동 실행 run `36315000683`의 artifact를 내려받아 정적 서버 `/ultima/`에서 실제 엔진 부팅을 확인했습니다(`.omo/evidence/ultima-web/task-19/pages-static-smoke-ci-artifact.json`).

## 원본 데이터

Pages 산출물과 CI artifact에는 원본 Ultima IV 데이터가 들어가지 않습니다. 엔진 모듈(`render.pak`, `Ultima-IV.mod`)은 pinned xu4 소스에서 빌드한 것입니다. 사용자의 `ultima4.zip`은 사용자 브라우저 안에서만 읽힙니다.
