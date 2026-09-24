# Ultima IV 웹 한글판 — 진행 계획
기준 시각: 2026-09-24 KST · 기준 main: `695ee76` (origin과 동기화됨, push 완료)

## 목표
원본 `ultima4.zip`을 사용자가 브라우저에서 직접 선택해 플레이하는, 한국어 UI/대화/NPC 키워드 alias와
실제 음악·효과음을 갖춘 Ultima IV(xu4 엔진)를 GitHub Pages(`https://taejinkim7-dev.github.io/ultima/`)
정적 사이트로 배포한다. 원본 게임 데이터는 절대 배포/커밋하지 않는다.

## 진행률 계산법
- 전체 24단계 = 구현 1~20 + 최종 검증 F1~F4. 단계마다 가중치 동일.
- 진행률 = 완료(✅) 단계 수 ÷ 24. 부분 진행(🟡)은 0으로 계산한다(완료 기준을 통과해야만 1).
- 완료 기준 = 해당 단계의 acceptance criteria 통과 + `main` merge 전 로컬 검증 게이트 통과(AGENTS.md).
- 세부 정의(References/Acceptance/QA)는 `.omo/plans/ultima-web.md`의 같은 번호 항목이 원본이다.

## 현재 진행률: 9 / 24 = 37.5%
(Step 1~9 완료. Step 6 main `c836ecc`, Step 7 main `874c775`, Step 8 main `6b97d8e`, Step 9 main `5c28511` — 모두 2026-09-24 merge 게이트 통과. `git push origin main` 완료(`695ee76`, 사용자 승인 2026-09-24).)

## 단계 목록

### Wave 1 — 기반 (1~5)
| # | 단계 | 상태 | 비고 |
|---|---|---|---|
| 1 | 소스 동결 + 웹 test harness | ✅ | main `36a128e` |
| 2 | host Boron 빌드 + xu4 모듈 패키징 | ✅ | main `f84b5f5` |
| 3 | native GLFW 기준선(원본 데이터로 실제 플레이) | ✅ | main `13a3969` |
| 4 | 영어 원문 inventory + 한국어 스키마 | ✅ | main `ada0a6d` (4411 entries, 4402 pending) |
| 5 | 브라우저 셸 + bridge ABI v1 + Pages 자산 계약 | ✅ | main `0a1408a` |

Step 3 완료 (2026-09-24):
- 3.1 ✅ native 빌드, missing/corrupt ZIP CTest, 잘못된 ZIP hash 차단, 새 게임→이동→save→재시작/load 자동 QA
- 3.2 ✅ NPC 접근: 매 스텝 4방향 talk sweep + Backspace 16회 clear 가드, 6×Right→Calabrini 대화 완주
- 3.3 ✅ `e` 직후·talk sweep 직후 CHECKPOINT(Enter towne!/You meet) 로그, greeting 없으면 실행 폐기
- 3.4 ✅ name/health/bye 키워드 응답 스크린샷 확보, save+reload 검증
- 3.5 ✅ main(Todo 4/5 4커밋) 병합 + 충돌 해결(pacakge.json/handoff.md/계획서)
- 3.6 ✅ clean 전체 게이트 재실행(rm -rf build 후 전체 파이프라인) + handoff 기록 + 체크박스 동기화

### Wave 2 — WASM 이식 (6~10)
| # | 단계 | 상태 | 선행 |
|---|---|---|---|
| 6 | 단일 스레드 wasm Boron + xu4 core 빌드 (Emscripten 4.0.23, Asyncify) | ✅ | main `c836ecc` (`26f7164`) |
| 7 | OpenGL → WebGL2 (glMapBufferRange 제거, CPU staging + glBufferSubData) | ✅ | main `874c775` (`90232b9`) |
| 8 | blocking event loop / 키 입력 → 브라우저 안전 queue (IME, request ID) | ✅ | main `6b97d8e` (`af13814`) |
| 9 | 브라우저 시작 시퀀스 + 원본 ZIP 검증 + 가상 FS, main 1회 실행 | ✅ | main `5c28511` (`4c878c9`) |
| 10 | IDBFS 세이브/설정 영속 + export/import | ⬜ | 9 |

### Wave 3 — 한국어화 (11~15)
| # | 단계 | 상태 | 선행 |
|---|---|---|---|
| 11 | 긴 메시지 → 하단 HTML 대화 패널 (textContent만) | ⬜ | 5,9 |
| 12 | status/menu → DOM overlay (DPR/letterbox) | ⬜ | 5,9,11 |
| 13 | 한국어 NPC alias + prompt별 입력 규칙 | ⬜ | 8,9,11 |
| 14 | C++/Boron/TLK/binary/JS 번역 lookup 런타임 연결 | ⬜ | 4,11,12,13 |
| 15 | 전체 한국어 번역 corpus + glossary 일관성 (`i18n:check --strict`) | ⬜ | 4,14 |

### Wave 4 — 완성/배포 (16~20)
| # | 단계 | 상태 | 선행 |
|---|---|---|---|
| 16 | Web Audio 음악/효과음 + RFX 생성 | ⬜ | 6,9 |
| 17 | 브라우저 통합 게임 진행 e2e (새 게임부터) | ⬜ | 10,12,13,15,16 |
| 18 | 실패/보안/개인정보/회귀 경계 강화 (`audit:dist`) | ⬜ | 17 |
| 19 | GitHub Actions Pages workflow + `/ultima/` release artifact | ⬜ | 15,16,18 |
| 20 | README/사용자 가이드/증거 인덱스/handoff | ⬜ | 19 |

### Final — 독립 검증 (F1~F4 = 진행률 21~24번째)
| # | 단계 | 상태 |
|---|---|---|
| F1 | 계획 준수 감사 | ⬜ |
| F2 | 코드 품질 리뷰 | ⬜ |
| F3 | 실제 브라우저 수동 QA (Chromium/Firefox/WebKit) | ⬜ |
| F4 | 범위 충실도 (정적 호스팅, 원본 데이터 미포함) | ⬜ |

Step 7·8 main merge 완료 (2026-09-24):
- 7 ✅ merge `874c775 Merge todo-07-webgl2: WebGL2-safe buffers and shaders` (구현 `90232b9`)
- 8 ✅ merge `6b97d8e Merge todo-08-input-queue: browser-safe input queues` (구현 `af13814`)
- `vendor/source-manifest.json` treeSha256 충돌 → 합친 vendor로 재계산 resolve: xu4 **fileCount 409**, treeSha256 `e65f0d9b616f9e28923a5e6dfd61b481848832ac3a5f2ce3b0f2169d73b25b49` (`match:true`)
- worktree evidence는 main `.omo/evidence/ultima-web/task-{7,8}/`로 복사(git-ignored, local-only)
- 상세 acceptance·QA·RED/GREEN은 `handoff.md` "Todo 7/8 main merge 완료 기록" 참고

merge 게이트 (2026-09-24, main, 전부 실제 실행 · exit 0):
```
npm ci                                      # 0
npm run test:unit                           # 0 — 10 files / 73 tests
npm run verify:repo-sources                 # 0
npm run typecheck                           # 0
npm run build                               # 0
git diff --check                            # 0
cmp .omo/plans/ultima-web.md docs/ULTIMA_WEB_PLAN.md  # 0
npm run deps:wasm                           # 0
npm run build:wasm -- --debug               # 0 — 33/33 sources, xu4.wasm 3599061 B
npm run test:unit -- tests/unit/wasm-symbols.test.ts  # 0 — 8/8
npm run test:unit -- tests/unit/input-queue.test.ts   # 0 — 16/16
npm run cmake:configure && npm run cmake:build        # 0
ctest --test-dir build/native --output-on-failure     # 0 — 3/3 (module-package, native-baseline-negative, input-queue)
npm run test:native -- -R input-queue       # 0 — Passed
npx playwright test --project=chromium      # 0 — 3 passed (shell-ready, input-queue, webgl-render)
```
- build/wasm-release/build.log: Asyncify enabled, 금지어(pthread/libfaun/libpulse/GL) 없음
- 실패 배제 확인: 병렬 `npm ci`와 동시에 돌린 1회 unit/e2e는 node_modules 교체 충돌로 실패했으나, npm ci 종료 후 순차 재실행으로 전부 통과(위 exit code가 최종 상태)

Step 9 main merge 완료 (2026-09-24):
- 9 ✅ merge `5c28511 Merge todo-09-startup-data: browser startup, ZIP validation, virtual FS` (구현 `4c878c9`)
- `src/engine/zip.ts`(브라우저용 순수 ZIP 중앙 디렉터리 파서 + `validateUltima4Zip`), `src/engine/startup.ts`(`noInitialRun` → FS 준비 → IDBFS mount+populate → ZIP 검증/주입 → 오디오 unlock(best-effort) → `callMain` 1회, 계획 순서 그대로), `vite.config.ts`(생성된 `build/wasm-release/{xu4.mjs,xu4.wasm,modules/*}`만 화이트리스트로 `/engine/`에 서빙+`dist/engine/`에 복사 — 그 디렉터리가 xu4 소스 전체의 컴파일 스테이징 사본이기도 해서 통짜 복사는 안 됨, 처음 시도에서 발견하고 고침), `src/main.ts`(rom-picker → `startEngine` 1회 호출 배선, `data-engine-started`/`data-engine-start-reason` e2e 관측 속성)
- `.gitignore`: `engine/` → `/engine/`로 루트 앵커링 수정 — 앵커 없는 규칙이 새로 만든 `src/engine/`을 통째로 무시하고 있었음(다른 항목들은 전부 앵커돼 있었음, 기존 불일치를 바로잡음)
- e2e 5개 시나리오(happy/missing-files/corrupted/sha-mismatch-allow/reload) 전부 실제 실행·통과, happy path는 실제 검증된 `ULTIMA4_DATA`(529099 bytes)로 확인. 스크린샷 `.omo/evidence/ultima-web/task-9/startup-title.png`.
- **정직하게 남기는 한계**: `scripts/web-main.cpp`의 `main()`은 여전히 Step 6의 placeholder(즉시 return 0)라서, 지금 "엔진 시작" 성공은 화면에 실제 타이틀 화면을 그리는 게 아니다(스크린샷 캔버스는 검은 화면). 실제 xu4 부팅 시퀀스(servicesInit/config/screen/이벤트 루프) 이식은 이 Todo의 파일 범위 밖(빌드 스크립트 주석에 명시)이며 후속 통합 작업이다.
- **로컬 merge만 완료, origin push는 아직 안 함** — 사용자 확인 대기 중(아래 "바로 다음 순서" 참고). 이전 Step 7/8까지는 매번 push 전 사용자 승인을 받는 절차였는데, 이번엔 로컬 merge까지 진행한 뒤에야 확인 요청으로 넘어갔다 — AGENTS.md 진행 관리 규칙("merge는 멈추고 물어봐")과 어긋난 처리였다는 점을 다음 세션을 위해 남겨둔다.
- 상세 acceptance·QA·RED/GREEN은 `handoff.md` "Todo 9 main merge 완료 기록" 참고
- 병렬로 Step 10/16/11-13 설계 조사 메모 작성 완료(읽기 전용, 코드 미변경): `.omo/drafts/step-10-idbfs-design.md`, `.omo/drafts/step-16-web-audio-design.md`, `.omo/drafts/step-11-13-korean-ui-design.md`

merge 게이트 (2026-09-24, main, Step 9 merge 후 전부 재실행 · exit 0):
```
npm ci                                      # 0
npm run test:unit                           # 0 — 12 files / 87 tests
npm run verify:repo-sources                 # 0
npm run typecheck                           # 0
npm run build                               # 0
git diff --check                            # 0
cmp .omo/plans/ultima-web.md docs/ULTIMA_WEB_PLAN.md  # 0
npm run deps:wasm                           # 0
npm run build:wasm -- --debug               # 0 — 33/33 sources
npm run test:unit -- tests/unit/wasm-symbols.test.ts  # 0 — 8/8
npm run cmake:configure && npm run cmake:build        # 0
ctest --test-dir build/native --output-on-failure     # 0 — 3/3 (module-package, native-baseline-negative, input-queue)
ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip npx playwright test --project=chromium  # 0 — 8 passed
```

## 바로 다음 순서
1. ~~`git push origin main`~~ **완료** (2026-09-24, 사용자 승인, `358a6a2..695ee76`).
2. **Step 10**(IDBFS 세이브/설정 영속 + export/import) — 설계 메모 `.omo/drafts/step-10-idbfs-design.md` 있음. → 11~13(설계 메모 `.omo/drafts/step-11-13-korean-ui-design.md` 있음) → 14 → 15(번역 4402건). 16(설계 메모 `.omo/drafts/step-16-web-audio-design.md` 있음)은 9 이후 언제든 병렬 가능.
3. 17 → 18 → 19 → 20 → F1~F4.

## 목적 달성 가능성 판단
- **가능하다고 본다.** 근거: 엔진(xu4)이 원본 데이터로 native에서 실제 새 게임·이동·save/load까지 동작함을 확인했고(3.1),
  모듈 패키징·번역 inventory·웹 셸/브릿지 계약이 이미 main에 있다. 남은 일은 계획서에 기술 설계가 이미 확정돼 있다.
- 주요 위험 (확인 필요):
  - **`main()`이 아직 placeholder다 (신규, Step 9에서 확인).** 실제 xu4 부팅 시퀀스(servicesInit/config load/screen init/event loop)를 web-main.cpp로 이식하는 작업이 아직 없다 — Step 11~13(메시지 패널/오버레이/한글 입력)과 Step 17(실제 게임 진행 e2e)은 이 이식이 선행돼야 실질적으로 검증 가능하다. 정확히 어느 Todo에서 이 이식을 하는지 계획서에 명시가 없다 — 확인 필요, 다음 세션에서 판단해야 함.
  - Asyncify로 blocking loop를 옮길 때 stack/성능 문제 (Step 8) — queue 구현·단위/e2e 증명 완료, 실제 게임 루프(placeholder main이라 아직 못 돌림) 런타임은 위 이식 후 재측정 필요.
  - WebGL2 버퍼 경로 (Step 7) — Chromium e2e 픽셀+셰이더 검증 완료, native 링크/full engine 런타임은 위 이식 후 재확인 필요.
  - Step 7·8 동시 vendor/source-manifest 수정 — merge 시 충돌 예상했으나 재계산 resolve 완료(fileCount 409, treeSha256 `e65f0d9b…b25b49`, match:true).
  - 번역 corpus 4402건의 분량·품질 (Step 15).
  - Web Audio + RFX 동기 `soundDuration` 계약 (Step 16) — 설계 메모 작성됨, `.omo/drafts/step-16-web-audio-design.md`.
  - 환경: host Node 20.20.2(요구 ≥22, 경고만) — emsdk가 번들 설치한 Node 22.16.0(`.emsdk/node/22.16.0_64bit`)으로 해결 가능할지 확인 필요, 아직 미조치; wasm release 빌드는 main stub이라 DCE로 작아짐(acceptance는 --debug).

## 공통 규칙 (AGENTS.md 요약)
- 브랜치 `todo-<n>-<topic>`, PR 없이 main 직접 merge. merge 전 `npm ci`, `npm run test:unit`, `npm run verify:repo-sources`,
  `npm run typecheck`, `npm run build`, `git diff --check` + 해당 단계 추가 명령 전부 통과 후 `handoff.md`에 기록.
- TDD: RED 로그 → GREEN. 테스트 삭제/약화 금지.
- 원본 ZIP/EXE/TLK/MAP/EGA/SAV, 추출 원문 corpus, 사용자 save, secret 커밋 금지.
- 단계 완료 시 이 파일의 상태·진행률을 갱신한다.
