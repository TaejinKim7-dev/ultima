# HANDOFF
작성 시각: 2026-10-01 (2차 갱신) · 세션 재개용 요약

## 1. 목표
Ultima IV(xu4)를 원본 `ultima4.zip`을 사용자가 직접 선택하는 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식하고 실제 플레이 화면을 한국어로 만든다. 진행 기준 `plan.md`, 세부 정의 원본은 `.omo/plans/ultima-web.md`.
순서: 원본 계획서 100% → F1~F4 완주 → 그 다음 main push.

## 2. 현재 상태
- main tip **`f08f4b1`**. **push하지 않았다.** `origin/main` = `42fa93c`, main이 **27커밋 앞섬**.
- 진행률 **28/32 = 87.5%** (`[x]` 28 = Todo 1~26 + 27 + 28, `[ ]` 4 = F1~F4). 이번 라운드에 계획서 변경 없음.

## 3. ⛔ 최상위 BLOCKER — 통합 main 게이트가 여전히 빨갛다
`npm run verify:integration` on integrated main은 **NOT GREEN**이고 **push하면 안 된다.**
- 실패 실행: **21 failed / 25 passed (26.7m)**, 21건 전부 `page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4588/`, assertion 실패 0건. 로그 **`/tmp/opencode/main-integration.log`**.
- **단독 재실행 실험을 시작했으나 완주하지 못했다.** main `f08f4b1`에서 `PLAYWRIGHT_PORT=4601`, `DEBUG=pw:webserver`로 단독 실행 → e2e 이전 12단계 전부 exit 0 → e2e에서 **19 passed / 0 failed / 0 refused** 지점에 **사용자가 중단.** 로그 **`/tmp/opencode/solo-integration.log`**, 재사용 스크립트 **`/tmp/opencode/solo-integration.sh`**.
- **⚠️ 이건 green이 아니다**: Playwright 요약 줄이 없고 게이트는 `FAIL at e2e` + `e2e: exit 1`로 끝났으며, 스크립트의 `EXIT=$?` 에코 줄이 없다 → **최종 exit code 없음.** "이전 실행이 죽은 지점(25 passed)을 넘어갔다"는 사실은 병행 가설과 **일치할 뿐 증명하지 않는다.**

### 이미 끝난 조사 — 이거 다시 하지 말 것
- **OOM 기각.** 호스트 8코어 / RAM 28GiB / available 약 20GiB / swap 16GiB 전부 미사용. `dmesg -T`·`journalctl -k`·`kern.log`·`syslog`에 해당 시간대 OOM 항목 없음.
- **`tests/e2e/pages-static-smoke.spec.ts` 기각.** 자기 `node:http` 서버를 ephemeral 포트로 연다(`server.listen(0, "127.0.0.1")`, spec 60행)하고 같은 서버만 닫는다(74행). 4588 무관, 외부 프로세스 spawn/kill 없음.
- **충돌 경계가 정확함.** 마지막 **통과** 테스트는 #30 `pages-static-smoke.spec.ts`(3.1s, `main-integration.log:362`). 그 뒤 21건이 전부 refused.
- **남은 가설 — 미확정.** 병행 레인 또는 취소된 F3 태스크의 teardown이 공유 `vite preview`(4588)를 죽였을 가능성. `webServer`는 `build-site.mjs && vite preview --strictPort`, `reuseExistingServer: false`라 그 node 하나가 죽으면 이후 전부 refused가 되고 assertion까지 못 간다.

## 4. 다음 할 일
1. **`/tmp/opencode/solo-integration.sh`로 `npm run verify:integration`을 시작부터 끝까지 완주시켜 진짜 exit code를 얻는다.** 완전히 단독(병행 레인·에이전트·워크트리 없음). 또 죽으면 추측하지 말고 `DEBUG=pw:webserver`가 잡아둔 **vite 자체 stderr를 `/tmp/opencode/solo-integration.log`에서 읽는다.** 완주하지 못한 실행은 통과로 쓰지 않는다.
2. **F2**: `npm run cmake:configure` → `npm run cmake:build` → `npm run test:native`. **통합 main에서 한 번도 실행되지 않음.**
3. **F3**: 아래 5절 레인을 rebase → merge → firefox/webkit 스위트 실제 실행.
4. **F4**: 1~3 뒤 재감사. 분모 산술을 **원본 계획서 파일에서 재유도.** 보고된 APPROVE_WITH_DEVIATIONS(blocking 0 / non-blocking 6) 판정 파일은 찾지 못했다 — 로컬 `final/F4-scope-fidelity.md`는 2026-09-27 REJECT 감사본. 확인 필요.
5. **사용자 결정**: Todo 29~33 편입 여부 / 분모(6절).
6. **F1**: `verify:release`의 새 18단계 목록을 끝까지 완주 실행한 적이 없다. 코드 merge ≠ F1 통과.
7. **push**: 1~3이 green인 뒤에만.

## 5. ⚠️ F3 레인 — 실제 작업물, 그리고 merge 전 rebase 필수
worktree `.claude/worktrees/f3-browser-qa`, 브랜치 `f3-browser-qa` **`781a789`**(부모 `361b638`).
- 실제 크로스브라우저 구현: `playwright.config.ts`(+24, firefox/webkit 프로젝트), `tests/e2e/audio.spec.ts`(+25), `gameplay-progression.spec.ts`(+18), `memory-smoke.spec.ts`(+22). **쓰레기가 아니다.**
- **⛔ 치명적 함정**: 부모가 `361b638` = handoff 문서 커밋 `f08f4b1` **이전**. **그대로 merge하면 `plan.md` diff가 handoff 문서 업데이트를 되돌린다(REVERT), 조용히.** 반드시 `f08f4b1` 위로 rebase 후 merge.
- 미커밋: `playwright.config.ts` modified.
- 미추적 throwaway `f3*.tmp.mjs` **15개는 커밋 금지하고 버린다**: `f3probe`, `f3probe2`~`6`, `f3isolate`, `f3alsa`, `f3alsa2`, `f3audio`, `f3ctx`, `f3flag`, `f3null`, `f3prefs`, `f3prefs2`. probe 스크린샷·로그 잔여물은 repo 밖 `/tmp/opencode/f3/`.
- `c9cde1e`는 부모가 `8c3086f`인 구버전 salvage 사본이고 `781a789`가 대체한다.
- main의 `playwright.config.ts`은 `projects: [{ name: "chromium" }]` 하나뿐 — **F3는 한 번도 실행되지 않았다.** 브라우저는 설치 완료(chromium-1169, firefox-1482, webkit-2158).

## 6. ⚠️ 분모 함정 — 미결 사용자 결정
**Todo 29·30·31·32·33은 main에 구현·merge·검증까지 끝났지만 `.omo/plans/ultima-web.md`에 항목이 아예 없다.** 원본 계획서 체크박스는 정확히 32개(Todo 1~28 + F1~F4). **분모는 32지 35나 37이 아니다** — 진행률이 실제보다 낮게 표시된다. 편입 여부와 분모를 **사용자가 결정해야** 하며, 이 결정 없이는 100%에 도달할 수 없다.
F4가 "계획서 두 벌이 byte-identical이 아니다"고 지적한 것은 **위양양성** — `cmp .omo/plans/ultima-web.md docs/ULTIMA_WEB_PLAN.md`는 exit 0.

## 7. merge된 레인 (main `f08f4b1` 기준)
| branch | 커밋 |
|---|---|
| `todo-27-korean-status` | `8c3086f` (fast-forward, **자체 게이트 PASS**) |
| `todo-29-shrine` | `1b7ee62`, `9eb5b65`, `1e58f44` |
| `todo-30-readchoice` | `cfb1f71` (merge `238ca39`) |
| `todo-31-status-summary` | `f894265`, `c65f768`, `e9a7267` (merge `27797e6`) |
| `f1-release-docs` | `c69690e`, `a0c541e`, `f1b2296`, `cf9879a`, `0ff8ffa` |
| main 위 직접 | `7592d4c` (vendor xu4 tree 해시 재계산), `7dded25` (i18n-generate.d.mts 중복 `statusNames` 선언 수정 → `typecheck` exit 2를 유발하고 이 커밋이 고침) |

## 8. green으로 관측된 게이트 (통합 main, exit 0) — **단 e2e는 exit 1**
`npm ci` · `build:modules` · `build:wasm` · `check:build-fresh` · `test:unit` (46 files / **569** tests) · `verify:repo-sources` (4 pinned components, xu4 fileCount 412) · `typecheck` · `build` · `i18n:check -- --strict` (4561 entries) · `build:site --base=/ultima/` · `audit:dist -- --require-engine` · 계획서 두 벌 `cmp` · `git diff --check` · `i18n:generate` 후 `git diff --exit-code src/i18n/generated/strings.ts` = CLEAN.
Todo 27 자체 게이트는 별개로 PASS(`/tmp/opencode/todo27-integration.log`, `EXIT=0`, e2e 46/46 35.7분).

## 9. 금지사항 / 제품 결정
- **원본 데이터 커밋 금지**: `ultima4.zip`, 원본 `.EXE`/`.TLK`/`.MAP`/`.EGA`/`.SAV`, 추출 원문 corpus, 사용자 save, secret. 원본은 `/home/taejin/ultima4-original-data/ultima4.zip`에 있고 **repo와 모든 artifact에 절대 넣지 않는다.**
- **실패 테스트 삭제·약화 금지.** 인프라 실패(e2e webServer 죽음)도 통과로 기록하지 않는다.
- **통합 검증은 `npm run verify:integration` 하나뿐**, 손으로 나열해 일부만 돌리지 않는다. 어떤 단계든 exit 0이 아니면 merge/push 금지.
- **S4(reagent)는 사용자 승인된 문서화 편차**: 캔버스에 glyph가 없는 자리는 title-only/placeholder로 렌더하고 그 자리에만 영어가 남는다. **고치지 말 것.** 어떤 문서도 이 예외 없이 "한국어 커버리지 완료"라고 주장하지 말 것.
- **corpus 크기를 문서에 숫자로 고정하지 않는다.** `npm run i18n:check -- --strict`가 출력하면서 검증하는 단일 소스.
- main merge/push는 별도 확인 프롬프트 없이 진행(사용자 상시 지시).

## 10. 미검증 사실 (추측 금지)
- **Todo 30이 실제 UX 버그를 고쳤는지 미검증**: 한국어 입력창을 쓴 뒤 화살표 키와 명령 키가 조용히 무시되던 문제. 고쳤다고 가정하지 말고 재현부터.
- **통합 main에서 실행되지 않은 것**: `test:native` / cmake configure+build (F2), F3 firefox/webkit, `verify:release` 전체 완주(F1 근거 없음).
- **F2의 기존 F-01/F-11 finding은 위양양성.** 산출물은 `.omo/evidence/ultima-web/task-27/`(`fallback.log`, `gates.log`, `task27-unit-red.log`, `task27-unit-green.log`, 회귀 e2e 로그 8종, `native.log`, 스크린샷 4종). evidence는 로컬 전용이라 이 worktree엔 `fallback.log` 하나만 복제.
- **F4 증거 공백**: APPROVE_WITH_DEVIATIONS 판정 파일 미발견(위 4절 4번).

## 11. worktree 지도
| 경로 | 상태 |
|---|---|
| `.claude/worktrees/agent-ad52af6bd293aab90` | **main `f08f4b1` — 모든 main 작업은 여기서** |
| `/home/taejin/ultima` (루트) | **stale. `f3-real-browser-qa` `6462af3`, dirty. 쓰지 말 것** |
| `.claude/worktrees/f3-browser-qa` | `781a789`. **5절 참고 — rebase 필수** |
| `.claude/worktrees/todo-27-status` | `todo-27-korean-status` `8c3086f` (main에 반영됨) |
| `.claude/worktrees/f1-release-docs` | `f1-release-docs` `0ff8ffa` (main에 반영됨) |
- merge 전 미커밋 상태 보존: `salvage/pre-merge-main-2026-10-01` (`c5b01af`)

## 12. 재개 방법
```bash
cd /home/taejin/ultima/.claude/worktrees/agent-ad52af6bd293aab90
git status -sb && git log --oneline -3
/tmp/opencode/solo-integration.sh          # 단독 실행. 끝까지 완주시켜 exit code를 얻는다
```
상세: `handoff.md` 마지막 두 절(2026-10-01), `plan.md` "통합 merge 상태" 및 "바로 다음 순서"(2026-10-01).
