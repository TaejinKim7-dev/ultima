# 계획: 저장 슬롯 + 한국어 명령 패널 + Google Drive 동기화

## Context
2026-10-05 사용자 결정. 문제 세 가지: (1) 저장 칸이 하나뿐이다, (2) 처음 하는 사람이 어떤 키를 눌러야 하는지 모른다, (3) 다른 기기에서 이어 하고 싶다.

**현재 상태 (코드에서 확인한 사실)**
- 엔진은 월드맵·던전에서 플레이어가 Q(저장하고 끝내기)를 누를 때만 저장한다(`vendor/xu4/src/game.cpp:1182` `CTX_CAN_SAVE_GAME`). 자동 저장은 없다.
- 슬롯은 하나다: `party.sav`(502바이트), `monsters.sav`, 던전에서는 `dngmap.sav`·`outmonst.sav`. 새 캐릭터 만들기도 `party.sav`를 쓴다(`intro.cpp`). 설정은 `xu4rc`.
- 웹 빌드는 이 파일들을 `/persist/.xu4`(IDBFS, `src/engine/startup.ts` `PERSISTENCE_PATHS`)에 둔다. `src/engine/persistence.ts`가 `FS.trackingDelegate.onCloseFile` → `syncfs`로 내보내고 "저장 완료"/"저장 실패" 이벤트를 낸다.
- 내보내기/가져오기는 우리 자체 "U4SV" 묶음이다(원본 호환 아님).
- 엔진은 인트로에서 "Journey Onward"를 고를 때만 `party.sav`를 읽는다(`savegame.cpp` `saveGameLoad`, `xu4.saveGame`에 캐시). 따라서 **슬롯 전환은 플레이 시작 전에만** 가능하다.

## 방향 (결정)
- 저장 슬롯을 웹 페이지에서 고르게 한다. 그 다음 선택 기능으로 사용자 본인의 Google Drive와 동기화한다.
- GitHub Pages는 정적 호스팅이라 서버 코드·비밀값을 둘 수 없다. 클라우드는 **클라이언트 쪽 OAuth**(Google Identity Services / PKCE)로 Drive `appDataFolder`(숨김 앱 데이터, 범위 `drive.appdata`)에 쓴다. 우리 쪽 백엔드는 없다.
- 검토 후 기각/보류한 대안:
  - Dropbox/OneDrive 앱 폴더: 기각(같은 구조지만 사용자 계정 보급률·설정 비용에서 이득 없음). 보류.
  - GitHub Gist + 사용자 토큰: 기각(토큰을 사용자가 직접 붙여넣어야 하고 유출 위험).
  - File System Access API 폴더: 보류(Chromium 전용).
  - 자체 BaaS(Firebase/Supabase): 기각(계정·비밀값·운영 부담).
- 순서: Todo 51(로컬 슬롯) → Todo 52(한국어 명령 패널, 병행 가능) → Todo 53(Drive 동기화).

## Todo 51 — 로컬 저장 슬롯

### 설계
- **슬롯 저장소**: IndexedDB의 별도 DB(IDBFS 마운트와 분리). 레코드 `{id, name, createdAt, updatedAt, files[]}` + 활성 슬롯 id.
- **요약**: `party.sav`에서 이름·이동 수·HP·동료·금·식량·위치를 파싱한다(레이아웃은 `src/saves/party-summary.ts`).
- **작업 사본**: `/persist/.xu4`의 파일(`xu4rc` 제외).
- **슬롯 선택**(플레이 중이 아닐 때만): 저장 파일을 지우고 슬롯 파일을 복사해 넣고 `syncfs`.
- **되돌려 담기**: 저장 파일이 `syncfs`로 성공할 때마다 작업 사본을 활성 슬롯에 담는다(persistence coordinator에 `onSaved` 추가).
- **첫 실행 이전**: 이미 있는 `party.sav`는 "기본 슬롯"이 된다. 첫 담기 때 활성 슬롯이 없으면 아바타 이름으로 슬롯을 자동 생성한다.
- **안전 규칙**: 담기가 아바타 이름이 다른 슬롯을 덮어쓰게 되면(예: 기존 슬롯 위에 "Initiate New Game") 먼저 "[자동 백업]" 복사본을 남긴다.
- **작업**: 새 빈 슬롯, 이름 바꾸기, 복제, 삭제(확인창), 슬롯 1개 내보내기 / 새 슬롯으로 가져오기(U4SV pack/unpack 재사용).
- **UI**: 슬롯 목록 패널(활성 표시, 요약 한 줄, 버튼). 플레이 중에는 비활성.

### Must NOT
- 원본 `ultima4.zip`을 건드리거나 올리지 않는다.
- localStorage/sessionStorage에 아무것도 저장하지 않는다(`audit:dist`가 금지).
- `vendor/xu4` 엔진 동작을 바꾸지 않는다.
- 슬롯을 조용히 잃지 않는다.

### 작업 순서
1. 요약 파서 `party-summary.ts` 단위 테스트(정상·짧은 파일·깨진 값). 이미 구현됨.
2. 슬롯 저장소(IndexedDB 래퍼, 가짜 구현으로 테스트): 생성·조회·활성 id.
3. 슬롯 연산: 이전(마이그레이션), 안전 백업 규칙, 이름 바꾸기·복제·삭제.
4. 엔진 적용(`applySlot`): 가짜 FS로 저장 파일 비우기 → 복사 → syncfs 순서 검증.
5. coordinator `onSaved` 훅 + 담기 연결 단위 테스트.
6. 슬롯 목록 패널 UI와 플레이 중 비활성 연결.
7. 슬롯 1개 내보내기/가져오기(U4SV 재사용), 문서·handoff 갱신.

### 인수 기준 / QA
- 단위 테스트: 요약·파싱, 슬롯 연산(이전·백업 규칙·이름 바꾸기·복제·삭제), 가짜 FS 적용, coordinator `onSaved` — RED 후 GREEN.
- 사용자가 브라우저에서 직접 확인한다. e2e: 사용자 결정으로 보류(2026-10-05, 당분간 e2e를 추가·실행하지 않음).

## Todo 52 — 처음 하는 사람용 한국어 명령 패널 (구현됨 `f12d7b6`, 사용자 확인 대기)
- 항상 보이는 한국어 명령 목록(A+B). 각 버튼이 해당 키를 게임으로 보낸다.
- 구현: `src/ui/command-list.ts`(24개 명령, 엔진 `game.cpp`의 키와 대조하는 단위 테스트), `src/shell.ts`(버튼 → 키 전송, 플레이 중·프롬프트 없음·메뉴 닫힘일 때만 활성), `index.html`·`src/shell.css`(접이식 패널). 단위 테스트 통과. 사용자가 브라우저에서 확인하면 체크박스를 `[x]`로 바꾼다. e2e는 사용자 결정으로 보류.

## Todo 53 — Google Drive 슬롯 동기화

### 설계
- Google Cloud OAuth 클라이언트(공개 클라이언트 ID, 비밀값 없음). 범위는 `drive.appdata`만.
- 토큰은 메모리에만 둔다(방문마다 다시 로그인, 리프레시 토큰 저장 없음).
- 파일: 슬롯당 JSON/묶음 하나 + `updatedAt`이 든 작은 색인.
- 저장 후 자동 올리기(push), 가져오기(pull)는 사용자가 요청할 때.
- 충돌 규칙(슬롯별): 더 새로운 `updatedAt`이 이기되, 로컬 데이터를 덮어쓰기 전에 사용자에게 묻는다.
- 오프라인이면 로컬로 계속하고 재시도한다. "연결 해제" 버튼을 둔다.
- 개인정보 안내문: "저장 파일만 본인의 Google Drive에 올라가며, 원본 게임 데이터는 올리지 않습니다."

### `audit:dist` 변경 (`scripts/audit-dist.mjs` 확인 결과)
- `assertAllowedUrls`는 절대 URL의 origin이 `SAME_ORIGIN_ALLOWLIST`(지금은 Pages origin 하나)에 없으면 실패한다. 필요한 최소 호스트만 추가한다(정확한 목록은 구현 시 dist 검사 실패 메시지로 확정): `https://accounts.google.com`(GIS 로더 `/gsi/client`), `https://www.googleapis.com`(Drive v3, 업로드는 `/upload/drive/v3`).
- `EGRESS_FETCH_METHOD`는 `method: POST|PUT`를 전부 막는다. Drive 업로드는 POST/PATCH가 필요하므로, Drive 클라이언트 모듈 한 파일(예: `src/cloud/drive-client.ts`의 빌드 결과)에 한해서만 허용하는 파일 단위 예외로 만든다. 다른 파일의 POST/PUT·`sendBeacon`·`WebSocket`·`EventSource` 금지는 유지한다.
- 허용 호스트는 정확한 문자열/origin 단위로, 이유 주석과 함께 추가하고 감사 단위 테스트를 먼저 RED로 만든다.

### 작업 순서
1. `audit:dist` 허용 목록·파일 단위 예외 변경을 테스트 먼저(허용 파일만 통과, 그 외는 실패).
2. Drive 클라이언트(순수 함수: 요청 구성, 색인 파싱)를 가짜 fetch로 단위 테스트.
3. OAuth 토큰 흐름(GIS 토큰 클라이언트, 메모리 보관), 로그인/연결 해제 UI.
4. 슬롯 push(저장 후)와 색인 갱신, 오프라인 재시도 큐.
5. pull + 충돌 규칙(덮어쓰기 전 확인) 단위 테스트와 UI.
6. 개인정보 안내문, 오류 표시, 문서·handoff 갱신.

### 사용자에게 남은 질문 / 수동 준비
- OAuth 클라이언트 생성은 수동이다: Google Cloud Console 프로젝트 만들기, 동의 화면을 테스트 모드로 설정(테스트 사용자 등록), 승인된 JavaScript 원본에 `https://taejinkim7-dev.github.io`와 `http://localhost:8850` 등록, `drive.appdata` 범위 추가.
- 공개 배포 전 동의 화면 검증(앱 게시)을 받을지, 테스트 사용자만 쓸지 결정이 필요하다.
- 클라이언트 ID를 저장소에 커밋해도 되는지(공개 값이다) 확인이 필요하다.
- 확인 필요: GIS 스크립트를 외부에서 로드하는 방식이 이 저장소의 "정적·자체 완결" 방침(및 CSP 유무)과 맞는지.
