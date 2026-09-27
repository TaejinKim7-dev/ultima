# HANDOFF
작성 시각: 2026-09-27 21:04 KST

## 1. 목표 (What we're building)
- xu4(Ultima IV)를 원본 `ultima4.zip`을 사용자가 직접 선택하는 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식 + 한국어화. 진행 기준 `plan.md`(25단계).
- 최종 목표는 **한국어로 실제 플레이하는 웹 기반 울티마 4**. 실제 NPC 응답이 한국어여야 하는데 아직 영어 — 출시 차단(아래 6절, `.omo/drafts/korean-output-gap-design.md`).
- 이번 세션: Todo 18 완료·merge·push(19/25) → Todo 19 진행 중, 병렬로 Todo 20 검증기 준비 + 한국어 출력 gap 조사.

## 2. 현재 상태 (Current state)
- 진행률 **20/26 = 76.9%** (Todo 22 추가로 분모 26). main `703919a`까지 origin 동기. Pages 실제 배포 확인 완료(run `36316708881`).
- **Todo 22 진행 중 (branch `todo-22-korean-npc-output`, 미커밋 작업 + Fork A merge `39730db`)**:
  - 설계: 웹 빌드에서만 `runTalkDialogue`의 모든 출력을 `talkMessage()`로 가로채 EM_JS `Module.u4Text.talk(format, a0, a1)`로 보냄. TLK를 가리키는 인자/응답은 `@MAP:npcIndex:field` id로만 보내므로 영어 TLK 원문은 엔진 밖으로 안 나감. 틀 문장은 xu4 코드 리터럴 그대로 → JS가 `resolveTalkTemplateId`로 id 찾고 `resolveDisplayText`로 한국어. 플레이어 입력은 `u4Text.input` → "> health".
  - `Discourse`에 `webTlkName`(웹 전용, "moonglow.tlk"→"MOONGLOW"), `TalkState`에 web 필드. Boron 대화는 `webStrings=NULL`로 비활성. `discourse_castle.cpp`용으로 `message` 매크로를 `screenMessage`로 복원.
  - 확인(직접 실행): e2e RED `korean-npc-output.spec.ts` exit 1(패널에 Calabrini look/health/name 한국어 0건, `task-22/e2e-red.log`, `panel-observation.log`); unit `talk-compose` RED(모듈 없음)→9/9, `startup-sequence` Todo 22 RED 1 failed→11/11; `g++`/`em++ -fsyntax-only` discourse.cpp 0; `verify:repo-sources` 0(xu4 treeSha256 `5a864e41…5e88`); `npm run build:wasm` 0, `wasm-symbols` 8/8; `npm run build` 0; typecheck 0.
  - Fork A(`39730db`, merge됨): `discourse_tlk.cpp` 틀 문장 18개 inventory+번역(`ui:discourse_tlk:0..17`), `GENERATED_TALK_TEMPLATES`, `resolveTalkTemplateId`, i18n:check --strict 0(4429 entries, fork 보고).
  - **진행 중(결과 미확인)**: e2e GREEN 실행(port 4288, `task-22/e2e-green.log`).
- **Todo 20 초안 (Fork B)**: worktree `.claude/worktrees/agent-ac0eaf00f74c3c95a`, branch `todo-20-release-docs-draft` (`dcaeebc` verifier cherry-pick, `53adc2d` 문서). README/docs/WEB_PORT.md/docs/GITHUB_PAGES.md 작성, `verify:release-docs` 0, unit 300/300(fork 보고). handoff.md는 검사 대상에서 제외(역사 기록). 미확인: fresh-clone QA, emsdk 설치 명령 실행. Todo 22 완료 후 한계 절 갱신 필요.

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
- [x] 실제 배포 확인: run `36316708881` deploy=success, 라이브 사이트에서 실제 엔진 부팅(handoff.md 20:49 기록).
- [ ] **Todo 22** (다음 단계, 진행률 20/26): `.omo/drafts/korean-output-gap-design.md` §5~6대로. RED e2e `tests/e2e/korean-npc-output.spec.ts` 먼저.
- [ ] Todo 20: `todo-20-release-docs`(`6a336df`) rebase 후 문서 작성.
- [ ] F1~F4.

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
