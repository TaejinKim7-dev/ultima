# HANDOFF
작성 시각: 2026-09-30 08:14 KST

## 0. 이번 세션이 실제로 한 일 (2026-09-30)
- **중단돼 있던 "main 전체 e2e 1회"를 실제로 끝냈다. 결과는 43 passed / 2 failed (40.0분).** 실패 2건은 `tests/e2e/korean-shop.spec.ts`(Todo 25)이고, **격리 재실행으로 재현 확인**했다(flake 아님).
- 따라서 **Todo 24·25·26은 ✅ 처리하지 않았다. 진행률 23/31 유지**, 계획서 체크박스도 `[ ]` 유지(AGENTS.md의 "실패 테스트 삭제·약화 금지"). 코드 변경은 **한 줄도 하지 않았다**.
- 게이트는 전부 exit 0 재확인, `plan.md`·`handoff.md`·이 파일 갱신, 병렬 에이전트 3개(읽기 전용) 기동·회합.

## 1. 목표 (What we're building)
- xu4(Ultima IV)를 원본 `ultima4.zip`을 사용자가 직접 선택하는 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식하고 한국어로 실제 플레이 가능하게 한다. 진행 기준은 `plan.md`(분모 31 = Todo 1~27 + F1~F4).
- 최종 목표는 **한국어로 실제 플레이**하는 웹 울티마 4. 계획 체크박스가 이 완료를 대신하지 않는다.

## 2. 현재 상태 (Current state)
- 진행률 **23/31 (74.2%)**. ✅는 Todo 1~23. **이번 세션에 변동 없음.**
- `main` HEAD `fb583a6`(= `391db3a` 문서 + `c4cdbf5` Todo 25 merge). **origin/main은 `dc5764d`** — Todo 25 merge와 이후 문서 커밋은 **미push**. (`git push`는 이번 세션에 하지 않았다. 사용자 승인 필요.)
- `main`은 worktree `/home/taejin/ultima/.claude/worktrees/agent-ad52af6bd293aab90`에 체크아웃돼 있다. **저장소 루트 `/home/taejin/ultima`는 stale 브랜치 `f3-real-browser-qa`(`6462af3`)** — 그쪽 `HEAD`로 `git diff`를 돌리면 완전히 잘못된 결론이 나온다(이번 세션에 실제로 한 번 빠짐).
- Todo 24·25·26: 코드는 main에 merge됐으나 **계획 acceptance의 "전체 e2e 스위트"가 실패했으므로 ✅ 보류 사유가 "미실행"에서 "실패"로 바뀌었다.**
- Todo 27(`todo-27-korean-status` `8023dce`, worktree `.claude/worktrees/todo-27-status`): 구현 4커밋 + main merge까지 있으나 main 합류 후 wasm 재빌드·게이트·e2e·리뷰는 여전히 **미완료**.

## 3. 변경한 파일 (Files changed)
- 이번 세션 커밋 없음. tracked 변경 3개(전부 문서): `plan.md`(중단 기록을 "통합 e2e 실행 완료·실패"로 대체 + 재개 순서 재작성), `handoff.md`(말미에 "2026-09-30 통합 게이트 + 전체 e2e 실행" 절 추가), `HANDOFF.md`(이 파일).
- untracked(로컬 증거): `.omo/evidence/ultima-web/integration/{gate-2026-09-30.log, e2e-full-2026-09-30.log, e2e-shop-rerun-2026-09-30.log}`, `test-results/port-44{70,71}/`, `.emsdk` symlink.
- 메인 체크아웃 `/home/taejin/ultima`의 미커밋 `HANDOFF.md`/`handoff.md`/`playwright.config.ts`는 **F3 브라우저 QA 작업으로, 이번 세션과 무관하므로 건드리지 않았다.**

## 4. 이번 세션 실행 명령과 실제 결과
게이트 (worktree, `.omo/evidence/ultima-web/integration/gate-2026-09-30.log`):
```
npm run build:wasm                      # 0
npm run test:unit                       # 0 — 34 files / 408 tests
npm run verify:repo-sources             # 0
npm run typecheck                       # 0
npm run build                           # 0
npm run i18n:check -- --strict          # 0 — 4523 entries
npm run build:site -- --base=/ultima/   # 0
npm run audit:dist -- --require-engine  # 0
git diff --check                        # 0
cmp .omo/plans/ultima-web.md docs/ULTIMA_WEB_PLAN.md   # 0
```
e2e (`integration/e2e-full-2026-09-30.log`, `integration/e2e-shop-rerun-2026-09-30.log`):
```
ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip PLAYWRIGHT_PORT=4470 \
  npx playwright test --project=chromium --workers=1        # 43 passed / 2 failed (40.0m)
ULTIMA4_DATA=... PLAYWRIGHT_PORT=4471 \
  npx playwright test tests/e2e/korean-shop.spec.ts --project=chromium --workers=1
                                                          # 0 passed / 2 failed (동일 실패 재현)
```
- 실패 2건: `korean-shop.spec.ts:250` `healer (input-shop)`, `:288` `food vendor (=>)`. 둘 다 `talkAcrossCounter`(spec:201 throw)에서 `nobody answered across the counter`.

## 5. 이번 세션 조사 결론 (읽기 전용 에이전트 3개, 전부 evidence 기반)
**기각된 가설 (결정적 근거 있음)**
- **wasm 불일치 아님**: main `xu4.wasm` `04286f2f…`와 23:28에 이 스펙이 통과한 브랜치 `ef025658…`는 **정확히 2바이트**만 다르고 그 값이 빌드 날짜 문자열(`"30"` vs `"29"`). `playwright.config.ts:31`이 매 invocation마다 `build:site`를 돌려 `dist/engine/`은 항상 `build/wasm-release/`에서 재복사됨 → staleness 경로 없음.
- **merge/생성 손실 아님**: healer·food 템플릿 6개(`vendors:210/218/109/113/112/115`)와 이름 4개(`The Healer`/`Harmony`/`The Sage Deli`/`Shaman`)가 main 생성 테이블에 모두 존재하고 번역이 비어있지 않음.
- **vendor web-say 훅 배선 아님(강함)**: `cf_webSay`(`script_boron.cpp:313-377`) → `screenWebVendorSay` → `u4_web_vendor` → `src/shell.ts` talkText receiver → `vendor-compose.ts`. healer 4쌍/food 2~4쌍은 bail-out 한도(>8쌍·UCS-2·pool 1024) 미달. `vendor/xu4/src/discourse.cpp`의 `vendorGoods[]` 순서도 `person.h` enum과 일치.
- **스펙이 stale하다는 가설 아님**: `git diff 9a681dc main`은 **문서 3개뿐**이고 9a681dc는 main의 조상이다. 스펙·vendor·locale·생성 코드는 통과 시점과 byte-identical.

**유력 1순위 (미확정)**
- **vendor NPC 타일 접근 실패**. `scripts/qa-native-baseline.mjs:23-31`이 **같은 실패 모드("Funny, no response!")**를 이미 문서화하며 해법으로 "매 스텝 4방향 전부 시도"를 명시. 통과한 `korean-npc-output.spec.ts:106-113`은 그 4방향 패턴(`npcTalkDirs`)을 쓰고, 실패한 이 스펙은 **단일 방향만** 시도한다(spec:185-202). `location.cpp:223-228` + `xu4.cpp:293`(seed=time)이면 `MOVEMENT_WANDER` NPC의 위치가 실행마다 달라진다.

**확인 필요 (이번 세션에 확정 못 함)**
- healer/food vendor의 실제 `movement` 값 — 브라우저가 사용자 zip에서 추출하는 **원본 데이터라 repo에 검사할 artifact가 없고 커밋도 금지**.
- 실패 시 패널에 `"대화: "`(`game.cpp:2492`→`ui:game:141`)가 있었는지, `"이상하게, 반응이 없다!"`(`game.cpp:2513`→`ui:game:143`)가 있었는지. **현재 스펙은 실패 지점의 패널을 전혀 기록하지 않는다**(성공 뒤에만 `shop-observation.log` 작성) — 이 두 문자열이 원인(H2 접근 실패 vs H1 계열 훅 문제)을 구분하는 판별 근거인데 디스크에 없다.

**F1 관련 신규 발견 (exp-1)**
- HANDOFF.md가 지목한 3개 갭(task-10 trace·task-14 증거·Y/N)은 `verify:release-docs`를 **깨지 않는다**. 대신 **worktree에 evidence 6개 파일이 없어 지금 `verify:release-docs`는 실제로 실패한다**: task-3 `full-qa-native-baseline.log`, task-15 `i18n-strict.log`, task-18 `security-audit.log`·`dist-leak-rejected.log`, task-19 `live-pages-smoke.json`·`pages-static-smoke-ci-artifact.json`. 6개 모두 상위 트리 `/home/taejin/ultima/.omo/evidence/`에는 존재하므로 **복사로 해결**된다.
- **Y/N 한국어 답은 증거 공백이 아니라 런타임 배선 부재**다. `src/shell.ts:603`이 유일한 production 호출부이고 `resolveInput("text", …)`로 하드코딩되어 있으며, 프롬프트 종류를 알려주는 bridge 이벤트가 없다(shell.ts:544-548 주석). `resolveInput("yesno", …)`에 도달하는 런타임 경로가 없음 → 문서화로 닫히지 않으므로 **신규 Todo가 필요할 수 있다(사용자 결정)**.

## 6. 변경한 파일 없음 / 남은 일
- [ ] **`korean-shop.spec.ts` 진단 캡처 추가(테스트 약화 아님)**: `talkAcrossCounter`(spec:185-202)의 `throw` 직전에 패널 덤프 + 스크린샷을 `shop-failure-<talkKey>.log`로 남기고 `"대화: "` / `"이상하게, 반응이 없다!"` 유무를 명시해 원인을 판정.
- [ ] 위와 함께 접근을 `korean-npc-output.spec.ts:106-113`의 **4방향 전부 시도** 패턴으로 확장. 이는 확률적 실패에 확률적으로 시도하는 것이며 **검사 강도를 낮추는 것이 아니다**(프로젝트에 이미 문서화된 해법, `qa-native-baseline.mjs:23-31`).
- [ ] `korean-shop.spec.ts` 단독 재실행 → 통과 시 **전체 e2e 1회 재실행**(약 40분) → 그때 Todo 24·25·26 ✅ → **26/31**, 계획서 두 벌 체크박스 `[x]` + `cmp` 0.
- [ ] Todo 27 재개: worktree에서 `build:wasm`→게이트→e2e→리뷰→main merge→27/31.
- [ ] evidence 6개 파일을 worktree로 복사(위의 F1 항목) → `verify:release-docs` 0 확인.
- [ ] 미처리 리뷰 항목: 24 C++ 채널 동작 테스트·영어 부재 negative assert; 25 실제 construct throw 재현 테스트·무기/방어구/시약/여관 e2e; 26 About 화면 검증. **+ 신규 실제 버그 후보**: `vendors.b`의 healer/reagents/guild가 `build-items` 대신 정적 braced 문자열을 써서 `A-Curing` 같은 영문 아이템명이 한국어 패널로 새는 경로(`vendor-compose.ts:78` `LISTING_LINE` → 미등록 name → 영어 fallback). 소스 경로는 확정이나 실제 화면 노출은 e2e 미확인.
- [ ] F1~F4 (F3: WebKit은 사용자가 `sudo npx playwright install-deps webkit` 필요).

## 7. 막힌 부분 / 주의사항
- **`git push origin main` 미수행.** 이번 세션에서 승인 요청을 하지 않았다(사용자 결정 필요).
- e2e는 CPU 타이밍에 민감 — 동시 실행 금지, 포트 분리 필수(`PLAYWRIGHT_PORT`). 이번 세션은 전수 e2e를 단독 실행했다.
- **worktree 함정**: `main`은 `.claude/worktrees/agent-ad52af6bd293aab90`에 있다. 루트 `/home/taejin/ultima`에서 `git diff <branch> HEAD`를 돌리면 HEAD가 `f3-real-browser-qa`라 **조용히 틀린 결론**이 나온다. main 기준 비교는 반드시 `git diff <branch> main` 또는 worktree 안에서.
- `npm run i18n:inventory`는 `locales/ko/module.json`의 `% s` 수동 수정을 되돌림 → 실행 후 `git checkout locales/ko/module.json`.
- vendor 수정 시 `vendor/source-manifest.json`의 xu4 `treeSha256`/`fileCount`를 같은 커밋에서 재계산.
- Pages Source="GitHub Actions" 설정은 사용자만 가능.
- 에이전트 성공 보고는 diff/게이트로 재확인할 것(25·26·27은 이번에도 재확인 안 됨).

## 8. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima/.claude/worktrees/agent-ad52af6bd293aab90   # main 체크아웃
export PATH="$HOME/.local/opt/node22/bin:$PATH"
export ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip
source .emsdk/emsdk_env.sh
git status -sb                    # push는 사용자 승인 후
# 1) shop 스펙 수정 후 단독 실행
PLAYWRIGHT_PORT=4472 npx playwright test tests/e2e/korean-shop.spec.ts --project=chromium --workers=1
# 2) 통과 시 전체 e2e
PLAYWRIGHT_PORT=4473 npx playwright test --project=chromium --workers=1
```
- 상세: `plan.md` "바로 다음 순서"(2026-09-30 갱신), `handoff.md` 말미 "2026-09-30: 통합 게이트 + 전체 e2e 실행", 증거 `.omo/evidence/ultima-web/integration/`.
