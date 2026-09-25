# HANDOFF
작성 시각: 2026-09-25 23:35 KST (todo-19-pages-workflow 세션)

## 1. 목표 (What we're building)
- Ultima IV를 GitHub Pages(`https://taejinkim7-dev.github.io/ultima/`)에서 호스팅 가능한 정적 웹 앱으로 포팅한다. 이번 세션의 범위는 `.omo/plans/ultima-web.md` Todo 19(GitHub Pages workflow) 하나이며, 명시적으로 "골격만" — 2026-09-24 재계획 메모가 Todo 15/16/18보다 먼저 병렬 착수를 허용한 범위다.

## 2. 현재 상태 (Current state)
- 브랜치 `todo-19-pages-workflow`(main `ce88bc1`에서 분기), 아직 커밋 전(다음 단계에서 커밋 예정, main에 merge/push는 안 함).
- 새로 만든 것:
  - `.github/workflows/pages.yml` — `build`(push+PR: `npm ci`→`verify:repo-sources`→`typecheck`→`test:unit`(`continue-on-error`, 이유는 아래 6번)→`build:site -- --base=/ultima/`→`audit:dist`→`verify:workflow`→`.nojekyll`→`upload-pages-artifact`)와 `deploy`(`needs: build`, `push`+`main`일 때만: `configure-pages`→`deploy-pages`) 2-job. 모든 `uses:`는 40자 commit SHA로 고정(GitHub API로 실제 태그 SHA를 조회해서 박음: checkout v7.0.1, setup-node v7.0.0, configure-pages v6.0.0, upload-pages-artifact v5.0.0, deploy-pages v5.0.1). `node-version: "22.23.3"`(로컬 개발 버전과 동일).
  - `scripts/audit-dist.mjs` + `npm run audit:dist` — dist 산출물에서 원본 게임 데이터 확장자(zip/sav/ega/map/tlk/exe)와 dev-tooling 파일 유출을 검사(`scripts/check-base-path.mjs`의 `FORBIDDEN_BASENAMES`/`FORBIDDEN_EXTENSIONS`를 export해서 재사용).
  - `scripts/workflow-verifier.mjs` + `scripts/verify-workflow.mjs` + `npm run verify:workflow` — YAML 파서 없이 텍스트 검사로 HTTPS URL/SSH remote/Pages URL/`--base=/ultima/`/`pages: write`/`id-token: write`/artifact root(`path: dist`)/`.nojekyll`/모든 `uses:`의 SHA 고정/`node-version` 정확한 버전/`audit:dist`가 upload보다 먼저인지/`git push` 부재/원본 데이터 확장자 부재를 검사.
  - `tests/unit/audit-dist.test.ts`(4개), `tests/unit/workflow.test.ts`(13개).
- 동작 확인됨(전부 이 세션에서 직접 실행):
  - RED: 위 새 테스트 2개 파일을 스크립트/워크플로우 파일이 없는 상태에서 먼저 실행 → 17/17 전부 실패 확인.
  - GREEN: 구현 후 17/17 통과. 과정에서 진짜 버그 하나 실측 — 워크플로우 헤더 주석에 `audit:dist` 문자열이 우연히 한 번 더 나와서(주석 + 실제 스텝) 순서 검사 테스트가 위양성으로 실패 → 주석 문구를 고쳐 재통과.
  - 전체 merge 게이트(AGENTS.md) 전부 실제 실행, 전부 exit 0 — 아래 7번 "재개 방법"에 정확한 명령/결과 기록.
- 아직 안 된 것: 커밋, `plan.md`/계획서 2벌의 나머지 반영 확인(이번 세션에서 함, 아래 3번 참고), Todo 19의 완전한 acceptance(15·16·18 선행 필요), CI에서 실제 push로 워크플로우를 트리거해본 적은 당연히 없음(로컬 검증만).

## 3. 변경한 파일 (Files changed)
`git status --short --branch` 기준(브랜치 `todo-19-pages-workflow`):
- `.github/workflows/pages.yml` (신규) — Todo 19의 핵심 산출물.
- `scripts/audit-dist.mjs` (신규) — `npm run audit:dist`.
- `scripts/workflow-verifier.mjs` (신규) — 워크플로우 텍스트 검사 로직.
- `scripts/verify-workflow.mjs` (신규) — 위 로직의 CLI 래퍼, `npm run verify:workflow`.
- `tests/unit/audit-dist.test.ts` (신규) — 4개 테스트, happy path + 원본데이터 유출 + tooling 유출 + index.html 없음.
- `tests/unit/workflow.test.ts` (신규) — 13개 테스트, happy path + 12개 실패 시나리오(각 필수 항목 하나씩 제거/변조).
- `scripts/check-base-path.mjs` (수정) — `FORBIDDEN_BASENAMES`/`FORBIDDEN_EXTENSIONS`를 `export`로 바꿔 `audit-dist.mjs`가 재사용하게 함. 동작 변화 없음(단순 export 추가).
- `package.json` (수정) — `"audit:dist"`, `"verify:workflow"` 스크립트 2개 추가.
- `plan.md` (수정) — Wave 4 표의 19번 행을 ⬜→🟡로, "바로 다음 순서" 2번 항목 갱신, Todo 21 기록 뒤에 "Todo 19 골격 작업" 절 신규 추가.
- `.omo/plans/ultima-web.md` / `docs/ULTIMA_WEB_PLAN.md` (둘 다 수정, 동일한 한 줄 추가) — Todo 19 항목 아래에 2026-09-25 날짜의 진행 노트 추가. 체크박스는 `[ ]` 그대로 유지(의도적). `cmp`로 두 파일이 byte-identical임을 재확인함.

## 4. 주요 결정과 근거 (Key decisions)
- **`test:unit`을 `continue-on-error`로 둔 이유**: 완전히 새로 clone한 저장소(`build/` 디렉터리 없음)에서 `npm run test:unit`을 실제로 돌려보니 `tests/unit/wasm-symbols.test.ts`만 실패하고 나머지 14개 파일/108개 테스트는 통과한다(이 세션에서 직접 clone해서 실측, 그리고 이 worktree 자체도 처음엔 `build/wasm-release`가 없어서 똑같이 실패하는 걸 봤다). 원인은 wasm 엔진 빌드에 필요한 pinned emsdk(4.0.23)가 어떤 npm 스크립트로도 자동 설치되지 않는다는 것 — 지금까지 전부 로컬 1회성 수동 설치였다(`docs/SOURCE_PINS.md`, 예전 handoff.md의 "Node 22 전환" 절 참고). CI 러너에는 당연히 이게 없다. **테스트를 고치거나 약화하지 않았다** — 실제 테스트는 그대로 실패하는 채로 로그에 남고, job 자체만 그 한 스텝 때문에 빨간불이 되지 않게 `continue-on-error: true` + 이유를 설명하는 인라인 주석을 달았다. 대안(emsdk를 CI에 자동 설치)은 Todo 19 자체의 acceptance criteria(build:site/audit:dist/verify:workflow 3개뿐)에는 없는, 훨씬 큰 별도 작업이라 이번 범위에 넣지 않았다 — 다음 세션/조정 세션이 결정할 몫으로 명시적으로 남긴다.
- **워크플로우 검증기(`verify:workflow`)를 YAML 파서 없이 텍스트 정규식으로 구현한 이유**: `package.json` devDependencies에 YAML 파서가 없고, 새 패키지 설치는 AGENTS.md상 사용자 확인 없이 진행하면 안 되는 항목이다. `scripts/repo-source-verifier.mjs`/`scripts/check-base-path.mjs`도 이미 같은 "텍스트/파일시스템 기반, 외부 파서 없음" 스타일이라 그 관례를 따랐다.
- **GitHub Actions를 태그가 아니라 40자 commit SHA로 고정한 이유**: AGENTS.md/계획서 전반이 "pinned tool/source versions"를 일관되게 요구한다(emsdk 4.0.23, vendor tree sha256 등). GitHub 공식 보안 권고이기도 하다. 실제로 GitHub API를 호출해 태그→커밋 SHA를 조회한 뒤 박아 넣었다(추측 아님).
- **`.nojekyll`을 살리기 위해 `upload-pages-artifact`에 `include-hidden-files: "true"`를 넣은 이유**: 그 액션의 `action.yml`을 실제로 fetch해서 읽어보니 기본값(`include-hidden-files: "false"`)에서는 tar 단계가 `--exclude=.[^/]*`로 점(dot) 파일을 통째로 제외한다 — 넣지 않으면 `.nojekyll`이 아티팩트에 아예 안 들어간다.
- **SSH 인증 확인("verify SSH auth with a non-mutating command before any push-related step")을 CI 스텝이 아니라 헤더 주석으로만 넣은 이유**: 공식 Pages Actions(`configure-pages`/`upload-pages-artifact`/`deploy-pages`)는 OIDC(`id-token: write`) + Pages REST API로 배포하고, git push를 전혀 하지 않는다. Actions 러너에는 이 SSH remote용 키가 설정되어 있지도 않다. 그래서 "이 워크플로우 자체엔 push-related step이 없다"는 사실 자체를 `verify:workflow`가 검사하게 하고(`git push` 문자열이 파일에 없어야 통과), SSH 인증 확인은 이 저장소에 커밋을 push하는 사람/에이전트를 위한 문서 안내로 헤더 주석에 남겼다.

## 5. 다음 할 일 (Next steps)
- [ ] 지금 이 상태를 커밋한다 — 브랜치 `todo-19-pages-workflow`, 커밋 메시지는 계획서의 "Commit: Y | ci(pages): publish static web build via GitHub Pages" 형식을 따르되 "골격만, 15/16/18 이후 완전 완료"라는 점을 메시지에 명시할 것. **main에 merge/push하지 않는다** — 조정 세션의 검토를 기다린다.
- [ ] (조정 세션 몫) 이 브랜치를 리뷰하고 main에 merge할지 결정. merge 전 AGENTS.md 게이트 재확인 권장(아래 7번 명령 그대로).
- [ ] Todo 11~13(한국어 UI) → 14 → 15(번역) → 16(Web Audio, 21.1의 무음 구현 교체) → 17 → 18(`audit:dist`를 test-hook/cheat-API/XSS 등으로 확장) → **Todo 19를 이 시점에 재검토해서 완전히 done으로 바꿀지 결정** → 20 → F1~F4.
- [ ] (별도 결정 필요, Todo 19 범위 밖) CI에서 emsdk 4.0.23을 자동 설치하고 `build:wasm`까지 돌려서 `test:unit`을 진짜로 통과시키고 `dist/engine/`을 실제로 배포할지, 아니면 당분간 "셸만 배포"를 감수할지 — 이 세션은 후자를 택했지만 영구적인 결정은 아니다.
- [ ] `todo-21-real-engine` 브랜치(커밋 `542ce34`, `70d14db`)의 main merge — 여전히 사용자 확인 대기 중(이번 세션에서 건드리지 않음).

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- **각 git worktree는 `build/`를 따로 가진다(gitignored)** — 이 세션을 시작한 worktree에는 `build/wasm-release`가 전혀 없어서 `npm run test:unit`이 처음엔 실패했다(15개 파일 중 1개, `wasm-symbols.test.ts`). 메인 체크아웃(`/home/taejin/ultima`)의 기존 `build/wasm-release`(27MB, 원본 데이터 없음을 `find`로 직접 확인 후)를 이 worktree로 복사해서 로컬 게이트를 통과시켰다. **다음 세션이 다른 worktree/클린 clone에서 시작하면 똑같은 문제를 다시 만난다** — `npm run build:wasm`을 다시 돌리거나(emsdk 필요), 이미 빌드된 `build/wasm-release`를 다른 곳에서 복사해 와야 한다.
- **CI가 만드는 `dist/`에는 `/engine/`이 없다** — `.github/workflows/pages.yml`은 wasm 엔진을 빌드하지 않는다(위 4번 참고). 지금 이 워크플로우를 그대로 push해서 실제로 배포하면, 화면(셸)은 뜨지만 게임 자체는 못 돈다. 이건 알려진, 의도적으로 남겨둔 gap이다.
- **`scripts/workflow-verifier.mjs`의 `checkAuditRunsBeforeUpload`는 `"audit:dist"`/`"upload-pages-artifact"` 문자열이 파일에 정확히 한 번씩만 나온다고 가정하지 않는다(첫 occurrence를 찾음)** — 실제로 헤더 주석에 `audit:dist`라는 단어를 썼다가 이 함수가 주석의 occurrence를 집어서 순서 검사가 무력화되는 버그를 겪었다(위 2/4번 참고). `.github/workflows/pages.yml`을 고칠 때 주석에 `audit:dist`/`upload-pages-artifact` 같은 정확 문자열을 다시 쓰면 같은 문제가 재발할 수 있다 — 쓰려면 "audit step"처럼 콜론 없는 표현으로 피해갈 것.
- **이번 세션은 `.omo/evidence/ultima-web/task-19/`에 파일을 쓰지 않았다** — 그 디렉터리는 gitignored이고 이 worktree엔 애초에 존재하지 않았다(다른 task의 evidence도 없음). RED/GREEN/게이트 로그는 이 HANDOFF와 handoff.md, 그리고 이 대화 자체에만 남아 있다 — 계획서 QA 시나리오가 요구하는 `.omo/evidence/ultima-web/task-19/*.json`/`*.log` 파일 자체는 아직 없다(확인 필요: 조정 세션이 이걸 요구할지).
- Node 22가 필요하다 — 시스템 기본 `/usr/bin/node`는 v20. `export PATH="$HOME/.local/opt/node22/bin:$PATH"` 먼저 실행할 것.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima/.claude/worktrees/agent-ab6e90afea7a1db3d   # 이 세션의 worktree
export PATH="$HOME/.local/opt/node22/bin:$PATH"; node -v            # v22.23.3이어야 함
git status -sb && git log --oneline -3

# build/wasm-release가 이 worktree에 없다면(다른 worktree에서 재개하는 경우) 먼저 확보:
#   npm run deps:wasm && npm run build:wasm   (emsdk 필요, .emsdk/emsdk_env.sh를 source)
#   또는 이미 빌드된 build/wasm-release를 다른 checkout에서 복사

npm ci                                        # 이 세션 실행: exit 0
npm run test:unit                             # 이 세션 실행: exit 0, 15 files / 116 tests
npm run verify:repo-sources                   # 이 세션 실행: exit 0, 4 components
npm run typecheck                             # 이 세션 실행: exit 0
npm run build                                 # 이 세션 실행: exit 0
git diff --check                              # 이 세션 실행: exit 0
npm run build:site -- --base=/ultima/         # 이 세션 실행: exit 0 (Todo 19 acceptance criteria)
npm run audit:dist                            # 이 세션 실행: exit 0, 9 files scanned (Todo 19 acceptance criteria)
npm run verify:workflow                       # 이 세션 실행: exit 0 (Todo 19 acceptance criteria)
cmp .omo/plans/ultima-web.md docs/ULTIMA_WEB_PLAN.md   # 이 세션 실행: exit 0 (byte-identical)
```
- 공식 인계: `handoff.md`의 최신 절(이 세션 직후 추가 예정, "Todo 19 골격" 검색). 진행률/순서: `plan.md`. Todo 19 전문: `.omo/plans/ultima-web.md` 300번 줄 부근. 운영 규칙: `AGENTS.md`.
- 이 세션이 만든 브랜치 `todo-19-pages-workflow`는 커밋 직후에도 main에 병합/push되지 않은 상태로 남아 있을 것 — 병합 여부는 사용자/조정 세션 결정 사항.
