# HANDOFF
작성 시각: 2026-09-27 15:20 KST

## 1. 목표 (What we're building)
- xu4(Ultima IV C++ 엔진)를 브라우저에서 원본 `ultima4.zip`을 직접 선택해 플레이할 수 있는 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식하고, 한국어 UI/대화/NPC 키워드를 제공한다. 진행 기준은 `/home/taejin/ultima/plan.md`(25단계).
- 이번 세션 범위: Todo 17(브라우저 통합 게임 진행 e2e)을 새로 진행해 완료. 사용자 요청으로 로컬 개발 편의 기능(자동 zip 로드)도 추가.

## 2. 현재 상태 (Current state)
- **승인 기준 18/25 = 72.0%** (Step 1~17, 21 ✅). 브랜치 `todo-17-gameplay-progression`, **main에는 아직 merge/push 안 함** (사용자 승인 대기).
- git: `git status --short --branch` 결과 위 브랜치에서 clean 대비 5개 파일 수정(`.omo/plans/ultima-web.md`, `docs/ULTIMA_WEB_PLAN.md`, `handoff.md`, `plan.md`, `vite.config.ts`) + 1개 신규 파일(`tests/e2e/gameplay-progression.spec.ts`) 미커밋. `.claude/`, `.omo/boulder.json`, `.omo/lazycodex-executor-verify/`, `.omo/start-work/`는 이 세션이 만들지 않은 기존 untracked 항목(harness/환경 관련으로 보임, 손대지 않음).
- 동작하는 것 (전부 이 세션에서 직접 실행해 확인):
  - `ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip npx playwright test tests/e2e/gameplay-progression.spec.ts --project=chromium --workers=1` → **2 passed (4.1분)**. 실제 새 게임→오버랜드 이동→마을 진입+NPC 영어/한국어 alias 대화→Ztats 상태화면→던전(Deceit) 진입→신단(Honesty) 명상→'q' 저장→3번째 세션 Journey Onward 재로드까지 전 구간 통과. 증거 17장 스크린샷 + trace.zip은 `.omo/evidence/ultima-web/task-17/`.
  - `npm run test:unit` → 260/260. `npm run typecheck` → exit 0. `npm run verify:repo-sources` → 통과. `npm run build` → exit 0. `git diff --check` → exit 0.
  - trace.zip 원본데이터 유출 직접 검사 완료(unzip -l, 파일 크기/문자열 grep) — 유출 없음 확인. `.omo/evidence/`는 `.gitignore`로 이미 전체 제외돼 있어 커밋 위험 자체가 없음(재확인함).
  - 로컬 개발 편의 기능: `npm run dev`에서 `ULTIMA4_DATA` 환경변수의 zip을 자동으로 `#rom-picker`에 주입 — Playwright로 `engineStarted: true` 확인. `npm run build`/`build:site` 산출물에서 관련 문자열 grep 0건으로 프로덕션 비유입 확인.
- 아직 안 되는 것 / 확인 필요:
  - **`npm run audit:dist`가 이미 실패 상태** — `"window.ultimaI18n"` test-hook marker가 allowlist 밖. `git stash`로 이 세션 변경분을 걷어내고 재현해 **main 기준으로도 동일하게 실패함을 직접 확인**(이 세션이 만든 문제 아님). Todo 17의 merge 게이트(AGENTS.md 공통 목록)엔 `audit:dist`가 없어 이번 커밋 범위 밖으로 남겨둠 — Todo 18이 고쳐야 할 대상.
  - Todo 18의 acceptance criteria 파일 `tests/e2e/failure-boundaries.spec.ts`는 존재하지 않음(새로 작성 필요, 아래 5절 참고).
  - `npm run preview`(정적 프리뷰, GitHub Pages와 동일 서빙 방식)에서는 자동 zip 로드가 의도적으로 동작 안 함 — 의도된 설계(실제 배포 환경과 같은 수동 선택 경험을 검증하려는 목적), 버그 아님.

## 3. 변경한 파일 (Files changed)
- `tests/e2e/gameplay-progression.spec.ts` (신규): Todo 17의 happy-path e2e(전체 루트) + failure-path e2e(alias-regression 네거티브 컨트롤).
- `vite.config.ts`: `devAutoLoadOriginalData()` Vite 플러그인 추가(사용자 요청 로컬 편의 기능, `apply: "serve"`로 프로덕션 빌드에서 구조적으로 배제).
- `plan.md`: 진행률 17→18/25, Todo 17 행 ✅ 갱신, "바로 다음 순서"를 Todo 18 중심으로 재작성, Todo 17 완료 기록 단락 추가.
- `.omo/plans/ultima-web.md` / `docs/ULTIMA_WEB_PLAN.md`: Todo 17 체크박스 `[ ]` → `[x]` (두 파일 `cmp` byte-identical 재확인 완료).
- `handoff.md`: "Todo 15 완료 확인"(이전 세션 기록 누락분 보정) + "Todo 17 완료" 절 추가(기술 결정 근거, 실제 검증 내역, 막힌 부분 전부 기록).
- `HANDOFF.md` (이 파일): 이번 절 다시 작성.

## 4. 주요 결정과 근거 (Key decisions)
- **결정론적 라우팅에 실제 xu4 cheat 메뉴를 재사용**: Todo 3/13이 이미 확립한 "Debug Mode를 실제 Configure 메뉴로 켜면 cheat 메뉴의 Goto가 RNG 없이 순간이동한다" 패턴을 던전/신단까지 확장(치트 'i' Items로 룬 지급 → 신단 입장 가능). cheat 메뉴는 `settings.debug`가 꺼져 있으면 완전히 비활성인 xu4 원본 기능이라, 이 프로젝트가 새로 추가한 cheat API가 아님 — Todo 18의 "cheat API 추가 금지" 규칙과 충돌하지 않는다.
- **"combat or dungeon"은 던전 쪽으로, "shrine/codex"는 신단 쪽으로 충족**: 전투는 오버랜드 RNG라 결정론적 e2e에 부적합하고, 코덱스는 엔드게임 콘텐츠라 새 캐릭터로 도달 불가능. Acceptance criteria의 "or"를 그대로 활용.
- **alias-regression 실패 시나리오는 wasm 재빌드 없이 실제 코드(resolveInput/buildAliasTable)를 Node에서 직접 재사용**: `src/shell.ts:548`이 이 함수의 반환값을 그대로 native에 synthesize한다는 사실을 소스로 확인했으므로, 이 값이 오염됐을 때 happy-path 캔버스 델타 비교가 어떻게 몰래 틀려지는지 증명하는 것으로 충분하다고 판단(korean-npc-alias.spec.ts의 기존 원칙 재사용).
- **로컬 편의 기능은 `apply: "serve"`로 구조적 차단**: 사용자가 "매번 파일 선택이 너무 번거롭다"고 해서 만들었지만, 저장소 정책(원본 데이터 미커밋)과 Todo 18의 "프로덕션 test-hook 금지" 규칙에 저촉되지 않도록 빌드 커맨드 자체에서 훅이 실행되지 않게 설계.

## 5. 다음 할 일 (Next steps)
- [ ] **사용자 승인 후**: `todo-17-gameplay-progression` → `main` merge, 이어서 push (AGENTS.md의 "merge/push는 멈추고 물어봐" 규칙 + 이번 세션 지시에 따라 대기 중).
- [ ] Todo 18 착수: `tests/e2e/failure-boundaries.spec.ts` 신규 작성(corrupt ZIP/oversized ZIP/missing files/stale bridge requests/save sync failure/XSS-like text — `tests/e2e/startup-data.spec.ts`와 corrupt-ZIP/missing-files 중복 여부 먼저 확인).
- [ ] Todo 18: 10분 메모리 스모크 테스트 하네스 신규 작성(현재 전혀 없음 — 새 스크립트 또는 스펙, 브라우저/버전 기록 포함).
- [ ] Todo 18: `npm run audit:dist`의 기존 `"window.ultimaI18n"` allowlist 실패를 고쳐 GREEN으로 만들기(이번 세션이 만든 문제 아님, 이전부터 있던 gap).
- [ ] Todo 18 완료 후 plan.md/계획서 두 벌 갱신 → 19/25 → Todo 19 마무리(이미 골격은 있음, main merge만 남음) → 20 → F1~F4.

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- **merge/push는 사용자 결정 대기 중** — 아직 하지 않았다.
- `npm run audit:dist`가 이미 실패 상태(main 기준도 동일, 이 세션이 격리 확인함) — Todo 18 전까지는 이게 정상 상태라고 취급해도 된다.
- Todo 3 debug-journal이 기록한 "town 내부 이동도 'Slow progress!' RNG의 영향을 받는다" 리스크가 `gameplay-progression.spec.ts`의 NPC 접근 스윕에도 그대로 있음(korean-npc-alias.spec.ts와 동일한 기존 리스크) — 재실행 시 낮은 확률로 실패할 수 있음, 새로 생긴 문제 아님.
- `progression.trace.zip`은 216MB(스크린샷/네트워크/wasm 리소스 포함) — `.omo/evidence/`가 `.gitignore`로 전체 제외돼 있어 커밋 걱정은 없지만, 로컬 디스크 공간은 차지하므로 필요 없어지면 사용자가 직접 정리해도 됨.
- `npm run preview`용으로 띄워둔 로컬 프리뷰 서버들(포트 4174~4178)은 이 세션 안에서 여러 번 껐다 켰다 했음 — 세션 종료 시 전부 같이 내려감. 계속 쓰려면 재요청 필요.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima
git status -sb && git log --oneline -5
export PATH="$HOME/.local/opt/node22/bin:$PATH"; node -v
export ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip
npx playwright test tests/e2e/gameplay-progression.spec.ts --project=chromium --workers=1   # 재확인용, 4분+ 소요
npm run dev   # 로컬 편의 기능으로 자동 zip 로드되어 바로 플레이 가능
```
- 공식 인계 기록: `handoff.md`의 가장 최근 절 "Todo 17 완료 — 브라우저 통합 게임 진행 e2e". 진행률/다음 순서: `plan.md`. 운영 규칙: `AGENTS.md`.
