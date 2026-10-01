# HANDOFF
작성 시각: 2026-10-01 22:10 KST (3차 갱신) · 세션 재개용 요약

## 1. 목표
Ultima IV(xu4)를 원본 `ultima4.zip`을 사용자가 직접 선택하는 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식하고 실제 플레이 화면을 한국어로 만든다. 진행 기준 `plan.md`, 세부 정의 원본은 `.omo/plans/ultima-web.md`.
순서: 원본 계획서 100% → F1~F4 완주 → 그 다음 main push.

## 2. 현재 상태 — **최상위 BLOCKER 해소, F2까지 green**
- 작업 트리 `/home/taejin/ultima/.claude/worktrees/agent-ad52af6bd293aab90`, main tip **`9872f4b`**. **push하지 않았다.** main이 origin보다 29커밋 앞섬.
- 진행률 **28/32 = 87.5%** (`[x]` 28 = Todo 1~26 + 27 + 28, `[ ]` 4 = F1·F2·F3·F4). 2026-10-01 22:05에 계획서 체크박스를 재집계해 확인(총 32 / `[x]` 28 / `[ ]` 4).
- **✅ 1번(통합 게이트 완주) 완료. ✅ 2번(F2 네이티브 게이트) 완료. 다음은 3번 F3.**

## 3. ✅ 1번: 통합 main `verify:integration` 완주 — GREEN (2026-10-01 21:06~21:43)

main `9872f4b`에서 **완전 단독** 실행(병행 레인·에이전트 0, 고아 vite preview 사전 제거) → **`EXIT=0`**.
```
# verify:integration 2026-10-01T12:43:00.036Z PASS
13단계 전부 exit 0 · e2e 46 passed (35.8m) · ERR_CONNECTION_REFUSED 0건
```
- `test:unit` 46 files/**569 tests** · `verify:repo-sources` 4 pinned · `i18n:check --strict` **4561 entries/0 pending** · `audit:dist --require-engine` 9 files no leaks · `check:build-fresh` 일치 · `build:modules`·`build:wasm` 70/70 소스 · 계획서 `cmp` exit 0 · `git diff --check` exit 0.
- Playwright 요약 줄이 **실제로 존재** → 완주 확정(AGENTS.md "완주하지 못한 실행은 통과로 쓰지 않는다" 충족).
- 로그 `/tmp/opencode/p0-solo-gate.log`(스크립트 `/tmp/opencode/p0-solo-gate.sh`), evidence `.omo/evidence/ultima-web/integration/verify-integration.log`.
- **직전 실패 런이 죽었던 정확한 지점인 #25 `korean-shop.spec.ts:269` healer가 2.7m에 통과.**

### 🔍 정정: 기존 "마지막 통과 = #30 pages-static-smoke" 진단은 **틀렸다**
- **사실**: 실패 런 46건 중 **#30은 실패 블록 한가운데서 통과했다**(`main-integration.log:362`, 3.1s). 통과 25 / 실패 21.
- **#30의 통과는 4588 생존 증거가 아니다**: `tests/e2e/pages-static-smoke.spec.ts:60`이 `server.listen(0, "127.0.0.1")`로 **자체 ephemeral 포트**를 열고 70행에서 자기 포트로만 navigate한다. 4588을 전혀 쓰지 않는다. → 기존 plan.md의 "기각(:53)"과 "경계 근거(:54)"는 **상호 모순**이었다. 둘 다 대체됨.
- **정정된 사실**: 첫 실패는 **#25**(1.5m). 그 뒤 #26~#29·#31~#46이 2.1s refused. **사망 지점은 테스트 경계가 아니라 #25 도중** — #25 스택이 `korean-shop.spec.ts:237`(**두 번째** `bootAndSelectZip`)이고 #26은 `:235`(**첫 번째**)다. 즉 첫 부팅 성공 → 실제 엔진 1.5m 캐릭터 생성 성공 → 두 번째 부팅 `page.goto`에서 refused.

### ⚠️ 원인 미확정 (제품 결함 아님 — infra 이슈)
- **green은 "단독 실행 시 관측"이고 "병행 실행이 원인"은 증명되지 않았다. 순위를 매기지 않는다.**
- 저장소엔 임의 PID/포트를 죽이는 코드가 없다. `pkill`/`killall`/`process.kill`은 `scripts/`·`tests/`에 0건. `scripts/qa-native-baseline.mjs:114,133`의 `.kill("SIGKILL")`은 **자기 spawn한 Xvfb·xu4 자식** 한정.
- "4588 고아 preview" 가설은 **배제** — `playwright.config.ts`가 `reuseExistingServer:false` + `--strictPort`이라 점유 프로세스가 있으면 Playwright가 부팅 단계에서 즉시 실패하는데, 실제로 24개가 통과했다.
- 실패 런은 **한참 버티다(#24까지 누적) 죽었다** — 리소스 소진 가설과도 맞물린다. 병행 teardown·리소스 소진·그 외 외적 신호를 구분할 수 없다.
- **증거 공백(직접 원인)**: 실패 런에 `DEBUG=pw:webserver`가 없어 vite stderr가 없다. 포렌식 물량 `test-results/port-4588/`(21개 실패 디렉터리 + `.last-run.json`, 288K) 보존.
- **재현은 유일한 수단이 아니다**(의도적 병행 재현은 중단→exit code 없음으로 실패). **다음 발생 시 `DEBUG=pw:webserver` + `lsof -i :4588` 스냅샷 필수.**

## 4. ✅ 2번: F2 네이티브 게이트 — GREEN (2026-10-01 22:04~22:05)

main `9872f4b`에서 **처음 실행**. `build:native` → `cmake:configure` → `cmake:build` → `test:native` **4단계 전부 exit 0, ctest 4/4 통과**.
- **첫 실행은 `test:native` exit 8로 실패**했다. 원인은 **제품 결함이 아니라 F2 명령 목록에 빠진 선행 단계**였다 — `native/CMakeLists.txt:51-61`이 "네이티브 xu4는 `npm run build:native`가 별도로 빌드한다. 전체 엔진 빌드는 이 CMake 프로젝트 소속이 아니다"고 명시하는데 그게 목록에 없었다. `native-baseline-negative`가 `build/host/xu4-src/src/xu4` 부재를的理由로 실패했고, ctest 메시지가 "run npm run build:native first"를 직접 알려줬다.
- 선행 단계 포함 시 4/4 green. 실제 엔진 컴파일·링크가 일어났음을 확인(로그 232줄의 실제 `g++` 호출, `build/host/xu4-src/src/xu4`가 22:04에 생성된 ELF PIE).
- 로그 `/tmp/opencode/f2-native-gate2.log`(green), `/tmp/opencode/f2-native-gate.log`(첫 실패 실행).
- 기존 F2의 F-01/F-11 finding은 **위양양성**으로 정리됨. task-27 산출물은 `.omo/evidence/ultima-web/task-27/`.

## 5. 다음 할 일
1. **F3 (최우선)** — worktree `.claude/worktrees/f3-browser-qa`, 브랜치 `f3-browser-qa` `781a789`(부모 `361b638`). **rebase 불필요**(6절 정정). 실제 남은 위험은 미추적 `f3*.tmp.mjs` 15개 폐기와 `f3-browser-qa` worktree의 미커밋 `playwright.config.ts` 정리뿐. merge → 실제 `ultima4.zip`으로 **firefox/webkit 스위트 실행**(지금까지 한 번도 안 됨). merge 직전엔 `npm ci` 별도 실행(verify:integration 13단계에 없음). **사용자 승인 정지 지점.**
2. **F3 merge 후 통합 게이트 재실행** — 병합 트리에서 새 green을 확정한다. (F3가 chromium green을 "무효화"한다는 표현은 과대다 — 6절 참조. chromium 경로는 보존된다. 그래도 AGENTS.md merge 게이트 규칙상 필수.)
3. **F4 재감사** — 위 3·2가 끝난 뒤. 분모 산술은 원본 계획서 파일에서 재유도. **F4 승인 파일 미발견**(보고된 APPROVE_WITH_DEVIATIONS 판정 파일 없음, 로컬 `final/F4-scope-fidelity.md`는 2026-09-27 REJECT 감사본) → 새로 작성 필요.
4. **F1** — `verify:release`의 새 18단계 목록을 끝까지 완주 실행한 적이 없다. **코드 merge ≠ F1 통과.**
5. **사용자 결정** — Todo 29~33 편입 여부와 분모(8절).
6. **push** — F3 게이트 green 뒤에만.

## 6. ⚠️ F3 레인 — 실제 작업물. ⚠️ **이전 "치명적 함정"은 허위 경보였다 (2026-10-01 정정)**
worktree `.claude/worktrees/f3-browser-qa`, 브랜치 `f3-browser-qa` **`781a789`**(부모 `361b638`).
- 실제 크로스브라우저 구현: `playwright.config.ts`(+24, firefox/webkit 프로젝트), `tests/e2e/audio.spec.ts`(+25), `gameplay-progression.spec.ts`(+18), `memory-smoke.spec.ts`(+22). **쓰레기가 아니다.**
- ✅ **rebase 불필요. "merge하면 `plan.md`가 REVERT된다"는 이전 경보는 틀렸다.** 근거: (a) `git diff --stat 361b638 781a789` = 위 4개 파일만, **`plan.md`/`handoff.md`/`HANDOFF.md`는 한 줄도 안 건드림**. (b) `git diff --stat 361b638 9872f4b -- <4개 파일>` = **빈 출력**(main도 안 건드림). 3-way merge는 병합 브랜치가 수정한 파일만 되돌린다 → 충돌·문서 되돌림 없음. rebase는 해롭지 않으나 불필요.
- ⚠️ **"F3가 chromium green을 무효화한다"는 과대 주장이었다(정정).** `verify-integration.mjs:32`가 `--project=chromium` 명시, `audio`·`memory` 스펙은 chromium 전용 플래그를 `browserName === "chromium"`일 때만 적용, `gameplay-progression`은 `setTimeout` 추가뿐 신규 테스트 0 → **chromium 46건 경로 보존**. 그래도 병합 후 게이트 재실행은 AGENTS.md merge 규칙상 필수.
- **실제 남은 위험**: ① 미추적 `f3*.tmp.mjs` **15개 커밋 금지·폐기**(`f3probe`, `f3probe2`~`6`, `f3isolate`, `f3alsa`, `f3alsa2`, `f3audio`, `f3ctx`, `f3flag`, `f3null`, `f3prefs`, `f3prefs2`; 스크린샷·로그는 repo 밖 `/tmp/opencode/f3/`). ② `f3-browser-qa` worktree의 미커밋 `playwright.config.ts` 정리(루트 `f3-real-browser-qa`의 M은 무시 — §11).
- `c9cde1e`는 부모가 `8c3086f`인 **구버전** salvage 사본이고 `781a789`가 대체한다.
- 브라우저 설치 완료: chromium-1169, firefox-1482, webkit-2158. **F3 스위트는 한 번도 실행되지 않았다.**

## 7. ⚠️ 분모 함정 — 미결 사용자 결정
**Todo 29·30·31·32·33은 main에 구현·merge·검증까지 끝났지만 `.omo/plans/ultima-web.md`에 항목이 아예 없다.** 원본 계획서 체크박스는 **정확히 32개**(Todo 1~28 + F1~F4, 2026-10-01 재집계 확인). **분모는 32지 35나 37이 아니다** — 진행률이 실제보다 낮게 표시된다. 편입 여부와 분모를 **사용자가 결정해야** 하며, 이 결정 없이는 100%에 도달할 수 없다.
F4가 "계획서 두 벌이 byte-identical이 아니다"고 지적한 것은 **위양양성** — `cmp .omo/plans/ultima-web.md docs/ULTIMA_WEB_PLAN.md`는 exit 0(3번 게이트에서도 재확인).

## 8. merge된 레인 (main `9872f4b` 기준)
| branch | 커밋 |
|---|---|
| `todo-27-korean-status` | `8c3086f` (fast-forward, 자체 게이트 PASS) |
| `todo-29-shrine` | `1b7ee62`, `9eb5b65`, `1e58f44` |
| `todo-30-readchoice` | `cfb1f71` (merge `238ca39`) |
| `todo-31-status-summary` | `f894265`, `c65f768`, `e9a7267` (merge `27797e6`) |
| `f1-release-docs` | `c69690e`, `a0c541e`, `f1b2296`, `cf9879a`, `0ff8ffa` (merge `361b638`) |
| main 위 직접 | `7592d4c`(vendor tree 해시), `7dded25`(중복 `statusNames` 선언 → `typecheck` exit 2 유발, 이것이 고침), `f08f4b1`·`9872f4b`(handoff 문서) |

## 9. 금지사항 / 제품 결정
- **원본 데이터 커밋 금지**: `ultima4.zip`, 원본 `.EXE`/`.TLK`/`.MAP`/`.EGA`/`.SAV`, 추출 원문 corpus, 사용자 save, secret. 원본은 `/home/taejin/ultima4-original-data/ultima4.zip`에 있고 **repo와 모든 artifact에 절대 넣지 않는다.**
- **실패 테스트 삭제·약화 금지.** 인프라 실패(e2e webServer 죽음)도 통과로 기록하지 않는다.
- **통합 검증은 `npm run verify:integration` 하나뿐**, 손으로 나열해 일부만 돌리지 않는다. 어떤 단계든 exit 0이 아니면 merge/push 금지.
- **통합 게이트는 단독 실행한다** — 이번에 green을 얻었지만, 병행 실행이 원인이라는 건 증명되지 않았다. 이 규칙을 완화하지 말 것.
- **F2 네이티브 게이트는 `build:native` 선행이 필수다** — `native/CMakeLists.txt:51-61` 참조. 목록에서 빠뜨리면 `native-baseline-negative`가 exit 8로 죽고, 이는 **제품 결함이 아니라 명령 목록 결함**이다.
- **S4(reagent)는 사용자 승인된 문서화 편차**: 캔버스에 glyph가 없는 자리를 title-only/placeholder로 렌더하고 그 자리에만 영어가 남는다. **고치지 말 것.** 어떤 문서도 이 예외 없이 "한국어 커버리지 완료"라고 주장하지 말 것.
- **corpus 크기를 문서에 숫자로 고정하지 않는다.** `npm run i18n:check -- --strict`가 단일 소스.
- main merge/push는 별도 확인 프롬프트 없이 진행(사용자 상시 지시).

## 10. 미검증 사실 (추측 금지)
- **F3 firefox/webkit**: 실제 실행된 적 없다. 브라우저는 설치돼 있으나 스위트 통과 근거가 없다.
- **F1**: `verify:release` 18단계 전량 완주 미실행.
- **F4**: 승인 판정 파일 미발견(5절 3번).
- **webServer 비자발 사망의 원인**: 미확정(3절).
- **Todo 30이 실제 UX 버그를 고쳤는지 미검증** — 한국어 입력창을 쓴 뒤 화살표/명령 키가 조용히 무시되던 문제. 고쳤다고 가정하지 말고 재현부터.

## 11. worktree 지도
| 경로 | 상태 |
|---|---|
| `.claude/worktrees/agent-ad52af6bd293aab90` | **main `9872f4b` — 모든 main 작업은 여기서** |
| `/home/taejin/ultima` (루트) | **stale. `f3-real-browser-qa` `6462af3`, dirty. 쓰지 말 것** |
| `.claude/worktrees/f3-browser-qa` | `781a789`. 6절 참고 — **rebase 불필요** |
| `.claude/worktrees/todo-27-status` | `todo-27-korean-status` `8c3086f` (main에 반영됨) |
| `.claude/worktrees/f1-release-docs` | `f1-release-docs` `0ff8ffa` (main에 반영됨) |
- merge 전 미커밋 상태 보존: `salvage/pre-merge-main-2026-10-01` (`c5b01af`)
- worktree 27개. 게이트 실행에는 영향 없으나 병행 레인 개수는 늘리지 않는다.

### ⛔⛔ 루트 `AGENTS.md`가 stale하고 harness가 그 사본을 주입한다 (2026-10-01 Oracle 발견, 최고 위험)
- **루트 `/home/taejin/ultima`의 `AGENTS.md`는 main의 커밋된 사본보다 6줄 짧다.** 그 stale 사본이 **에이전트 system prompt로 주입**된다.
- 빠진 것: "**통합 게이트는 단독으로 실행한다**"(+ 그 재실행이 완주할 때까지 결과를 확정하지 않는다), "**e2e webServer 죽음은 인프라 실패다**", "**통합 검증은 `verify:integration` 하나로만**", merge 게이트의 `check:build-fresh`, "**게이트 실패는 숨기지 않는다**". 숫자도 낡음(`현재 22`, `n/26` vs main의 `Todo 개수`/`n/N`).
- **실측 증거**: Oracle Gate 2 리뷰의 system prompt가 **루트** `AGENTS.md`에서 주입돼서, 리뷰가 처음부터 판단 근거의 핵심 룰(단독 실행 규칙, 웹서버 실패 성격)을 놓친 상태로 시작했다. 그 리뷰는 그래도 `verify:integration`의 `--project=chromium`을 파일에서 직접 찾아내 정정 B를 잡아냈지만, **룰이 주입돼 있었으면 애초에 그 수렴 경로를 못 탔을 수 있다.**
- **이 문서를 못 읽는 다음 세션은 같은 함정을 다시 밟는다.** `HANDOFF.md`가 루트를 "stale"로 표시하는 것으로는 부족하다 — 주입 경로는 harness 레벨이라 문서로는 통제할 수 없다.
- **대처**: (1) main 작업은 **반드시** `.claude/worktrees/agent-ad52af6bd293aab90`에서 한다(그 `AGENTS.md`는 완전판 — `check:build-fresh`·단독 실행 룰·게이트 실패 숨기지 않기 모두 포함). (2) 루트에서 세션을 시작하면 위 룰들을 손으로 보강한다. (3) 근본 해결은 루트 worktree를 최신 main으로 정리하는 것 — **사용자 승인 필요.**

## 12. 재개 방법
```bash
cd /home/taejin/ultima/.claude/worktrees/agent-ad52af6bd293aab90
git status -sb && git log --oneline -3
export PATH="$HOME/.local/opt/node22/bin:$PATH"
export ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip
# 통합 게이트는 반드시 단독 + DEBUG 필수
/tmp/opencode/p0-solo-gate.sh          # 36.5m, e2e 마지막
# F2 네이티브 (선행 build:native 필수)
/tmp/opencode/f2-native-gate2.sh
```
상세: `handoff.md` 마지막 절(2026-10-01), `plan.md` "✅ 통합 merge 상태" 및 "바로 다음 순서"(2026-10-01 22:05).
