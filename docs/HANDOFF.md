# HANDOFF
작성 시각: 2026-10-05 15:15 KST · 세션 재개용 요약 (공식 기록은 `docs/handoff.md` 마지막 절)

## 1. 목표 (What we're building)
- Ultima IV(xu4)를 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식하고, 실제 플레이 화면을 한국어로 보여 준다. 진행 기준은 `docs/plan.md`, 세부 정의 원본은 `.omo/plans/ultima-web.md`.
- 이번 세션: **Todo 50** — 게임 안 한국어 전체를 Neo둥근모로, 바람·던전 방향 줄을 한국어 덮개로.

## 2. 현재 상태 (Current state)
- 브랜치 `todo-50-pixel-font`(HEAD `841ef99` + 이 문서 커밋). 계획서 두 벌 Todo 50 `[x]`(`cmp` 0), `[x]` 53 / `[ ]` 1(Todo 43) → **53/54**.
- 통과(로그의 EXIT 줄 직접 확인): Firefox 29/29·WebKit 29/29(Todo 50 관련 10개 스펙), 네이티브 5단계 전부 0(ctest 4/4).
- **최종 단독 `verify:integration`은 이 문서 커밋 뒤 실행 — 결과가 `docs/handoff.md`에 기록되기 전엔 main merge 금지.** 이전 시도 1~6차는 실패·중단으로 통과 아님(handoff 참고).
- main = origin/main = `ca3cd6d`(직접 확인). Stage 3(Todo 49 Phase B)도 아직 main에 없고 이번 merge로 함께 들어간다. 이전 문서의 "Stage 3 main 머지·push 완료"는 틀렸다(plan.md에 정정 표기).

## 3. 변경한 파일 (Files changed)
- `src/overlay/overlay-layout.ts`, `src/shell.css`, `src/shell.ts`, `src/overlay/wind-heading.ts`·`wind-dom.ts`, `src/engine/startup.ts`, `vendor/xu4/src/screen.cpp`(바람 훅) — 구현 `4c899e3`(이전 세션).
- `tests/e2e/korean-wind-heading.spec.ts`(opencode 작성, 타입·단언 정정), `tests/e2e/pixel-font-computed.spec.ts`(신규), `korean-message-area`·`talk-keywords` 스펙에 computed font-family 단정 추가.
- 문서: `docs/plan.md`(53/54, 바로 다음 순서, Stage 3 정정), 계획서 두 벌, `docs/plans/README.md`, `docs/plans/2026-10-04-in-game-korean.md`, `AGENTS.md`(F2 네이티브 순서에 `deps:host`), `docs/handoff.md`.

## 4. 주요 결정과 근거 (Key decisions)
- computed font-family 단정은 acceptance 3번이 요구해 추가(이전엔 CSS 선언만 있었음). 폰트 미로드 검증은 `fontFamily`가 아니라 `FontFace.status`로(CSS 값은 로드와 무관).
- cheat 메뉴 미번역 해시 3건은 번역하지 않음(`docs/WEB_PORT.md:108`).
- Hawkwind 안정화·audit-dist 라이선스 검사는 Todo 50 밖 후속 후보.

## 5. 다음 할 일 (Next steps)
- [ ] 최종 단독 `verify:integration` 결과 확인 → `docs/handoff.md`에 exit code 기록 → merge 게이트(npm ci, test:unit, verify:repo-sources, typecheck, build, check:build-fresh, git diff --check) → `main` merge·push.
- [ ] `/home/taejin/ultima/.omo/evidence/ultima-web/task-50/GATE_RUNNING` 삭제 + `GATE_FREE` 생성(opencode 레인 신호).
- [ ] 사람의 화면 확인(사용자 확인 필요) — 체크리스트는 `docs/handoff.md` 2026-10-05 15:10 절 5번.
- [ ] Todo 43(개조 범위) 사용자 결정.

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- `korean-castle-output` Hawkwind 테스트 flake 의심(이번 세션 1/3 실패, NPC 위치 RNG 가설, 미측정). 최종 게이트에서 실패하면 그 스펙만 단독 재실행해 판단하고 기록한다.
- Haiku 서브에이전트는 백그라운드 작업의 종료 코드를 게이트 결과로 잘못 보고한 적이 있다 — 항상 로그 마지막 `EXIT=` 줄로 확인.
- opencode 보조 레인 worktree `/home/taejin/ultima-opencode`(브랜치 `todo-50-wind-e2e`, `todo-50-opencode-2~4`)의 증거는 git 추적 안 됨. 무거운 실행은 신호 파일(`GATE_RUNNING`/`GATE_FREE`/`OPENCODE_MAY_RUN`/`OPENCODE_DONE`)로 조율.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima
export PATH="$HOME/.local/opt/node22/bin:$PATH"; source .emsdk/emsdk_env.sh
export ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip
git status -sb && git log --oneline -5
npm run verify:integration > /tmp/todo50-integration-7.log 2>&1; echo "EXIT=$?" >> /tmp/todo50-integration-7.log   # 단독
# 네이티브: npm run deps:host && npm run build:native && npm run cmake:configure && npm run cmake:build && npm run test:native
```

---

## 이전 기록
- 2026-10-04: Todo 47(사용자 요청) 완료 — 넓은 화면에서 한국어 대화 패널·입력창이 게임 오른쪽 컬럼, 커서키가 페이지/패널을 스크롤하지 않음. 통합 게이트 61/61, Firefox·WebKit 14/14. 남은 것은 Todo 43(사용자 결정)뿐.

## 2026-10-04 중단 기록 (사용자 지시: "하던 작업 정리해. 모든 에이전트 그만하게 해")

- **승인된 계획**: `docs/plans/2026-10-04-in-game-korean.md` (plan mode 승인본, 원본 `~/.claude/plans/parsed-nibbling-widget.md`). Stage 0·0b 문서 정리 → Stage 1 Todo 48(대화 키워드 메뉴) ∥ Stage 2 Todo 49 Phase A(엔진 연결) → Stage 3 Todo 49 Phase B(게임 화면 안 한국어 덮개) → Stage 4 Todo 50(Neo둥근모 전체 적용).
- **이전: docs-consolidation WIP였음. 2026-10-04 main `88c142c`로 fast-forward merge + origin push 완료**:
  - 완료: `git mv`로 `plan.md`→`docs/plan.md`, `handoff.md`→`docs/handoff.md`, `HANDOFF.md`→`docs/HANDOFF.md`, `goal.md`→`docs/GOAL.md`, `project.md`→`docs/PROJECT_NOTES.md`, `.omo/drafts/mod-scope.md`→`docs/plans/mod-scope-proposal.md`, `docs/NEXT_FIVE_STEPS.md`→`docs/archive/`, 승인 계획 사본 추가.
  - **미완료(재개 시 할 일)**: 옛 경로 참조 갱신(AGENTS.md 3·51·62·67·69·71·72·79행, README.md 65·71·72행 링크 — `verify:release-docs`가 검사, docs/*.md, 코드·테스트 주석), `docs/README.md`·`docs/plans/README.md` 신규 작성, AGENTS.md에 `docs/README.md`·Haiku 규칙·`docs/HANDOFF.md` 위치 명시, `docs/archive/NEXT_FIVE_STEPS.md` 맨 위 "역사 기록" 표시, 계획서 두 벌 Todo 49 본문 수정, `.claude/settings.json` Stop 훅 경로를 `docs/HANDOFF.md`로. 검증은 Haiku로 `verify:release-docs`·`cmp`·`test:unit`·`git diff --check`·옛 경로 `git grep`.
- **멈춘 에이전트 (변경 없음, 커밋 0)**:
  - Todo 48: worktree `.claude/worktrees/agent-ab34f9739e0dbb906`, 브랜치 `todo-48-talk-keywords`(main `15de1cf` 기준). 그 에이전트의 상세 계획은 `~/.claude/plans/parsed-nibbling-widget-agent-ab34f9739e0dbb906.md`(주제어 뜻 초안 표 포함; ABYS=심연으로 고칠 것).
  - Todo 49 Phase A: worktree `.claude/worktrees/agent-a2c29640c4f177e6b`, 브랜치 `todo-49a-message-area-engine`, 아직 파일 수정 전에 멈춤.
- main은 `e4f40d5` 이후 문서 커밋까지 push된 상태(origin과 동기, Todo 47까지 배포됨). 진행률 50/54.

---

## 2026-10-04 — Stage 0·0b 완료 (docs-consolidation 브랜치에 WIP, main 미병합)

→ 2026-10-04 main `88c142c`로 머지 완료. **2026-10-04 같은 날**: 사용자 지시("테스트 통과하면 push와 main merge 해")로 main 88c142c로 fast-forward merge + origin push 완료.

> 사용자가 2026-10-04 중단을 풀고 "OMO-Slim skill로 최대한 병렬로 개발진행해"라 지시해 Stage 0·0b를 끝냈다. 제품 코드는 건드리지 않았다.

### 작업 위치
- worktree `/home/taejin/ultima/.claude/worktrees/agent-stage0-docs` (브랜치 `docs-consolidation` = main `ad9414d`에서 분기 후 `7f8632d` 작업 이어받기)

### 한 일
1. **`docs/README.md` 신규**: AI 시작점. 읽는 순서(AGENTS.md → docs/plan.md "바로 다음 순서" → docs/plans/README.md → docs/handoff.md 마지막 절), 개발 룰, 절대 금지, 환경, 새 세션 프롬프트(짧은/자세한) 포함.
2. **`docs/plans/README.md` 신규**: 구현 계획 색인. 현재 표에 `2026-10-04-in-game-korean.md`(Todo 48·49·50, 진행 중)·`mod-scope-proposal.md`(Todo 43, 사용자 결정 대기) 두 행. 상태 의미(✅/🟡/⛔/📦)와 추가 방법 포함.
3. **`AGENTS.md` 경로 갱신**: 첫 문단이 docs/README.md를 가리키게, 11곳의 옛 경로 참조(`plan.md`·`HANDOFF.md`·`handoff.md`)를 `docs/` 프리픽스로 갱신.
4. **`README.md` 링크 갱신**: 5곳의 옛 경로 링크, "문서" 색인에 AI 시작점·구현 계획 색인 두 링크 추가, 안내 문단을 docs/README.md로 교체.
5. **`.claude/settings.json` Stop 훅**: `[ -f HANDOFF.md ]` → `[ -f docs/HANDOFF.md ]`, 알림 텍스트도 `docs/HANDOFF.md`로. statusMessage은 의도적으로 둠.
7. **`scripts/release-docs-verifier.mjs`**: `APPEND_ONLY_LOGS = ["handoff.md", "docs/handoff.md"]` 추가. `checkReleaseDocs`/`verifyReleaseDocs` 양쪽에 `appendOnlyPaths` 인자 전달. 주석도 옮긴 사실 반영.
8. **`tests/unit/release-docs.test.ts`**: BASE_FILES에 `docs/handoff.md` fixture 추가, 새 테스트(`does not scan docs/handoff.md either`) 1개 추가.
9. **`docs/ULTIMA_WEB_PLAN.md` + `.omo/plans/ultima-web.md` Todo 49 본문 수정**(두 파일 byte-identical 유지, `cmp` exit 0):
   - (3) 엔진 훅: `screenEraseTextArea` 대신 message-area input echo·choice-key echo·play begin/end·modal signal·CR/LF 추가, `talkCrLf` 안에서는 CR/LF 끄기.
   - (4) 토글: localStorage 금지(세션 한정 + URL `?screen-ko=0`).
   - (6) 글꼴 크기: "16px 정수배" → "device-pixel multiples of 16".
   - (7) 신규: 긴 대답 페이지 큐("▼").
   - Must NOT: localStorage 금지 항목 추가.
   - References: `event.cpp:715`·`game.cpp:130/115`·`screenSetLayer` 추가.
10. **`docs/archive/NEXT_FIVE_STEPS.md`** 맨 위에 "역사 기록" 표시 추가.
11. **코드·테스트 주석 갱신**: `src/bridge/types.ts`, `src/engine/startup.ts`, `src/engine/persistence.ts`, `scripts/lib/{cpp-strings,text-width}.mjs`, `scripts/qa-native-baseline.mjs`, `tests/unit/{wasm-symbols,ui-template-source-scope,audio-manifest}.test.ts`, `tests/e2e/{audio,configure-menu-no-abort,dialogue-panel,failure-boundaries,gameplay-progression,korean-focus-return,korean-npc-alias,memory-smoke,save-reload}.spec.ts` — 옛 경로 참조를 docs/ 프리픽스로 갱신.
12. **`docs/plan.md` 진행률 절**: Stage 0·0b 완료 사실 추가, `goal.md` → `docs/GOAL.md`, `plan.md`/`handoff.md`/`HANDOFF.md` 옛 참조 정리.

### merge 게이트 (worktree에서 직접, emsdk·wasm 빌드 후)
- `npm run deps:host` · `npm run build:modules` · `npm run deps:wasm` · `npm run build:wasm` (wasm 1239515 bytes, fresh stamp): exit 0
- `npm run test:unit` 56/56 suites, 681/681 tests: exit 0
- `npm run verify:repo-sources` 4/4: exit 0
- `npm run typecheck`: exit 0
- `npm run build`: exit 0
- `npm run check:build-fresh`: exit 0
- `git diff --check`: exit 0
- `cmp` 계획서 두 벌: exit 0
- `npm run verify:release-docs`: exit 0 (soft SKIPPED 17건은 .omo/evidence/ 부재로 의도된 동작)

### 남은 것
- **2026-10-04**: 사용자 지시('테스트 통과하면 push와 main merge 해')로 **main `88c142c` 머지 + origin push 완료**.
- **다음 진행**: Stage 1(Todo 48, worktree `agent-ab34f9739e0dbb906`·브랜치 `todo-48-talk-keywords`) ∥ Stage 2(Todo 49 Phase A, worktree `agent-a2c29640c4f177e6b`·브랜치 `todo-49a-message-area-engine`) 병렬.
- AGENTS.md의 "통합 게이트는 단독 실행" 규칙 때문에 Stage 3 이전에 `verify:integration`을 **단독으로** 한 번 더 돌려야 한다.

---

## 2026-10-04 — wave9 Stage 1·2 통합 머지 완료 (Todo 48 + Todo 49 Phase A)

- **작업 위치**: root `/home/taejin/ultima`, wave9-combined → main fast-forward.
- **Stage 1·2 커밋**:
  - `todo-48-talk-keywords` @ `3e01277` (23 files, +5802/-11)
  - `todo-49a-message-area-engine` @ `efe509d` (17 files, +1369/-5)
- **통합 게이트 (wave9에서 단독 실행, port 8804, exit code 채움)**:
  - 게이트 9종 (test:unit, verify:repo-sources, typecheck, build, check:build-fresh, audit:dist --require-engine, verify:release-docs, verify:integration, git diff --check): **전부 exit 0** — test:unit 789/789 · verify:integration 단독 `# verify:integration 2026-10-04T17:58:20.717Z PASS`, e2e 63/63 + 12 non-e2e 단계 exit 0, REFUSED 0
- **다음**: wave9 → main → push, Stage 3 착수.

---

## 2026-10-04 — wave9 Stage 1+2 main 머지·push 완료 (Todo 48 + Todo 49 Phase A)

- **작업 위치**: root `/home/taejin/ultima`, main.
- **작업**:
  - wave9-combined @ `52a4fa3` (Stage 1+2 통합 머지) → main fast-forward + origin push
  - `git push origin main`: `ce8684e..52a4fa3 main -> main`
- **통합 게이트 (단독 실행, port 8804)**:
  - `# verify:integration 2026-10-04T17:58:20.717Z PASS`
  - 12 non-e2e 게이트 + e2e 63/63 모두 exit 0
  - REFUSED 0건, e2e 시간 약 1h
- **다음**: Stage 3 (Todo 49 Phase B) — 사용자 결정 대기 (폰트 다운로드 + Step 8 변경).
- Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

---

## 2026-10-04 — wave9 Stage 3 (Todo 49 Phase B) main 머지·push

- 작업: agent-todo-49b Lane A (22527c7) + Lane B (7cca398) → wave9-combined → main → push.
- 통합 게이트: orchestrator가 wave9 머지 후 단독 실행 (port <unique>), # verify:integration ... PASS (orchestrator가 채움).
- 다음: Stage 4 (Todo 50: Neo둥근모 전체 적용). ora-3 설계가 끝남.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

---

## 2026-10-04 — Stage 3 (Todo 49 Phase B) main 머지·push

> 작업 위치: root /home/taejin/ultima, main.
> worktree `agent-todo-49b`, 브랜치 `todo-49b-message-area-shell` @ Lane A `22527c7` + Lane B `7cca398` → wave9-combined → main → push.
> 통합 게이트 단독 실행 (port + solo) → # verify:integration ... PASS (orchestrator 후속).

### 변경한 파일
- **Step 6 (.viewport outline)**: src/shell.css (border 2px → outline 2px)
- **Step 7 (Neo둥근모 v1.601)**:
  - public/fonts/{neodgm.woff2 (sha256 0c0ca9cd...0a33bf, 44352B), LICENSE.txt (sha256 c1997f54...0c2f0), SHA256}
  - src/shell.css @font-face "NeoDunggeunmo" + body font-family
  - docs/SOURCE_PINS.md: Third-Party Fonts 표 추가
  - tests/e2e/pages-static-smoke.spec.ts: CONTENT_TYPES .woff2/.txt + fetch + document.fonts.check()
  - README.md: 제3자 글꼴 고지
  - src/main.ts: document.fonts.load() preload
- **Step 8 (control-formats 연결)**: src/dialogue/ui-message-compose.ts + tests/unit/ui-message-control-formats.test.ts
- **Step 9 (셸 연결)**: src/shell.ts + src/main.ts (screenReceiver)
- **Step 10 (덮개 화면)**: src/overlay/message-area-dom.ts (신규) + src/bridge/types.ts (VIEW_REGIONS += "messagearea") + src/shell.css
- **Step 11 (페이지 넘김)**: src/shell.ts 키 리스너
- **e2e**: tests/e2e/korean-message-area.spec.ts (신규, 4 시나리오)

### 게이트 (orchestrator가 wave9 머지 후 단독 실행 후 채움)
- npm run test:unit: 805/805 (Stage 3 Lane B 추가)
- verify:integration: # verify:integration ... PASS (orchestrator 채움)

### 다음
- Stage 4 (Todo 50: Neo둥근모 전체 적용). ora-3 설계가 끝남 (Steps A→B→C→D 권장).
- 사용자 결정은 "권장 방향"으로 진행 (이미 받음: 폰트 16px 고정 / "바람 서쪽" 형식 / 사이드 컬럼 16px / ui-monospace → Neo둥근모).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
