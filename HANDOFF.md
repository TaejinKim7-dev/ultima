# HANDOFF
작성 시각: 2026-09-25 00:02 KST

## 1. 목표 (What we're building)
- xu4 기반 Ultima IV를 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식한다. 진행 기준은 `/home/taejin/ultima/plan.md`(현재 25단계 = Todo 1~21 + F1~F4).
- 이번 세션(마지막 부분): 사용자 요청 "지금 상황과 조건을 확인하고 앞으로의 plan을 다시 구상해"에 따라 **현황 조사 → 재계획 → 문서 반영 → 정리 작업(worktree 정리, Node 22 전환)**.

## 2. 현재 상태 (Current state)
- **승인 기준 진행률 9/25 = 36.0%** (Step 1~9 ✅, Step 10 🟡). **실제 게임에서 확인된 브라우저 엔진 기능: 0개.**
- **가장 중요한 사실**: 지금 `build/wasm-release/xu4.wasm`에는 게임 엔진 코드가 없다. `llvm-nm --defined-only` 결과 정의 함수 약 251개, 전부 libc/libc++ + 브릿지 export 2개. wasm 빌드가 소스 74개 중 29개만 컴파일하고 `main()`이 비어 있어 링커가 엔진을 전부 제거했다. Step 6~9의 ✅는 "각 승인 기준 통과"일 뿐 실제 엔진이 브라우저에서 돈 적은 없다 → 사용자 결정으로 ✅는 유지하고 `plan.md`에 "실제 게임에서 확인" 열을 추가해 분리 표시함.
- Todo 21 본문을 **다시 썼다**: "실제 xu4 엔진을 wasm에 링크·실행" — 네이티브 `vendor/xu4/src/Makefile.common` 소스 목록(UI=glfw, CONF=boron) + 실제 `xu4.cpp`, 가짜 `web-stub.cpp`/`web-main.cpp` 제거, 무음 `sound.h` 구현만 신규. 세부 21.1(링크) → 21.2(FS/경로) → 21.3(타이틀 렌더) → 21.4(실제 입력). 이전 본문("web-stub을 통해 부팅")은 틀린 방향이었다 — 그 stub들은 실제 헤더에 없는 이름이거나 링크(C/C++)가 안 맞는다.
- 조사로 확인한 21.x 작업거리(각각 확인한 근거는 `handoff.md` "2026-09-24 재계획 기록"): `-DVERSION` 따옴표 버그(도달 시 크래시), 모듈 파일이 wasm FS에 안 들어감, `ultima4.zip` 탐색 경로(`.`/`u4`) 불일치, `Settings` user path와 IDBFS 마운트 불일치 가능성(확인 필요), `Module.canvas` 바인딩, GLFW 포트와 `main.ts` 입력 이중 전달 가능성.
- Todo 19(Pages workflow)의 **골격**은 엔진과 독립이라 Todo 21과 병렬 착수 가능으로 계획에 반영(완료 판정은 기존 선행조건 유지).
- 정리 완료: merge된 worktree 8개 제거(브랜치 유지, 증거는 main `.omo/evidence/`로 먼저 복사), Node 22 LTS v22.23.3 사용자 홈 설치·PATH 전환(Node 22에서 유닛 13 files/99 tests, typecheck, build, verify, e2e 8개 전부 exit 0, EBADENGINE 경고 없음).

## 3. 변경한 파일 (Files changed)
- `.omo/plans/ultima-web.md`, `docs/ULTIMA_WEB_PLAN.md` — Todo 21 본문 재작성 + 21.1~21.4, 의존성 표의 21 행 갱신(16도 막음, 19 골격과 병렬), Todo 19 병렬 착수 메모. `cmp` byte-identical 확인.
- `plan.md` — 재계획 요약, 2단계 상태 표(승인 기준 / 실제 게임에서 확인), Todo 21 세부 단계, 새 "바로 다음 순서", 위험 갱신. 기존 완료 기록은 "완료 기록 (시간순)" 섹션에 그대로 보존.
- `handoff.md` — "2026-09-24 재계획 기록" 섹션 추가, "남은 작업" 갱신.
- `.nvmrc` (신규, `22`) — 저장소 차원 Node 버전 명시(나중에 CI setup-node용).
- `HANDOFF.md`(이 파일).
- 저장소 밖: `~/.local/opt/node-v22.23.3-linux-x64`(+`node22` 링크), `~/.profile`·`~/.bashrc` 끝에 PATH 블록.
- 이 커밋 전까지 위 저장소 파일들은 미커밋 상태 — 이 HANDOFF.md와 함께 커밋 예정.

## 4. 주요 결정과 근거 (Key decisions)
- ✅를 내리지 않고 2단계 표시로 분리(사용자 결정) — 각 단계의 승인 기준은 실제로 통과했으므로 사실이고, 다만 "실제 게임에서 돈다"와는 다르다는 걸 표에서 바로 보이게 함.
- Todo 21을 "새 부팅 코드를 손으로 작성"이 아니라 "네이티브와 같은 소스·같은 `main`을 emcc로 빌드"로 방향 전환 — native가 이미 원본 데이터로 완전히 돌고(Step 3), Asyncify + Step 8의 per-frame yield 덕에 blocking loop를 그대로 쓸 수 있을 가능성이 높아서. 규모는 21.1의 첫 링크 결과로 확정한다.
- Node는 sudo가 필요한 시스템 교체 대신 사용자 홈 설치 + PATH — 되돌리기 쉽고 시스템 node를 건드리지 않음.
- worktree 삭제 전 증거 로그를 main으로 복사 — `.omo/evidence/`는 git에 없어서 worktree와 함께 사라질 수 있었음.

## 5. 다음 할 일 (Next steps)
- [ ] 이번 문서 변경(`.omo/plans/ultima-web.md`, `docs/ULTIMA_WEB_PLAN.md`, `plan.md`, `handoff.md`, `.nvmrc`, `HANDOFF.md`) 커밋 + push.
- [ ] **Todo 21.1 착수** (크리티컬 패스): `git worktree add -b todo-21-real-engine /home/taejin/ultima-worktrees/todo-21-real-engine main` → `scripts/build-wasm.mjs`의 소스 목록을 `Makefile.common` 기준으로 교체, 실제 `xu4.cpp` 사용, 무음 sound 구현 추가, `VERSION` 수정 → `npm run build:wasm -- --debug`의 미정의 심볼 목록을 작업 목록으로 삼는다.
- [ ] 병렬 가능: Todo 19 workflow 골격.
- [ ] 21.4 이후 Step 7/8 실제 엔진 재검증, Step 10 e2e(`save-reload.spec.ts`).
- [ ] 그 뒤 11~13 → 16 → 14 → 15 → 17 → 18 → 19 완료 → 20 → F1~F4.

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- **Todo 21의 실제 규모는 아직 모른다** — 21.1 첫 링크 전까지는 추정일 뿐이다.
- `gpu_opengl.cpp`·`discourse_tlk.cpp`·`discourse_castle.cpp`·`config_data.cpp`는 다른 파일이 `#include`하므로 소스 목록에 따로 넣으면 중복 정의가 난다.
- 로그인 셸이 아닌 환경에선 `/usr/bin/node`(v20)가 먼저 잡힐 수 있다 — `export PATH="$HOME/.local/opt/node22/bin:$PATH"`. wasm 빌드 시 `source /home/taejin/ultima/.emsdk/emsdk_env.sh`는 emsdk 자체 Node 22.16을 PATH 앞에 둔다(둘 다 22라 문제 없음).
- `.emsdk/`(1.7GB)는 main worktree에만 있다 — 새 worktree에서 wasm 빌드 시 위 경로로 source.
- 새 worktree는 `build/`가 비어 있다 — `npm ci && npm run deps:host && npm run build:modules && npm run deps:wasm && npm run build:wasm -- --debug` 필요.
- main worktree의 untracked `.claude/`, `.omo/boulder.json`, `.omo/lazycodex-executor-verify/`, `.omo/start-work/`는 건드리지 않는다.
- 제거한 worktree들의 브랜치(`todo-01`~`todo-10`)는 그대로 남아 있다 — 삭제 여부는 사용자 판단.
- 원본 데이터: `/home/taejin/ultima4-original-data/ultima4.zip`, SHA-256 `94aa748cfa1d0e7aa2e518abebb994f3c18acf7edb78c3bd37cd0a4404e6ba74`. repo에 복사 안 함.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima
export PATH="$HOME/.local/opt/node22/bin:$PATH"; node -v   # v22.23.3
git status -sb && git log --oneline -6
npm ci && npm run test:unit && npm run verify:repo-sources && npm run typecheck && npm run build
source .emsdk/emsdk_env.sh && npm run build:wasm -- --debug
.emsdk/upstream/bin/llvm-nm --defined-only build/wasm-release/xu4.wasm | wc -l   # 지금 ~251 (엔진 없음); 21.1 후 크게 늘어야 함
ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip npx playwright test --project=chromium
```
- 공식 인계: `handoff.md` "2026-09-24 재계획 기록". 진행률/순서: `plan.md`. Todo 21 전문: `.omo/plans/ultima-web.md`. 운영 규칙: `AGENTS.md`.
