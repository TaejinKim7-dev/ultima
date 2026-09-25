# HANDOFF
작성 시각: 2026-09-25 23:40 KST (todo-19-pages-workflow 세션, 이전 Todo 21 세션 기록에 이어 갱신)

## 1. 목표 (What we're building)
- xu4 기반 Ultima IV를 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식한다. 진행 기준은 `/home/taejin/ultima/plan.md`(25단계 = Todo 1~21 + F1~F4).
- **정정**: 이 세션을 시작한 시점의 main(`ce88bc1`)에는 `todo-21-real-engine`이 이미 merge되어 있었다 — 이전 HANDOFF.md가 "아직 main에 merge 안 함"이라고 적었던 건 그새 stale해진 것(다른 세션이 이미 merge함). Todo 21은 완료 상태로 main에 있다.
- 이번 세션 범위: `.omo/plans/ultima-web.md` Todo 19(GitHub Pages workflow) 하나. 명시적으로 "골격만" — 2026-09-24 재계획 메모가 Todo 15/16/18보다 먼저 병렬 착수를 허용한 범위다.

## 2. 현재 상태 (Current state)
- 브랜치 `todo-19-pages-workflow`(main `ce88bc1`에서 분기), 커밋 `5f93788`(1차) 이후 advisor 리뷰로 발견된 결함 3건을 고쳐 **다음 커밋에서 반영 예정**(아래 4번 "advisor 리뷰로 고친 것" 참고). main에는 merge/push 안 함.
- Todo 19 골격 완료: `.github/workflows/pages.yml`, `npm run audit:dist`, `npm run verify:workflow` 신규. 상세는 아래 3~4번과 `handoff.md`의 "Todo 19 골격 완료 기록" 절.
- Todo 19는 여전히 🟡(부분 진행) — 계획서 체크박스 `[ ]` 그대로, 완전한 acceptance는 Todo 15·16·18 이후.
- Todo 21(엔진 자체)은 이미 완료·merge 상태(main `ce88bc1`) — 실제 `ultima4.zip`으로 실제 타이틀 화면 렌더 + 실제 키 입력 상태 전이까지 확인됨(자세한 내용은 `handoff.md`의 "Todo 21 완료 기록" 절, 이번 세션에서 건드리지 않음).
- Todo 10은 여전히 🟡 — persistence coordinator는 연결됐지만(Todo 21의 21.2) 실제 저장을 발생시키는 e2e(`tests/e2e/save-reload.spec.ts`)가 아직 없다. 이번 세션에서도 손대지 않음.

## 3. 변경한 파일 (Files changed, 이번 세션, 브랜치 `todo-19-pages-workflow`)
- `.github/workflows/pages.yml` (신규) — 2-job(`build`/`deploy`) GitHub Pages 워크플로우.
- `scripts/audit-dist.mjs` (신규) — `npm run audit:dist`.
- `scripts/workflow-verifier.mjs` (신규) — 워크플로우 텍스트 검사 로직.
- `scripts/verify-workflow.mjs` (신규) — 위 로직의 CLI 래퍼, `npm run verify:workflow`.
- `tests/unit/audit-dist.test.ts` (신규, 4개 테스트).
- `tests/unit/workflow.test.ts` (신규, 14개 테스트).
- `scripts/check-base-path.mjs` (수정) — `FORBIDDEN_BASENAMES`/`FORBIDDEN_EXTENSIONS`를 `export`로 바꿔 재사용 가능하게 함.
- `package.json` (수정) — `"audit:dist"`, `"verify:workflow"` 스크립트 추가.
- `plan.md` — Wave 4 표의 19번 행 ⬜→🟡, "바로 다음 순서" 갱신, "Todo 19 골격 작업" 완료 기록 절 신규.
- `.omo/plans/ultima-web.md` / `docs/ULTIMA_WEB_PLAN.md` — Todo 19 항목에 진행 노트 추가 + 의존성 매트릭스 19번 행 갱신. 체크박스는 `[ ]` 유지. `cmp`로 byte-identical 재확인.
- `handoff.md` — "Todo 19 골격 완료 기록" 절 추가(공식 인계 기록).

## 4. 주요 결정과 근거 (Key decisions)
- **`test:unit`을 통째로 `continue-on-error`로 두지 않은 이유**: 처음엔 `npm run test:unit` 전체를 `continue-on-error`로 뒀는데, advisor 리뷰에서 "그러면 `deploy`가 `needs: build`만 확인하니 persistence/bridge/zip-validate 같은 진짜 회귀도 배포를 막지 못한다"는 지적을 받고 실제로 맞는 말이라 고쳤다. 지금은 `npx vitest run --exclude tests/unit/wasm-symbols.test.ts`로 나머지 108(+workflow 신규 14)개를 하드 게이트하고, `wasm-symbols.test.ts`만 별도 스텝으로 `continue-on-error`(실패는 그 스텝 자체에서 계속 보이되 job을 막지 않음). `--exclude` 플래그가 Vitest 3에서 실제로 동작하는지 직접 실행해 확인(14 files/109 tests, exit 0).
- **`test:unit`의 wasm-symbols 스위트가 CI에서 실패하는 이유**: 완전히 새로 clone한 저장소(`build/` 없음)에서 실제로 `npm run test:unit`을 돌려보면 `tests/unit/wasm-symbols.test.ts`만 실패한다 — wasm 엔진 빌드에 필요한 pinned emsdk(4.0.23)를 설치하는 npm 스크립트가 없어서(지금까지 전부 로컬 1회성 수동 설치), CI 러너엔 당연히 없다. 이 세션 자체 worktree도 처음엔 `build/wasm-release`가 없어서 같은 증상을 겪었다 → 메인 체크아웃의 기존 `build/wasm-release`(원본 데이터 없음을 `find`로 먼저 확인)를 복사해서 로컬 게이트만 통과시켰다. **테스트는 고치거나 약화하지 않았다.** emsdk를 CI에 자동 설치하는 일은 Todo 19의 acceptance criteria(`build:site`/`audit:dist`/`verify:workflow` 3개뿐)엔 없는 별도 작업으로 명시적으로 남긴다 — 그 결과 CI가 만드는 `dist/`에는 `/engine/`이 없다(셸만 배포).
- **advisor 리뷰로 고친 것 (1차 커밋 `5f93788` 이후, 다음 커밋에 반영 예정)**:
  1. `verify:workflow`가 "id-token: write"/"pages: write"/"path: dist"/".nojekyll" 같은 필수 항목을 파일 전체 텍스트에서 찾고 있었는데, 이러면 실제 permission/step 줄이 지워져도 헤더 주석의 설명 문구만으로 통과해버리는 실제 버그가 있었다(실제로 재현: 옛 구현으로 "id-token: write" 실제 줄만 지운 테스트 3개가 정말로 RED였다 — `.nojekyll`, `include-hidden-files`, `id-token: write`). 고친 구현은 주석이 아닌 줄만 걸러서(`nonCommentLines`) 앵커된 정규식(`^\s*id-token:\s*write\s*$` 등)으로 검사하도록 바꿨고, `include-hidden-files: "true"` 검사도 추가했다(이게 없으면 `.nojekyll`이 아티팩트에서 조용히 빠진다는 걸 `upload-pages-artifact`의 실제 `action.yml`을 fetch해서 확인한 사실과 연결).
  2. 워크플로우 레벨 `concurrency: pages`를 `deploy` job으로만 옮겼다 — PR용 `build`가 대기 중인 `main` 배포를 같은 concurrency group에서 취소/치환해버릴 수 있어서.
  3. 계획서 의존성 매트릭스(`### Dependency matrix`)의 19번 행도 갱신 필요했는데 처음에 놓쳤다(Todo 19 항목 본문만 고치고 매트릭스 행은 안 고침) — 두 계획서 사본 모두에 반영, `cmp` 재확인.
- **GitHub Actions를 태그가 아니라 40자 commit SHA로 고정**: GitHub API로 실제 태그→커밋 SHA를 조회해서 박았다(checkout v7.0.1, setup-node v7.0.0, configure-pages v6.0.0, upload-pages-artifact v5.0.0, deploy-pages v5.0.1).
- **`verify:workflow`를 YAML 파서 없이 구현**: devDependencies에 YAML 파서가 없고 새 패키지 설치는 사용자 확인 없이 하면 안 됨 — `scripts/repo-source-verifier.mjs`/`check-base-path.mjs`와 같은 "텍스트 기반" 관례를 따름.

## 5. 다음 할 일 (Next steps)
- [ ] 지금 이 worktree의 나머지 변경사항(advisor 리뷰 반영분)을 커밋한다 — 브랜치 `todo-19-pages-workflow`. **main에 merge/push하지 않는다** — 조정 세션의 검토 대기.
- [ ] (조정 세션 몫) 이 브랜치 리뷰 후 main merge 여부 결정.
- [ ] Todo 11~13(한국어 UI) → 14 → 15(번역) → 16(Web Audio, 21.1의 무음 구현 교체) → 17 → 18(`audit:dist`를 test-hook/cheat-API/XSS 등으로 확장) → **Todo 19 재검토해서 완전히 done으로 바꿀지 결정** → 20 → F1~F4.
- [ ] **Todo 10의 `tests/e2e/save-reload.spec.ts`** — persistence coordinator는 연결됐지만(21.2) 실제 저장 트리거(캐릭터 생성 등)가 아직 자동화 안 됨.
- [ ] (별도 결정 필요, Todo 19 범위 밖) CI에서 emsdk 4.0.23을 자동 설치하고 `build:wasm`까지 돌려서 wasm 엔진을 실제로 배포할지, 당분간 "셸만 배포"를 감수할지.

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- **각 git worktree는 `build/`를 따로 가진다(gitignored)** — 이 worktree엔 `build/wasm-release`가 원래 없었다(메인 체크아웃에서 복사해옴). 다른 worktree/클린 clone에서 재개하면 같은 문제를 다시 만난다 — `npm run build:wasm`(emsdk 필요) 또는 이미 빌드된 산출물 복사가 필요하다.
- **`scripts/workflow-verifier.mjs`의 구조적 검사(permission/artifact-root/`.nojekyll`/순서)는 이제 "주석이 아닌 줄"만 본다** — `.github/workflows/pages.yml`의 헤더 주석에 `id-token: write`, `audit:dist` 같은 정확한 YAML 키 문자열을 그대로 쓰는 건 괜찮다(검사가 주석을 걸러내므로). 다만 실제 실행 줄(`run:`/`uses:`/permission 줄) 자체를 지우면 잡힌다.
- **CI가 만드는 `dist/`에는 `/engine/`이 없다** — `.github/workflows/pages.yml`은 wasm 엔진을 빌드하지 않는다. 지금 이 워크플로우를 그대로 push해서 배포하면 화면(셸)은 뜨지만 게임 자체는 못 돈다. 알려진, 의도적으로 남겨둔 gap.
- **`.omo/evidence/ultima-web/task-19/`에는 파일을 안 썼다** — gitignored, 이 worktree엔 다른 task의 evidence도 원래 없었다. RED/GREEN/게이트 기록은 `handoff.md`·`HANDOFF.md`·대화 로그에만 있다.
- (Todo 21에서 이어짐, 여전히 유효) `vendor/xu4/src/gpu_opengl.cpp`/`support/getTicks.c`를 또 고칠 일이 생기면 반드시 `vendor/source-manifest.json`의 `treeSha256`도 같이 갱신할 것 — `node -e "import('./scripts/repo-source-verifier.mjs').then(({summarizeSourceTree}) => console.log(JSON.stringify(summarizeSourceTree('vendor/xu4'))))"`로 재계산.
- (Todo 21에서 이어짐, 여전히 유효) Emscripten의 `Module.ENV`/`preRun` 타이밍은 미묘하다 — `await factory(...)` 이후에 `Module.ENV.HOME`을 설정하면 이미 늦다(getenv 캐시가 먼저 굳음). `factoryOptions` 객체는 스프레드로 복사하지 말고 참조 그대로 넘겨야 한다(MODULARIZE가 그 객체 자체를 `Module`로 재사용).
- (Todo 21에서 이어짐, 여전히 유효) WebGL 캔버스의 "검은색 아님" 검증은 `gl.readPixels()`/`drawImage()+getImageData()`가 아니라 스크린샷 바이트 크기 비교로 한다 — 캔버스가 `preserveDrawingBuffer` 없이 생성되어 인페이지 픽셀 읽기가 항상 지워진 버퍼를 읽는다.
- Node 22 필요 — 시스템 기본 `/usr/bin/node`는 v20. `export PATH="$HOME/.local/opt/node22/bin:$PATH"` 먼저 실행할 것. wasm 빌드 시 `source .emsdk/emsdk_env.sh`.
- 원본 데이터: `/home/taejin/ultima4-original-data/ultima4.zip`, SHA-256 `94aa748cfa1d0e7aa2e518abebb994f3c18acf7edb78c3bd37cd0a4404e6ba74`. repo에 복사 안 함.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima/.claude/worktrees/agent-ab6e90afea7a1db3d   # 이 세션의 worktree (또는 main checkout에서 브랜치 checkout)
export PATH="$HOME/.local/opt/node22/bin:$PATH"; node -v            # v22.23.3이어야 함
git status -sb && git log --oneline -3

# build/wasm-release가 없다면(다른 worktree/클린 clone에서 재개하는 경우) 먼저 확보:
#   npm run deps:wasm && npm run build:wasm   (emsdk 필요, .emsdk/emsdk_env.sh를 source)
#   또는 이미 빌드된 build/wasm-release를 다른 checkout에서 복사

npm ci
npm run test:unit                             # 15 files / 117 tests 기대
npm run verify:repo-sources                   # 4 components 기대
npm run typecheck
npm run build
git diff --check
npm run build:site -- --base=/ultima/         # Todo 19 acceptance criteria
npm run audit:dist                            # Todo 19 acceptance criteria
npm run verify:workflow                       # Todo 19 acceptance criteria
cmp .omo/plans/ultima-web.md docs/ULTIMA_WEB_PLAN.md   # byte-identical 기대
```
- 공식 인계: `handoff.md`의 "Todo 19 골격 완료 기록" 절(가장 최근) + "Todo 21 완료 기록" 절(엔진 배경지식). 진행률/순서: `plan.md`. Todo 19 전문: `.omo/plans/ultima-web.md` 300번 줄 부근. 운영 규칙: `AGENTS.md`.
- 브랜치 `todo-19-pages-workflow`는 main에 병합/push되지 않은 상태 — 병합 여부는 사용자/조정 세션 결정 사항.
