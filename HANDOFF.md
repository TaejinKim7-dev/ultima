# HANDOFF
작성 시각: 2026-10-03 KST (7차 — Todo 34 완료, 38/48) · 세션 재개용 요약

## 1. 목표 (What we're building)
- Ultima IV(xu4)를 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식한다. 사용자가 원본 `ultima4.zip`을 직접 선택하고, 실제 플레이 화면은 한국어로 나온다. 진행 기준은 `plan.md`, 세부 정의 원본은 `.omo/plans/ultima-web.md`다.

## 2. 현재 상태 (Current state)
- 37/37 완료 뒤 Todo 34~44를 추가해 **진행률 38/48 = 79.2%**다. 계획서 체크박스는 `[x]` 37, `[ ]` 11이다(직접 grep으로 셈).
- 배포 확인(이번 세션 직접 관측): `origin/main` `6ee20fd` 기준 Pages CI run `37083380136`의 build와 deploy가 success였다. `https://taejinkim7-dev.github.io/ultima/`와 `/engine/xu4.wasm`이 둘 다 HTTP 200이다. Pages API의 `build_type`은 `workflow`다(이전 HANDOFF의 "Pages 설정 확인 필요"는 해소됨).
- 이번 세션은 **문서·계획만** 바꿨다. 제품 코드 변경은 0이다.
- 브랜치: `chore-translation-policy-a`(`b373110`)를 main에 fast-forward했다. main은 origin보다 1커밋 앞선다(push는 이 HANDOFF 커밋과 함께 진행).

## 3. 변경한 파일 (Files changed)
- `docs/TRANSLATION_POLICY.md` (신규): 번역 공개 결정 기록(선택지 A~D, 채택 이유, 계속 금지되는 것, 권리자 요청 시 조치).
- `goal.md` (신규 편입): 루트에만 있던 초기 목표 문서다. §5·§8의 "번역 결과물 배포 금지"를 결정에 맞게 취소선으로 표시했고, 계획서가 우선한다는 머리말을 붙였다.
- `docs/GOAL_GAP_AUDIT.md` (신규 편입): 다른 에이전트가 쓴 갭 9건 감사다. §3·§7에 결정을 반영하고 §10에 갭→Todo 매핑을 추가했다.
- `README.md`: 비공식 팬 번역 고지 절을 추가했다. "현재 상태"를 2026-10-03 기준으로 갱신했다(F1~F4 완료, Safari 실기 미검증, Todo 34~44 안내).
- `.omo/plans/ultima-web.md` + `docs/ULTIMA_WEB_PLAN.md`: Todo 34~44, 머리말(방향·순서·직렬화), 의존성 행 34~44를 추가했다. `cmp` exit 0.
- `plan.md`: 분모 48, 진행률 37/48, Wave 6 표, 새 "🆕 바로 다음 순서 (2026-10-03)".
- `handoff.md`: 2026-10-03 절(6항목 + merge 게이트 exit code)을 append했다.

## 4. 주요 결정과 근거 (Key decisions)
- **번역 공개 유지**(사용자 결정). 버린 대안: 비공개 번역 팩, 원문 의존 diff 배포, NPC 대사 포기. 이유: 비상업 팬 번역이고, 이미 공개 히스토리에 있으며, UX가 가장 좋다. 법률 검토를 거친 결정은 아니다. 영어 원문은 계속 `sourceHash`만 둔다.
- goal.md 안의 "A안"(§7 레이아웃 HTML 오버레이)과 이름이 겹친다. 그래서 goal.md에서는 이 결정을 "번역 공개 결정"으로 표기했다.
- 웨이브 순서는 다음 판단에 따랐다. 핵심 키보드 UX(Must 2)를 먼저 회복한다. 다음은 텍스트 정합성이다. 감사 순서와 달리 placeholder 순서(#4)를 계측보다 앞에 뒀다. 틀린 문장은 영어보다 나쁘기 때문이다. 그다음이 계측(#9)이고, 계측 결과로 39·40 범위를 확정한다.
- 감사 주장은 코드로 확인했다.
  - #2: `aliases.json` 13개.
  - #4: `scripts/lib/placeholders.mjs`는 정렬 multiset으로 비교하고 `ui-message-compose.ts`는 순차 치환한다.
  - #5: `deathMsgs[]`가 ui.json에 없다.
  - #6: `screenMessageCenter`가 `screenMessageN`을 직접 불러 웹 훅을 우회한다.
  - #7은 미확정이다: `module.json`에 Rat(config:68)·Mage(45/88) 번역이 이미 있다.
- 개조(goal 우선순위 5)는 추천 기본값이 없다. 그래서 Todo 43은 제안서와 사용자 결정까지만 다룬다.

## 5. 다음 할 일 (Next steps)
- [x] **Todo 34** 로컬 저장소 정리 (완료 2026-10-03; 루트는 이제 main, worktree 27→2). 루트를 main으로 옮기고, merge된 worktree를 회수한다(evidence를 `rsync --ignore-existing`로 보존, 브랜치 유지, dirty는 salvage 브랜치에 커밋). 미merge인 `todo-release-verify`는 남긴다. main을 잡은 `agent-ad52af6bd293aab90`은 마지막에 루트에서 제거한다.
- [ ] **다음: Todo 35**(루트 `/home/taejin/ultima`에서 `todo-35-*` 브랜치): 한국어 입력 후 포커스 반환(재현 RED부터) → 36 placeholder 순서 → 37 LB/Hawkwind alias → 38 계측 → 39 → 40 → 41 → 42 → 44 재검증. 43은 언제든 할 수 있다.
- 세부 정의(What to do / Must NOT / References / Acceptance / QA)는 `.omo/plans/ultima-web.md` Todo 34~44에 있다.

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- (해소됨, Todo 34) 예전에 루트는 stale이었다. 지금은 main이며 clean이다. 이전 상태는 `salvage/root-stale-2026-10-03`.
- ~~루트 `/home/taejin/ultima`는 **stale**이다. `f3-real-browser-qa`, origin/main보다 76커밋 뒤에 있고 dirty다. Todo 34 전까지 거기서 작업하거나 판단하지 않는다. 루트의 `.claude/`는 worktree 저장소이므로 지우면 안 된다.~~
- main은 worktree `agent-ad52af6bd293aab90`에 체크아웃돼 있어서 루트에서 `git switch main`이 안 된다.
- F1~F4 승인은 37단계 범위 기준이다. 34~44 범위 재검증은 Todo 44가 맡는다. 체크마크를 그대로 이어받지 않는다.
- 이번 변경은 문서뿐이라 `verify:integration`(e2e)은 실행하지 않았다. Todo 35부터는 merge 전 **단독** 실행이 필수다.
- `verify:release-docs`는 README의 `placeholder` 단어를 stale 문구로 잡는다. 릴리스 문서에서는 이 단어를 쓰지 않는다.
- 갭 #7 노출 경로와 Todo 35의 포커스 반환 지연값은 **확인 필요**다.
- 이번 세션 merge 게이트(브랜치 `chore-translation-policy-a`):
  - `npm ci`, `test:unit`, `verify:repo-sources`, `typecheck`, `build`, `check:build-fresh`, `git diff --check`, `cmp` 계획서: 전부 0.
  - `verify:release-docs`: 첫 실행 1(위 단어 문제), 수정 후 0.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima/.claude/worktrees/agent-ad52af6bd293aab90   # Todo 34 전까지 main 작업 위치
export PATH="$HOME/.local/opt/node22/bin:$PATH"                      # 비로그인 셸에서 Node 22
git status -sb && git log --oneline -3
sed -n '/🆕 바로 다음 순서 (2026-10-03/,/^## 바로 다음 순서 (2026-10-02/p' plan.md
# 계획서 Todo 34 정의:
sed -n '/^- \[ \] 34\./,/^- \[ \] 35\./p' .omo/plans/ultima-web.md
# 통합 게이트(단독 실행, wasm 빌드 전 emsdk):
source .emsdk/emsdk_env.sh
ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip npm run verify:integration
```

- **테스트 실행 규칙(사용자 지시)**: 모든 테스트·게이트는 `model: haiku` 서브에이전트에 시키고 보고를 읽는다. 메모리 `feedback_tests_via_haiku`, AGENTS.md 참고.
