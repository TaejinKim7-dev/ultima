# HANDOFF
작성 시각: 2026-09-24 23:41 KST — push 완료 + Todo 21 신설 반영 (이전 버전에서 이어씀)

**이 세션의 최신 상태 요약 (아래 본문보다 이 줄을 먼저 믿을 것):**
- Step 9, Step 10(부분) 전부 `origin/main`에 push 완료(`99f45e5`, main과 origin 동기화됨, `git status -sb`로 확인).
- 사용자 지시로 **Todo 21**(`web-main.cpp`에 실제 xu4 부팅 시퀀스 이식)을 `.omo/plans/ultima-web.md`/`docs/ULTIMA_WEB_PLAN.md`/`plan.md`에 신규 추가함(byte-identical 유지, cmp 확인). 전체 단계 수 24→**25**, 진행률 **9/25 = 36.0%**.
- **Todo 21은 아직 착수 전이다** — 계획만 추가했고 구현은 안 함. 다음 세션이 바로 시작할 대상.


## 1. 목표 (What we're building)
- xu4 기반 Ultima IV를 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식한다. 진행 기준은 `/home/taejin/ultima/plan.md`(24단계).
- 이번 세션: Step 9(브라우저 시작/ZIP 검증/가상 FS) 완료+push, 이어서 **Step 10(IDBFS 영속화)을 부분 구현**(Persistence Coordinator + export/import 아카이브, e2e는 구조적 이유로 보류) — 전부 사용자 확인 거쳐 진행.

## 2. 현재 상태 (Current state)

### 2-0. 진행률
- **9 / 24 = 37.5%** (Step 10은 🟡 부분 진행이라 진행률에 안 들어감).
- **local main이 origin보다 2커밋 앞섬**(`6a74288`, `92ebce8` — Step 10 구현+merge). **push 안 함, 사용자 확인 대기.**
- Step 9까지는 `origin/main`(`695ee76`)에 이미 push 완료.

### 2-1. Step 10에서 발견한 구조적 문제와 사용자 결정 (중요, 다음 세션이 꼭 알아야 함)
- Step 10의 e2e 승인 기준("실제 새 게임 저장→reload→export/import를 브라우저에서 증명")을 만들려고 보니, **Step 9가 남긴 한계** — `scripts/web-main.cpp`의 `main()`이 여전히 placeholder(`return 0` 즉시) — 때문에 지금은 실제 게임 루프가 브라우저에서 안 돈다. `gameSave()`/캐릭터 생성/`Settings::write()`를 실제로 트리거할 방법이 없다.
- `AskUserQuestion`으로 세 옵션(① Coordinator만 먼저 / ② xu4 부팅부터 이식 / ③ 둘 다 순서대로) 제시 → **사용자가 ①을 선택**: Coordinator+export/import를 유닛 테스트로 완전히 검증하고 merge, e2e는 부팅 이식 이후로 미룸.
- **이 구조적 문제 자체는 아직 해결 안 됐다.** "web-main.cpp에 실제 xu4 부팅 시퀀스를 이식하는 게 어느 Todo에 속하는지"가 미정 — 다음 세션이 사용자와 정해야 할 가장 중요한 열린 질문. Step 10 e2e, Step 11~13, Step 17이 전부 여기에 실질적으로 막혀 있다.

### 2-2. Step 10 구현 (branch `todo-10-idbfs-persistence` → main merge `92ebce8`, 이번 세션에서 직접 실행/확인)
- `src/engine/persistence.ts`: `createPersistenceCoordinator()`(`FS.trackingDelegate.onCloseFile` 훅 1개로 모든 native 저장 write path 관찰, 마이크로태스크 디바운스로 같은 tick의 여러 close를 syncfs 1회로 합침, `idle→saving→saved/error` 상태), `packSaveArchive`/`unpackSaveArchive`(자체 최소 바이너리 포맷, 진짜 ZIP 아님), `exportSaveArchive`/`importSaveArchive`.
- `tests/unit/persistence.test.ts`: **12 tests, RED→GREEN 확인**(구현 전 "모듈 없음" RED 재현 후 구현).
- **아직 `src/shell.ts`의 save-export/save-import UI에 연결 안 함** — `startEngine()`이 FS/module 참조를 호출자에게 안 넘겨주고, 실제 세이브 데이터도 없어서 지금 연결해도 빈 아카이브만 오간다. 의도적으로 다음으로 미룸.
- `FS.trackingDelegate.onCloseFile`이 실제 wasm-release 빌드에서 진짜 발동하는지 **실물로 확인 안 함**(unit test는 fake FS만 사용) — 확인 필요.

### 2-3. 검증 (main merge 후 전부 재실행, 이번 세션에서 직접 확인)
- `npm run test:unit`: **13 files / 99 tests, exit 0**.
- `npm run typecheck`, `verify:repo-sources`, `npm run build`, `git diff --check`, `cmp .omo/plans/ultima-web.md docs/ULTIMA_WEB_PLAN.md`: 전부 exit 0.
- `ULTIMA4_DATA=... npx playwright test --project=chromium`: 기존 8개 e2e 전부 통과(무회귀). Step 10 전용 e2e는 없음(위 2-1 참고).

## 3. 변경한 파일 (Files changed)
- `src/engine/persistence.ts`, `tests/unit/persistence.test.ts` (신규) — 커밋 `6a74288` → main merge `92ebce8`.
- `plan.md`, `handoff.md`, `HANDOFF.md` — Step 10 완료(부분) 기록 — 커밋 `67c4e16`.
- `.omo/plans/ultima-web.md`, `docs/ULTIMA_WEB_PLAN.md`(Todo 21 신규, byte-identical), `plan.md`, `AGENTS.md`(진행률 산식을 "24" 하드코딩 대신 계획서 Todo 개수 참조로 변경) — 커밋 `99f45e5`.
- 전부 `origin/main`에 push 완료(`99f45e5`).

## 4. 주요 결정과 근거 (Key decisions)
- (사용자 결정, 위 2-1 참고) Step 10을 "Coordinator만 먼저"로 축소하고 e2e는 미룸.
- `FS.trackingDelegate.onCloseFile` 훅 하나로 모든 write path를 관찰하는 방식을 택함(설계 메모 1안) — write 지점마다 새 C++ 브릿지를 추가하는 2안보다 범위가 작고, "gameSave만이 아니라 모든 write path" 요구를 자연스럽게 만족.
- 세이브 아카이브를 진짜 ZIP이 아니라 자체 포맷으로 만듦 — 세이브가 고정 바이트 레이아웃이라 그대로 왕복해야 하고, Step 9의 ZIP 리더(`zip.ts`)는 읽기 전용이라 재사용 대상이 아님.
- export/import를 `shell.ts` UI에 아직 안 연결함 — 연결할 실제 FS 참조도, 실제 데이터도 없는 상태에서 배선만 만드는 건 눈에 보이는 효과가 없는 죽은 코드라 다음(부팅 이식 이후)으로 미룸.

## 5. 다음 할 일 (Next steps)
- [x] ~~`plan.md`/`handoff.md` commit~~ — 완료.
- [x] ~~Step 10 push~~ — 완료 (`origin/main`이 `99f45e5`까지 동기화됨).
- [x] ~~web-main.cpp 이식을 어느 Todo에 넣을지 판단~~ — **완료**: 사용자가 "별도 Todo로 새로 만들어"라고 지시 → **Todo 21**로 `.omo/plans/ultima-web.md`/`docs/ULTIMA_WEB_PLAN.md`/`plan.md`에 신규 추가함(전체 단계 24→25, 진행률 9/25=36.0%). Todo 21 본문(References/Acceptance/QA)은 그 파일에 있고, 자기완결적으로 작성해서 이 세션 맥락 없이도 실행 가능.
- [ ] **다음 세션 최우선**: Todo 21 착수(`git worktree add -b todo-21-boot-sequence`). 선행조건(6,8,9) 전부 완료됨.
- [ ] Todo 21 완료 후에야 Step 10 e2e(`save-reload.spec.ts`), Step 11~13, Step 17 착수가 실질적으로 의미있다.
- [ ] Todo 21 착수 전 가능한 것: Step 11~13(설계 메모 `.omo/drafts/step-11-13-korean-ui-design.md`)/16(설계 메모 `.omo/drafts/step-16-web-audio-design.md`) 중 "부팅 없이도 유닛 테스트 가능한 로직" 부분 — 착수 전에 정확한 범위를 사용자와 확인할 것.
- [ ] `FS.trackingDelegate.onCloseFile`이 실제 wasm 빌드에서 발동하는지 실물 확인(Todo 21 진행 중 자연스럽게 확인될 가능성 높음).

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- **핵심 blocker**: `web-main.cpp`의 placeholder `main()`. Step 9부터 이어진 문제이고 Step 10에서 다시 부딪힘 — 다음 세션이 반드시 먼저 다뤄야 할 항목.
- `.emsdk/`는 main worktree에만 있다 — 다른 worktree에서 wasm 빌드 시 `source /home/taejin/ultima/.emsdk/emsdk_env.sh`로 경로를 넘겨써야 한다.
- worktree `todo-07-webgl2`, `todo-08-input-queue`, `todo-09-startup-data`, `todo-10-idbfs-persistence`는 merge 후에도 삭제하지 않고 남아있다.
- main worktree의 untracked `.claude/`, `.omo/boulder.json`, `.omo/lazycodex-executor-verify/`, `.omo/start-work/`는 이번 세션도 건드리지 않았다 — 계속 보존.
- 원본 데이터: `/home/taejin/ultima4-original-data/ultima4.zip`, SHA-256 `94aa748cfa1d0e7aa2e518abebb994f3c18acf7edb78c3bd37cd0a4404e6ba74`. repo에 복사 안 함.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima
git status -sb && git log --oneline -6
npm run test:unit && npm run verify:repo-sources && npm run typecheck && npm run build
source .emsdk/emsdk_env.sh && npm run build:wasm -- --debug
ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip npx playwright test --project=chromium

# push 승인 후:
# git push origin main
```
- 공식 인계: `handoff.md` "Todo 10 main merge 완료 기록(부분)". 진행률: `plan.md`. 운영 규칙: `AGENTS.md`.
