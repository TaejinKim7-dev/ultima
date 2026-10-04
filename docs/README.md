# Ultima IV 웹 한글판 — 문서 색인 (AI 시작점)

이 저장소는 Ultima IV(xu4 → WASM) 웹 한글판 프로젝트다. 새 세션의 AI 코딩 에이전트는 이 파일을
먼저 읽고, 아래 순서대로 다음 문서들을 읽은 뒤 작업을 시작한다.

## 읽는 순서

1. [`AGENTS.md`](../AGENTS.md) — AI 코딩 에이전트 규칙(절대 금지, 개발 방식, Git 작업 방식, 진행 관리 룰, 인계 규칙).
2. [`docs/plan.md`](plan.md) "바로 다음 순서" 절 — 현재 진행률과 가장 앞에 있는 미완료 단계.
3. [`docs/plans/README.md`](plans/README.md) "계획 목록" — 현재 진행 중인 계획 문서와 그에 대응하는 Todo 번호. 그 중 상태가 "진행 중"인 계획의 본문을 정독한다.
4. [`docs/handoff.md`](handoff.md) 마지막 절 — 가장 최근 세션의 작업 기록, 실행한 명령과 exit code, 결정과 차단.

이 네 개만으로도 작업을 재개할 수 있어야 한다. 그래도 더 궁금하면
[`docs/AI_AGENT_HANDOFF.md`](AI_AGENT_HANDOFF.md)(인계 포맷)와
[`docs/HANDOFF.md`](HANDOFF.md)(세션 재개용 짧은 요약)를 본다.

## 개발 룰 (AGENTS.md 요약)

- **진행 → 저장 → 기록 → 확인**: 한 단계를 끝내면 ① 커밋, ② `docs/plan.md`·`docs/handoff.md`·`docs/HANDOFF.md` 갱신, ③ 실제로 실행한 명령으로 검증. 셋 중 하나라도 빠지면 그 단계는 끝난 게 아니다.
- **테스트·게이트는 Haiku 서브에이전트(`model: "haiku"`)가 실행한다.** 메인 모델은 exit code와 실패 출력을 읽고 `git status`·`git log` 같은 관측으로 재확인한다.
- **통합 게이트 `npm run verify:integration`은 단독으로만 실행한다.** 게이트가 도는 동안에는 다른 레인·에이전트·워크트리를 같이 굴리지 않는다(공유 `vite preview`가 죽으면 이후 모든 e2e가 `ERR_CONNECTION_REFUSED`로 죽는다).
- **TDD**: 새 동작은 실패하는 Unit Test를 먼저 추가하고 RED 로그를 남긴 뒤, 최소 구현으로 GREEN을 만든다. 실패 테스트를 삭제하거나 약화해서 green으로 만들지 않는다.

## 절대 금지 (AGENTS.md 원문 인용)

- 원본 Ultima IV 게임 데이터를 커밋하지 않는다.
  - 금지 예: `ultima4.zip`, 원본 `.EXE`, `.TLK`, `.MAP`, `.EGA`, `.SAV`, 추출 원문 corpus, 사용자 save, secret.
  - 임시 검증에 원본 데이터를 사용했다면 repo 밖 임시 경로(`/home/taejin/ultima4-original-data/` 같은)에 두고, 산출물·로그·artifact에 포함하지 않는다.
- 실패 테스트를 삭제하거나 약화해서 green으로 만들지 않는다.

## 환경

```bash
# Node 22 LTS (WSL2 비로그인 셸에서 필요할 수 있음)
export PATH="$HOME/.local/opt/node22/bin:$PATH"

# emsdk (wasm 빌드·verify:integration 전에)
source .emsdk/emsdk_env.sh

# 원본 데이터 경로 (verify:integration, verify:release, dev에서 사용)
export ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip
```

빌드·배포·테스트 명령의 자세한 순서는 [`docs/WEB_PORT.md`](WEB_PORT.md)와
[`docs/GITHUB_PAGES.md`](GITHUB_PAGES.md)를 본다.

## 새 세션 시작 프롬프트

짧은 버전:

```
docs/README.md 읽고 다음 작업 준비해. 준비되면 진행해.
```

자세한 버전:

```
이 저장소는 Ultima IV 웹 한글판(xu4 → WASM) 프로젝트야.
1. docs/README.md를 먼저 읽고, 거기 적힌 순서대로 AGENTS.md, docs/plan.md "바로 다음 순서",
   docs/plans/README.md의 "진행 중" 계획 문서, docs/handoff.md 마지막 절을 읽어.
2. 가장 앞에 있는 미완료 단계 하나를 골라, 무엇을 할지·어떤 파일을 바꿀지·어떻게 검증할지 짧게 정리해.
3. 정리되면 묻지 말고 진행해. 규칙: 단계마다 진행→저장(커밋)→기록(docs/plan.md, docs/handoff.md, docs/HANDOFF.md)→확인,
   TDD로 RED 먼저, 테스트·게이트는 항상 Haiku 서브에이전트가 실행, 통합 게이트(npm run verify:integration)는 단독 실행,
   원본 게임 데이터·영어 원문은 절대 커밋하지 않기.
4. 단계가 끝나면 진행률 변화와 다음 단계만 짧게 보고해.
```

## 단계 완료 시 갱신 (AGENTS.md 발췌)

1. `docs/plan.md`: 상태(✅), 현재 진행률(n/N), "바로 다음 순서"
2. 계획서 두 벌(`.omo/plans/ultima-web.md`, `docs/ULTIMA_WEB_PLAN.md`)의 해당 체크박스 `[x]`
3. `docs/handoff.md`: merge 게이트 명령과 exit code