# HANDOFF
작성 시각: 2026-09-26 04:45 KST — Todo 12(status/menu DOM overlay) 완료, branch `todo-12-status-overlay`

## 1. 목표 (What we're building)
- xu4 기반 Ultima IV를 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식한다. 진행 기준은 `/home/taejin/ultima/plan.md`(25단계 = Todo 1~21 + F1~F4).
- 이번 세션의 범위: `.omo/plans/ultima-web.md` Todo 12 하나("status, menu, and short in-game text as DOM overlays") — Wave 3(11~15, 한국어화)의 두 번째 단계.

## 2. 현재 상태 (Current state)
- **작업 위치**: `/home/taejin/ultima/.claude/worktrees/agent-a6c1b05c1afa82520` (git worktree), branch `todo-12-status-overlay` (base: main `df2b92b`, Todo 11/19 이미 merge된 시점).
- **Todo 12 완료, main에는 아직 merge/push 안 함.** 상세 RED/GREEN 로그, advisor 리뷰 반영 내역, 게이트 결과는 `handoff.md`의 "Todo 12 완료 기록" 섹션(파일 맨 끝)에 있음 — 이 파일은 그 요약이다.
- 만든 것: `src/overlay/overlay-layout.ts`(신규, DOM-free 순수 모듈 — logical rect/CSS px 변환, DPR snap, letterbox-safe content rect, `OverlayRegistry`), `src/bridge/types.ts`의 `ViewBridgeEvent`에 `rows`/`selectedIndex` 필드 추가(ABI v1 additive), `src/shell.ts`/`index.html`/`src/shell.css`에서 옛 전체-뷰포트 `#status-overlay`를 role별(`status`/`menu`/`textview`) DOM 오버레이(`#overlay-layer` + `[data-role]`)로 교체.
- 전체 로컬 게이트(`npm ci`/`test:unit` 17 files·171 tests/`verify:repo-sources`/`typecheck`/`build`/`git diff --check`/`cmp` plan docs) + Todo 12 전용 명령(`overlay-layout.test.ts` 27/27, `status-overlay.spec.ts` 5/5 @ 1x/2x/1.5x-DPR) 전부 이 세션에서 직접 실행해 exit 0 확인.
- 추가로(acceptance criteria엔 없지만 DOM 구조를 바꿨으므로) 실제 `ultima4.zip`으로 `boot-sequence.spec.ts`+`startup-data.spec.ts` 7/7 재확인 — 회귀 없음.
- `plan.md`/`.omo/plans/ultima-web.md`/`docs/ULTIMA_WEB_PLAN.md`를 13/25(52.0%)로 갱신, Todo 12 체크박스 `[x]`, `cmp`로 두 계획서 byte-identical 재확인.
- **main에는 여전히 merge/push 안 됨** — 조정 세션이 diff 리뷰 + 게이트 재실행 후 병합해야 함(이 세션에 그 권한/지시 없음).
- Todo 16(Web Audio)의 현재 상태는 이 세션에서 확인하지 않음 — **확인 필요**(이전 HANDOFF 기록엔 "백그라운드 에이전트가 진행 중"이라고 돼 있었으나 그 이후 상황은 모름).

## 3. 변경한 파일 (커밋 완료, branch `todo-12-status-overlay`)
- `src/overlay/overlay-layout.ts` (신규) — 순수 오버레이 registry + DPR/letterbox 레이아웃 수학.
- `src/bridge/types.ts` — `ViewBridgeEvent.rows`/`.selectedIndex` 추가(additive), `isBridgeEvent` 검증 로직 확장.
- `src/shell.ts` — `#overlay-layer` 기반 role별 DOM 오버레이 생성/배치/제거, `view`/`clear` 이벤트 배선, `ResizeObserver`.
- `index.html`, `src/shell.css` — `#status-overlay` → `#overlay-layer`, `.viewport{min-width:640px}`, `.overlay-role`/`.overlay-rows` 스타일.
- `tests/unit/overlay-layout.test.ts` (신규, 27 tests), `tests/unit/bridge-contract.test.ts`(+2 tests), `tests/e2e/status-overlay.spec.ts` (신규, 5 tests).
- `plan.md`, `.omo/plans/ultima-web.md`, `docs/ULTIMA_WEB_PLAN.md`, `handoff.md` — 진행 기록.
- 커밋 순서(전부 push 안 됨): `71f91d3`(RED 순수 모듈) → `996ecd0`(RED bridge rows/selectedIndex) → `7af4564`(GREEN 순수 모듈+ABI) → `37c8e3d`(RED e2e) → `2f081a8`(GREEN DOM 배선) → `8938b9a`(plan 문서 갱신) → `0ce6bc7`(handoff.md 기록).

## 4. 주요 결정과 근거 (Key decisions)
- **status 기본 rect는 title/summary를 뺀 `mainArea`만 사용**((192,8,120,64), `stats.cpp:28`) — summary 줄(y:80~88)엔 raster로만 그려지는 아바타 아우라 glyph(248,80,8,8)가 있어서, mainArea만 쓰면 자동으로 안 겹친다(별도 "구멍 뚫기" 로직 불필요). 계획 문구의 "title/summary를 따른다"는 이 rect가 그 배치를 침범하지 않는다는 뜻으로 해석.
- **DPR은 위치 계산(스케일)에 넣지 않고, 계산된 CSS px 값을 1/dpr 격자에 스냅하는 데만 쓴다** — `getBoundingClientRect()`/CSS px는 이미 DPR 독립적이라, 스케일 계산에 dpr을 또 곱하면 이중 적용 버그가 된다. 폭이 아니라 **두 edge(좌/우, 상/하)를 독립적으로 스냅**한 뒤 폭을 역산 — 그렇지 않으면 인접한 사각형 사이에 스케일 값에 따라 1px 틈/겹침이 생길 수 있다.
- **object-fit 확인 후 pillarbox 계산은 만들지 않기로 결정**: `<canvas>`의 CSS 기본값은 `object-fit: fill`이고 현재 CSS에 별도 지정이 없다 — 즉 letterbox 검은 띠가 실제로 생기지 않는다(캔버스 자기 박스를 꽉 채워 늘어남). 그 대신 border 4px가 `aspect-ratio` 계산에 안 들어가서 실제 canvas box가 정확히 16:10이 아닐 수 있다는 걸 X/Y 스케일을 **독립 계산**하는 것으로 흡수했다(`computeScale`).
- **`menu`/`textview` 두 기본 rect(intro.cpp의 `menuArea`/`extendedMenuArea`)는 실제로 서로 겹친다** — 버그가 아니라 같은 intro 화면의 교대 상태(옵션 메뉴 ↔ 설정 서브메뉴)라서 동시에 안 보인다. "안 겹침" 단언은 실제로 동시에 보일 수 있는 (status,menu)/(status,textview) 쌍에만 적용했고, (menu,textview)는 "겹침, 의도된 것"이라고 명시적으로 테스트해뒀다.
- **Korean 값 정렬은 CSS grid(`auto max-content`)로, 고정폭 monospace 계산으로 하지 않는다** — `ViewBridgeEvent.rows`(label/value)를 추가한 이유. 값 컬럼 우측 정렬이 라벨 길이와 무관하게 항상 맞는다.
- 실제 엔진은 여전히 status/menu용 C++→JS bridge 이벤트를 하나도 안 보낸다(Todo 11 때와 동일 결론, 이번 세션에 `vendor/xu4/src`+`scripts/` 전체를 다시 grep해서 재확인) — 그래서 e2e도 synthetic `window.ultimaBridge.dispatch(...)`로 검증했다.

## 5. 다음 할 일 (Next steps)
- [ ] **가장 먼저**: 조정 세션이 이 브랜치(`todo-12-status-overlay`)의 diff를 리뷰하고 게이트를 직접 재실행한 뒤 main에 merge(이 세션은 merge/push를 하지 않았다 — 지시받은 범위 밖).
- [ ] Todo 16(Web Audio) 상태 확인 — 이전에 백그라운드로 진행 중이었는데 이 세션에서 확인 안 함.
- [ ] **Todo 13**(한국어 NPC alias + prompt별 입력 규칙)으로 진행 — `.omo/drafts/step-11-13-korean-ui-design.md` 참고. Todo 12가 세운 `OverlayRegistry`/`OverlayRow` 패턴과는 직접 연관 없고, 오히려 Todo 8의 입력 큐(`src/bridge/input-queue.ts`)와 `PromptBridgeEvent` 쪽을 확장하는 작업이다.
- [ ] (여유 있으면) `save-reload.spec.ts`를 이 브랜치 변경 이후 한 번 더 실제 엔진으로 돌려서 완전히 확인 — 이번 세션엔 sandbox의 `timeout 300`에 걸려 생략했다(코드상 무관하다고 판단했으나 실측은 아님, `handoff.md` 참고).
- [ ] 이후 순서(plan.md 기준): 14 → 15(번역 corpus) → 17 → 18 → 19 최종 acceptance → 20 → F1~F4.

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- **이 sandbox(WSL2)에서 `playwright test --project=chromium`을 `--workers=3` 이상(또는 기본 병렬도)으로 돌리면 `headless_shell`이 간헐적으로 segfault한다**(`dmesg`로 `signal: 11` 확인됨) — 공유 `vite preview` webServer가 죽어서 이후 테스트가 전부 `ERR_CONNECTION_REFUSED`로 실패한다. **`--workers=1` 또는 `--workers=2`로 돌리면 재현 안 됨**(이 세션에서 각각 반복 확인). 코드 문제가 아니라 sandbox 리소스 이슈로 보인다 — 다음 세션에서 e2e가 갑자기 다 실패하면 이것부터 의심할 것.
- **`ULTIMA4_DATA`로 실제 엔진 e2e를 돌리면 느리다** — 특히 `save-reload.spec.ts`(캐릭터 생성 최대 20라운드, 라운드마다 최소 1.5~2.5초 간격 필요)는 전체 스위트를 순서대로 돌리면 5분(`timeout 300`)을 넘길 수 있다. 개별 파일 단위로 나눠 돌릴 것.
- **`build/wasm-release`는 git-ignored라 새 worktree엔 없다** — 이 세션은 main 체크아웃(`/home/taejin/ultima/build/wasm-release`)에서 원본 데이터(zip/sav/tlk/ega/map/exe) 없음을 `find`로 먼저 확인한 뒤 그대로 복사해서 썼다(Todo 19 세션이 했던 것과 동일 방법). 완전히 새로 빌드하려면 `npm run deps:wasm && source /home/taejin/ultima/.emsdk/emsdk_env.sh && npm run build:wasm -- --debug`.
- Node 22 PATH: 시스템 기본은 v20이라 매 bash 호출마다 `export PATH="$HOME/.local/opt/node22/bin:$PATH"`가 필요하다(셸 상태가 호출 간 유지 안 됨).
- 원본 데이터: `/home/taejin/ultima4-original-data/ultima4.zip`. repo에 절대 복사/커밋하지 않는다.
- `textview` role의 기본 rect(`intro.cpp`의 `extendedMenuArea`)는 "일반 textview"를 대표하는 유일한 native 상수가 아니라 그나마 가장 가까운 기존 값을 빌려온 것 — 실제 사용처가 나중에 나오면(Todo 14/17 근처) 재검토가 필요할 수 있다.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima/.claude/worktrees/agent-a6c1b05c1afa82520   # 이 worktree, branch todo-12-status-overlay
export PATH="$HOME/.local/opt/node22/bin:$PATH"; node -v            # v22.23.3이어야 함
git log --oneline -8
npm ci
npm run test:unit                                    # 17 files / 171 tests
npm run verify:repo-sources && npm run typecheck && npm run build
git diff --check
cmp .omo/plans/ultima-web.md docs/ULTIMA_WEB_PLAN.md
npm run test:unit -- tests/unit/overlay-layout.test.ts        # Todo 12 acceptance #1
npm run test:e2e -- tests/e2e/status-overlay.spec.ts --project=chromium  # Todo 12 acceptance #2 (playwright test는 --workers=1이나 2로)
# 실제 엔진 회귀 확인(선택):
ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip \
  npx playwright test tests/e2e/boot-sequence.spec.ts tests/e2e/startup-data.spec.ts --project=chromium --workers=1
```
- 공식 인계: `handoff.md`의 "Todo 12 완료 기록" 섹션(파일 맨 끝). 진행률/순서: `plan.md`. 운영 규칙: `AGENTS.md`.
