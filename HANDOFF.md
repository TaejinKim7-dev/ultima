# HANDOFF
작성 시각: 2026-09-27 20:33 KST

## 1. 목표 (What we're building)
- xu4(Ultima IV)를 원본 `ultima4.zip`을 사용자가 직접 선택하는 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식 + 한국어화. 진행 기준 `plan.md`(25단계).
- 최종 목표는 **한국어로 실제 플레이하는 웹 기반 울티마 4**. 실제 NPC 응답이 한국어여야 하는데 아직 영어 — 출시 차단(아래 6절, `.omo/drafts/korean-output-gap-design.md`).
- 이번 세션: Todo 18 완료·merge·push(19/25) → Todo 19 진행 중, 병렬로 Todo 20 검증기 준비 + 한국어 출력 gap 조사.

## 2. 현재 상태 (Current state)
- 진행률 **20/25 = 80.0%** — Todo 19 ✅ (merge 게이트 `npm ci` 포함 전부 exit 0, handoff.md 기록). main merge `47c8c41` + push 완료. main run `36315663294`: build=success, deploy=failure(Pages 미설정 "Get Pages site failed ... Not Found" — 로그 확인). 후속 커밋 `5b7773c`: `/` 서빙 smoke 1/1, Step 15 "실제 게임 확인" ✅→⬜ 정정, 설계 메모 커밋.
- **Todo 19 (branch `todo-19-pages-release`, 커밋 `0b0ea35`, origin push 완료, main 미merge, 체크박스 `[ ]`)**:
  - 발견: 기존 CI는 wasm 엔진을 빌드하지 않아 Pages artifact에 `dist/engine/`이 없었음(셸만 배포). `vite preview`의 `/engine/` 미들웨어가 `build/wasm-release`에서 직접 서빙해 로컬 e2e는 이 gap을 가렸음.
  - 수정: `pages.yml`에 apt 오디오 헤더 → `deps:host` → `build:modules` → `deps:wasm` → `build:wasm` → wasm-symbols 유닛(hard gate, continue-on-error 제거) → `build:site` → `audit:dist -- --require-engine`. `audit-dist.mjs --require-engine`, `workflow-verifier.mjs`(build:wasm 존재·순서, audit --require-engine, continue-on-error 금지) 추가.
  - 확인한 것(직접 실행): unit RED 6 failed → GREEN 40/40(`task-19/unit-{red,green}.log`); clean clone에서 CI 순서 전체 exit 0(build:wasm 27s, dist/engine에 xu4.mjs/wasm/modules 생성); `pages-static-smoke.spec.ts` RED(엔진 없는 artifact → 404, module-load-failed) → GREEN 1/1(plain static server `/ultima/`, `/`는 404, prefix 밖 요청 0, 실제 타이틀 애니메이션 스크린샷); `workflow-failure.log`(.nojekyll 제거/잘못된 root/--require-engine 제거 각각 exit 1); `ssh-auth.log`(인증 greeting, exit 1 정상); 로컬 게이트 unit 283/283·verify·typecheck·build·build:site·audit --require-engine·verify:workflow·diff-check·cmp·YAML parse 전부 0(`task-19/local-gates.log`).
  - CI run `36315000683`(branch dispatch): build=success, deploy=skipped. 다운로드한 artifact에 `.nojekyll`+`engine/*` 있고 `audit:dist --require-engine` 통과, `pages-static-smoke`가 CI artifact로 실제 엔진 부팅 1/1.
  - GitHub Pages 설정: 20:12 KST 기준 `gh api repos/TaejinKim7-dev/ultima/pages` → 404(아직 미설정). 사용자가 Source="GitHub Actions" 설정하겠다고 답함. main 배포 run 2개(`36314583813`, `36314599335`)는 build 성공/deploy 실패(이 설정 부재 때문으로 추정 — 확인 필요).
- **Todo 20 준비 (Fork A, worktree `/home/taejin/ultima/.claude/worktrees/agent-a382177c7dfd2d8a1`, branch `todo-20-release-docs`, 커밋 `6a336df`, 미push)**: `verify:release-docs` 검증기 + 16 unit test(RED→GREEN, fork 보고). 실제 repo 대상 실행은 exit 1(81건: WEB_PORT.md/GITHUB_PAGES.md 없음, handoff.md 경로/placeholder) — Todo 20 본 작업 대상.
- **한국어 출력 gap 조사 (Fork B, 코드 무변경)**: `.omo/drafts/korean-output-gap-design.md`. 요지: i18n lookup이 wasm에 링크조차 안 됨, 엔진→JS 텍스트 경로 없음, `korean-progression.spec.ts`는 `ultimaI18n.resolve`만 검사. 새 Todo 22 제안(분모 25→26, 사용자 결정 필요).

## 3. 변경한 파일 (Files changed)
- (Todo 19, `0b0ea35`) `.github/workflows/pages.yml`, `scripts/audit-dist.mjs`, `scripts/workflow-verifier.mjs`, `tests/unit/audit-dist.test.ts`, `tests/unit/workflow.test.ts`(기존 YAML-name 테스트 fixture를 바뀐 step 이름으로 갱신, 변형 로직 동일), `tests/e2e/pages-static-smoke.spec.ts`(신규).
- (Todo 18, main merge `f936e74`) 이전 판 참고: `event.cpp` prompt 훅, `text-prompt-gate.ts`, `startup.ts`, `shell.ts`, `main.ts` 등.
- untracked: `.omo/drafts/korean-output-gap-design.md`(Fork B), `.omo/boulder.json`, `.omo/start-work/`, `.omo/lazycodex-executor-verify/`, `.claude/`(worktree 포함).

## 4. 주요 결정과 근거 (Key decisions)
- Pages smoke는 `vite preview`가 아닌 plain static server(`/ultima/`만 서빙, SPA fallback 없음) — preview 미들웨어가 dist/engine 누락을 가리기 때문.
- `--require-engine`은 opt-in 플래그: 엔진 없이 빌드한 로컬 dist도 leak audit은 가능해야 해서. CI에서는 verify:workflow가 플래그 사용을 강제.
- CI 엔진 빌드를 위해 apt(`libpulse-dev libvorbis-dev libflac-dev`) 설치: `deps:host`가 faun도 빌드하고 faun 링크에 필요.
- 한국어 출력 구현은 새 Todo(분모 변경)라 착수하지 않고 설계 메모만.

## 5. 다음 할 일 (Next steps)
- [x] CI run 확인, CI artifact smoke, 게이트, Todo 19 ✅, 계획서 `[x]`.
- [ ] (사용자) Pages Source="GitHub Actions" 설정 → main deploy 재실행 → 실제 URL 확인.
- [ ] Todo 20: `todo-20-release-docs`를 main 위로 rebase 후 README/WEB_PORT/GITHUB_PAGES 작성, handoff.md를 검사 대상에 둘지 결정.
- [ ] 사용자에게 Todo 22(한국어 출력) 신설 여부 결정 요청.

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- Pages Source 설정은 사용자만 가능. 미설정이면 main의 deploy job은 계속 실패.
- 한국어 NPC 출력 미구현 — 출시 차단. 계획 체크박스 ✅가 이를 대신하지 않음.
- 이번 세션 작업 디렉터리가 실수로 Fork A worktree로 바뀜(`cd` 부작용). 메인 저장소 작업은 절대경로/`git -C /home/taejin/ultima` 사용.
- e2e 동시 실행 시 다른 `PLAYWRIGHT_PORT` 필수. NPC 접근 스펙끼리는 동시 실행 자제.
- `memory-smoke`는 JS heap만 측정.
- `pkill -f "<패턴>"`은 자기 셸까지 죽임 — `"[p]laywright ..."` 대괄호 트릭.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima
git checkout todo-19-pages-release && git status -sb
export PATH="$HOME/.local/opt/node22/bin:$PATH"
export ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip
gh run view 36315000683
npm run build:site -- --base=/ultima/ && npm run audit:dist -- --require-engine && npm run verify:workflow
PLAYWRIGHT_PORT=4248 npx playwright test tests/e2e/pages-static-smoke.spec.ts --project=chromium --workers=1
```
- 상세: `handoff.md`, 진행 순서 `plan.md` "바로 다음 순서".
