# HANDOFF
작성 시각: 2026-10-01 · 세션 재개용 요약 (이전 본문은 더 이상 유효하지 않음)

## 1. 목표
Ultima IV(xu4)를 원본 `ultima4.zip`을 사용자가 직접 선택하는 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식하고, 실제 플레이 화면을 한국어로 만든다. 진행 기준은 `plan.md`, 세부 정의의 원본은 `.omo/plans/ultima-web.md`.
순서: 원본 계획서 100% → F1~F4 완주 → 그 다음에 main push.

## 2. 현재 상태
- main tip **`361b638`**. **push하지 않았다.** `origin/main` = `42fa93c`, main이 그보다 **27커밋 앞섬**.
- 진행률 **28/32 = 87.5%** (`[x]` 28 = Todo 1~26 + 27 + 28, `[ ]` 4 = F1~F4).

## 3. ⛔ 최상위 BLOCKER — e2e webServer 죽음
통합 main(`361b638`)의 **`npm run verify:integration`은 NOT GREEN**. `git diff --check`까지 13단계 전부 exit 0으로 통과한 뒤 e2e에서 실패:
- **21 failed / 25 passed (26.7m)**
- 21건 **전부** 동일 서명: `page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4588/`
- 로그: **`/tmp/opencode/main-integration.log`** (`MAIN verify:integration EXIT=1 2026-10-01T19:34:37+09:00`)
- **원인 미확정.** 로그에 vite/server 자신의 stderr가 없고 dmesg에도 OOM 기록이 없다.
→ 통합 main을 gate-green으로 기록하지 말 것. e2e가 완전히 green이 될 때까지 미해결이다.

## 4. 이번 세션에 main에 merge된 레인
| branch | 커밋 |
|---|---|
| `todo-27-korean-status` | `8c3086f` (fast-forward, **자체 게이트 PASS**) |
| `todo-29-shrine` | `1b7ee62`, `9eb5b65`, `1e58f44` |
| `todo-30-readchoice` | `cfb1f71` (merge `238ca39`) |
| `todo-31-status-summary` | `f894265`, `c65f768`, `e9a7267` (merge `27797e6`) |
| `f1-release-docs` | `c69690e`, `a0c541e`, `f1b2296`, `cf9879a`, `0ff8ffa` |
| main 위 직접 | `7592d4c` (vendor xu4 tree 해시 재계산), `7dded25` (i18n-generate.d.mts 중복 `statusNames` 선언 수정 → 이게 `typecheck` exit 2를 유발했고 이 커밋이 고침) |

## 5. 실제로 green으로 관측된 게이트 (통합 main, exit 0)
`npm ci` · `build:modules` · `build:wasm` · `check:build-fresh` · `test:unit` (46 files / **569** tests) · `verify:repo-sources` (4 pinned components, xu4 fileCount 412) · `typecheck` · `build` · `i18n:check -- --strict` (4561 entries) · `build:site --base=/ultima/` · `audit:dist -- --require-engine` · 계획서 두 벌 `cmp` · `git diff --check` · `i18n:generate` 후 `git diff --exit-code src/i18n/generated/strings.ts` = CLEAN.
**단 e2e는 exit 1.** Todo 27 자체 게이트는 별개로 PASS(`/tmp/opencode/todo27-integration.log`, `EXIT=0`, e2e 46/46 35.7분).

## 6. ⚠️ 분모 함정 — 미결 사용자 결정
**Todo 29·30·31·32·33은 main에 구현·merge·검증까지 끝났지만 `.omo/plans/ultima-web.md`에 항목이 아예 없다.** 원본 계획서의 체크박스는 정확히 32개(Todo 1~28 + F1~F4)다. 따라서 **분모는 32지 35나 37이 아니다** — 즉 진행률은 실제보다 낮게 표시된다. 편입 여부와 분모를 **사용자가 결정해야** 한다. 결정 없이는 100%에 도달할 수 없다.
관련: F4 감사가 "계획서 두 벌이 byte-identical이 아니다"고 지적한 것은 **위양양성**이다 — `cmp .omo/plans/ultima-web.md docs/ULTIMA_WEB_PLAN.md`는 exit 0.

## 7. 남은 작업 (순서대로)
1. **e2e webServer 죽음 원인 확정** — `main`에서 `npm run verify:integration`을 **혼자** 재실행, vite webServer stderr를 보게 하고 먼저 기록: ① 서버가 죽은 시각 ② 그 직전까지 통과한 스펙 ③ 아무 스펙도 시작 못 했는지. 스위트를 중간에 끊고 재시작하지 말 것.
2. **F2**: `npm run cmake:configure` → `npm run cmake:build` → `npm run test:native`. **통합 main에서 한 번도 실행되지 않음.**
3. **F3**: `playwright.config.ts:38`은 지금 `projects: [{ name: "chromium" }]` 하나뿐이다. firefox + webkit 프로젝트를 추가하고 실제 `ultima4.zip`으로 두 스위트 모두 실행. 브라우저는 이미 설치됨(chromium-1169, firefox-1482, webkit-2158) — 더 이상 blocker 아님.
4. **F4**: 1~3 뒤 재감사. 분모 산술을 **원본 계획서 파일에서 다시 유도**. 보고된 APPROVE_WITH_DEVIATIONS(blocking 0 / non-blocking 6) 판정을 담은 증거 파일은 찾지 못했다 — 로컬 `final/F4-scope-fidelity.md`는 2026-09-27 REJECT 감사본이다. 확인 필요.
5. **F1**: `verify:release`의 새 18단계 목록을 끝까지 한 번도 완주 실행한 적이 없다. 코드 merge ≠ F1 통과.
6. **사용자 결정**: Todo 29~33 편입 여부 / 분모(6절).
7. **push**: 1~3이 green인 뒤에만 `git push origin main`.

## 8. 금지사항
- **원본 데이터 커밋 금지**: `ultima4.zip`, 원본 `.EXE`/`.TLK`/`.MAP`/`.EGA`/`.SAV`, 추출 원문 corpus, 사용자 save, secret. 원본은 `/home/taejin/ultima4-original-data/ultima4.zip`에 있고 **repo와 모든 artifact(evidence·로그·trace·test-results)에 절대 넣지 않는다.**
- **실패 테스트 삭제·약화 금지.** 인프라 실패(e2e webServer 죽음)도 통과로 기록하지 않는다.
- **통합 검증은 `npm run verify:integration` 하나뿐.** 손으로 나열해 일부만 돌리지 않는다. 어떤 단계든 exit 0이 아니면 merge/push 금지.

## 9. 미검증 사실 (추측 금지)
- **Todo 30이 실제 UX 버그를 고쳤는지 미검증**: 한국어 입력창을 쓴 뒤 화살표 키와 명령 키가 조용히 무시되던 문제. prompt-epoch 작업이 이걸 고쳤다고 가정하지 말고 재현부터 할 것.
- **F3는 시작 전 취소됨.** 통합 main에서 `test:native`/cmake, F3 firefox/webkit, `verify:release` 전체 완주가 모두 미실행.
- F2의 기존 F-01/F-11 finding은 위양양성이었음. 게이트 산출물은 `.omo/evidence/ultima-web/task-27/`(`fallback.log`, `gates.log`, `task27-unit-red.log`, `task27-unit-green.log`, 회귀 e2e 로그 8종, `native.log`, 스크린샷 4종). evidence는 로컬 전용이라 이 worktree엔 `fallback.log` 하나만 복제돼 있다.

## 10. worktree 지도
| 경로 | 상태 |
|---|---|
| `.claude/worktrees/agent-ad52af6bd293aab90` | **main `361b638` — 모든 main 작업은 여기서** |
| `/home/taejin/ultima` (루트) | **stale. `f3-real-browser-qa` `6462af3`, dirty. 쓰지 말 것** — 여기서 git log/diff를 보면 오독 |
| `.claude/worktrees/f3-browser-qa` | `f3-browser-qa` `781a789`(salvage 커밋, 부모 `361b638`). `playwright.config.ts` dirty + `f3*.tmp.mjs` 잔류 → **재사용 전 정리 필요** |
| `.claude/worktrees/todo-27-status` | `todo-27-korean-status` `8c3086f` (이미 main에 반영됨) |
| `.claude/worktrees/f1-release-docs` | `f1-release-docs` `0ff8ffa` (이미 main에 반영됨) |
- merge 전 미커밋 상태 보존: `salvage/pre-merge-main-2026-10-01` (`c5b01af`)

## 11. 재개 방법
```bash
cd /home/taejin/ultima/.claude/worktrees/agent-ad52af6bd293aab90
git status -sb && git log --oneline -3
source .emsdk/emsdk_env.sh
export PATH="$HOME/.local/opt/node22/bin:$PATH" ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip
npm run verify:integration        # 단독 실행, 다른 e2e/포크와 병행 금지
```
상세: `handoff.md` 마지막 절 "2026-10-01 통합 merge + 게이트 상태 (main 361b638)", `plan.md` "바로 다음 순서"(2026-10-01) 및 "통합 merge 상태".
