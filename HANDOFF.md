# HANDOFF
작성 시각: 2026-09-29 (사용자 지시로 진행 중단 시점)

## 1. 목표 (What we're building)
- xu4(Ultima IV)를 원본 `ultima4.zip`을 사용자가 직접 선택하는 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식하고 한국어로 실제 플레이 가능하게 한다. 진행 기준은 `plan.md`(분모 31 = Todo 1~27 + F1~F4).
- 이번 세션 범위: Todo 23~27(한국어 표시 확장)을 병렬 구현·리뷰·merge.

## 2. 현재 상태 (Current state)
- 진행률 **23/31 (74.2%)**. ✅는 Todo 1~23.
- **main 로컬 HEAD `391db3a`**(문서 커밋) ← `c4cdbf5`(Todo 25 merge). **origin/main은 `dc5764d`**: Todo 24(`8c4edbb`)·26(`dc5764d`)는 push됨, **Todo 25 merge와 이 문서 커밋은 미push**.
- Todo 24·25·26: 코드는 main에 merge됐지만 계획의 "전체 e2e 스위트" 통합 확인 전이라 **✅ 보류**.
- main(`c4cdbf5`) 통합 게이트는 이번 세션에서 직접 실행해 전부 exit 0: build:wasm, test:unit, verify:repo-sources, typecheck, build, build:site, audit:dist --require-engine, git diff --check (`.omo/evidence/ultima-web/integration/gates.log`). **전체 e2e는 시작 직후 중단 — 미실행.**
- Todo 27(`todo-27-korean-status` `8023dce`, worktree `.claude/worktrees/todo-27-status`): 구현 커밋 4개 + main merge까지 있으나 main 합류 후 wasm 재빌드·게이트·e2e·리뷰 **미완료**(에이전트를 중단시킴). 에이전트 보고 게이트는 merge 이전 트리 기준이라 **확인 필요**.
- 개별 e2e 증거(직접 확인): Todo 23 전체 41/41(27.2분, 23 시점), merged main의 castle+game-messages+npc-output 3/3(8.8분). Todo 25·26 e2e 통과는 에이전트 보고(직접 재실행 안 함).

## 3. 변경한 파일 (Files changed)
- Todo 23: `vendor/xu4/src/screen.cpp`(screenMessage 웹 훅, format FNV-1a 해시+사전 포맷 인자 전송), `vendor/xu4/src/web_hash.h`, `scripts/lib/ui-templates.mjs`, `src/dialogue/ui-message-compose.ts`, `src/shell.ts`·`src/engine/startup.ts`·`src/i18n/localization.ts`(수신기), shrine.cpp 18건 번역(`locales/ko/ui.json`), 생성 테이블.
- Todo 24(에이전트): castle/codex id 채널(`web_talk.h`, `discourse_castle.cpp`, `codex.cpp`), `cpp-strings.mjs` 옵션, 46건 번역.
- Todo 26(에이전트): `src/overlay/intro-view.ts`, `intro.cpp`/`menu.cpp`/`menuitem.*` 웹 훅(`__EMSCRIPTEN__` 한정), 인트로 번역.
- Todo 25(에이전트): `script_boron.cpp` `web-say`, `vendors.b`, `src/dialogue/vendor-compose.ts`, `scripts/lib/vendor-templates.mjs`.
- 문서: `plan.md`(중단 기록·재개 순서), `handoff.md`(중단 기록), 계획서 두 벌(23 체크 `[x]`, cmp 일치).
- 메인 체크아웃 `/home/taejin/ultima`(branch `f3-real-browser-qa`)에는 이 세션과 무관한 미커밋 `HANDOFF.md`/`handoff.md`/`playwright.config.ts`(F3 브라우저 QA 작업)가 있음 — 건드리지 않았음.

## 4. 주요 결정과 근거 (Key decisions)
- 계획의 "format 리터럴 전송" 대신 **format 해시만 전송**(castle/codex가 AVATAR.EXE 원문을 format으로 넘기므로 유출 방지). 미매핑 해시는 JS가 조용히 폐기(console 출력 없음). 상점 미번역 템플릿도 같은 정책(영어 fallback 아님) — 계획 대비 의도적 편차, handoff.md 기록됨.
- 병렬: 24/26은 기존 worktree 재개, 25/27은 선행 브랜치 위 새 worktree. 읽기 전용 리뷰 에이전트(superpowers:requesting-code-review)로 24/25/26 검토 → 26 네이티브 `#ifdef`·오버레이 안전장치, 25 억제 플래그·ㄹ받침·중복 기호 수정 반영.
- 24·25·26 ✅ 보류: 계획 acceptance의 전체 e2e를 통합 상태에서 1회 확인하기로 함(개별 spec만으로 ✅ 처리하지 않음).
- 충돌 파일(`strings.ts`, `u4_i18n_table.inc`, manifest 해시)은 손 병합 대신 재생성.

## 5. 다음 할 일 (Next steps)
- [ ] `git push origin main` (Todo 25 merge + 문서 커밋; 사용자는 이번 세션 push 승인 완료).
- [ ] main에서 전체 e2e 1회: `ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip PLAYWRIGHT_PORT=4405 npx playwright test --project=chromium --workers=1` (다른 e2e 동시 실행 금지, 약 30분). 통과 시 24·25·26 ✅ → 26/31, 계획서 두 벌 `[x]`+cmp, handoff.md 게이트 기록. 타이밍 flake는 해당 spec 단독 재실행.
- [ ] Todo 27 재개: worktree에서 `build:wasm`→게이트→e2e(`PLAYWRIGHT_PORT=4427`)→코드 리뷰→main merge→27/31.
- [ ] 미처리 리뷰 항목: 24 C++ 채널 동작 테스트·영어 부재 negative assert; 25 실제 construct throw 재현 테스트·무기/방어구/시약/여관 e2e; 26 About·집시 화면 시각 검증.
- [ ] F1~F4 (F3: WebKit은 사용자가 `sudo npx playwright install-deps webkit` 필요; 메인 체크아웃의 f3 브랜치 작업 참고).

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- Pages Source 설정은 사용자만 가능.
- e2e는 CPU 타이밍에 민감(NPC 접근 sweep) — 동시 실행 자제, 포트 분리 필수(`PLAYWRIGHT_PORT`).
- `npm run i18n:inventory`는 `locales/ko/module.json`의 `% s` 수동 수정을 되돌림 → 실행 후 `git checkout locales/ko/module.json`.
- vendor 수정 시 `vendor/source-manifest.json`의 xu4 `treeSha256`/`fileCount`(현재 412)를 같은 커밋에서 `summarizeSourceTree`로 재계산.
- `main`은 이 worktree(`.claude/worktrees/agent-ad52af6bd293aab90`)에 체크아웃되어 있음 — 다른 곳에서 main 체크아웃 불가.
- 에이전트 성공 보고는 diff/게이트로 재확인할 것(25·26·27은 재확인 안 됨).

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima/.claude/worktrees/agent-ad52af6bd293aab90   # main 체크아웃
export PATH="$HOME/.local/opt/node22/bin:$PATH"
export ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip
source .emsdk/emsdk_env.sh
git status -sb && git push origin main
npm run build:wasm && npm run test:unit && npm run verify:repo-sources && npm run typecheck && npm run build && npm run build:site -- --base=/ultima/ && npm run audit:dist -- --require-engine && git diff --check
PLAYWRIGHT_PORT=4405 npx playwright test --project=chromium --workers=1
```
- 상세: `plan.md` "⏸ 중단 기록", `handoff.md` 말미 "세션 중단 기록", 증거 `.omo/evidence/ultima-web/{task-23..27,integration}/`.
