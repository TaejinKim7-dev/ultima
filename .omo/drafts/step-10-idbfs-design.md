# Step 10 설계 메모: IDBFS 세이브/설정 영속 + export/import

(read-only 설계 조사. 확인 필요 항목은 명시. Step 9 관련 파일은 참고만 하고 수정하지 않음.)

## 1. 실제 저장 write path (전부 flush 대상)

`engine/src/*.cpp` 전수 grep 기준, `fopen(..., "w"/"wb")`로 실제 파일을 쓰는 지점은 4곳:

1. **`gameSave()`** (`game.cpp:298-377`) — `PARTY_SAV`/`MONSTERS_SAV`, 던전이면 `DNGMAP_SAV`/`OUTMONST_SAV`까지 매크로 `openSaveFile`로 순차 open/write/**close**. 호출자는 `'q'`(quit&save, `game.cpp:1162`) 하나뿐(디버그 전용 `xu4.cpp:378`은 `#ifdef DEBUG`라 브라우저 빌드 제외).
2. **신규 캐릭터 생성 완료** (`intro.cpp:882-912`) — `PARTY_SAV`, `MONSTERS_SAV`를 각각 별도 `fopen`+write로 기록. `gameSave()`를 거치지 않는 **완전히 별도 경로** — 플랜의 "not just gameSave"가 가리키는 지점.
3. **`Settings::write()`** (`settings.cpp:406-510`) — 설정 파일 하나를 `"wt"`로 통짜 재작성. 호출자는 `intro.cpp` 6곳(옵션 메뉴 콜백)과 `gamebrowser.cpp` 2곳, 총 8곳.
4. 던전 파일들은 (1) 내부에서만 조건부로 쓰인다 — 별도 트리거 아님.

공통점: 전부 `fopen → write → fclose`로 끝난다. Emscripten MEMFS의 `fclose`는 동기 완료되지만 IDBFS 영속화는 `FS.syncfs(false, cb)`를 **명시 호출해야만** 일어난다. 네이티브 코드는 IDBFS를 모르므로, "MEMFS 파일 close"를 웹 셸이 관찰해 syncfs를 트리거해야 한다.

## 2. Persistence Coordinator API (시그니처만)

```ts
// src/engine/persistence.ts (신규, Step 9 startup.ts 이후)

export type PersistenceStatus = "idle" | "saving" | "saved" | "error"

export interface PersistencePaths {
  readonly saveDir: string      // xu4.settings->getUserPath()와 일치해야 함 -- 확인 필요
  readonly settingsFile: string // Settings::write() 대상 경로 -- 확인 필요
}

export type BridgeEmit = (event: import("../bridge/types.ts").SaveStateBridgeEvent) => void

export interface PersistenceCoordinator {
  /** FS 인스턴스/경로 연결. startup에서 main() 호출 전 1회. */
  attach(fs: EmscriptenFS, paths: PersistencePaths, emit: BridgeEmit): void
  /** MEMFS 파일 close 관찰 시 debounce 후 syncfs(false, ...) 실행. */
  onFileClose(path: string): void
  /** 진행 중인 sync 완료를 기다림 (export/import 전 정합성 보장). */
  flush(): Promise<void>
  readonly status: PersistenceStatus
}

export function createPersistenceCoordinator(): PersistenceCoordinator
```

관찰 방식 후보:
- **`FS.trackingDelegate.onCloseFile`** (Emscripten 표준 훅) → `onFileClose`로 연결. 콜사이트 추적 불필요, "gameSave만이 아닌 모든 write path" 요구와 잘 맞음.
- 대안: 각 write path 종료 지점(quit&save, 캐릭터 생성, 설정 저장 콜백)마다 엔진이 직접 브리지 함수를 호출 — C++ 쪽 새 `extern "C"` 훅이 필요해 범위가 커짐.

1안을 우선 후보로 제안한다.

## 3. Export/Import를 실제 IDBFS 데이터로 연결

`src/shell.ts`의 `save-export`(46행)/`save-import`(47행) 핸들러는 현재 실제 파일과 무관한 placeholder JSON(`{note, exportedAt}`)을 만들고, import는 `JSON.parse` 성공 여부만 확인한다. 실제 연결안:

- **Export**: `coordinator.flush()`로 pending sync를 비운 뒤 `FS.readdir(saveDir)`로 세이브/설정 파일들을 순회, `FS.readFile(path)`(Uint8Array)로 읽어 하나의 아카이브(zip 또는 length-prefixed 바이너리 번들)로 묶어 Blob 다운로드. 세이브 포맷은 fixed byte layout이므로 **JSON으로 감싸면 안 되고 바이너리 그대로** 담아야 한다.
- **Import**: 아카이브를 풀어 `FS.writeFile(path, bytes)`로 MEMFS에 쓴 뒤 import 핸들러가 직접 `FS.syncfs(false, cb)` 호출. 상태 표시는 기존 `SaveStateBridgeEvent`(`saving`/`saved`/`error`)로 충분 — **새 브리지 이벤트 타입은 불필요**. `src/bridge/types.ts`의 `SaveStateBridgeEvent`는 이미 `status`+옵션 `message`만 요구.
- 확인 필요: import된 세이브를 현재 실행 중인 게임에 반영하려면 페이지 리로드가 필요한지, 엔진에 재로드 신호를 보낼 방법이 있는지 — Step 9의 "call main exactly once" 제약과 얽혀 있어 이 문서만으로 결론 내리지 못함.

## 4. 첫 RED 테스트 후보 (`tests/unit/persistence.test.ts`)

- `attach()` 후 `onFileClose(partySavPath)` 호출 시 `syncfs(false, ...)` mock이 정확히 1회(디바운스 후) 불린다.
- 연속된 여러 `onFileClose`(예: `gameSave()` 한 번 안의 `PARTY_SAV`+`MONSTERS_SAV`)가 하나의 sync로 합쳐진다 — 파일마다 syncfs를 부르면 안 됨.
- 시퀀스 완료 시 `status`가 `"idle"→"saving"→"saved"`로 전이하고 그 순서로 `emit`이 호출된다.
- syncfs 콜백이 에러를 반환하면 `status`가 `"error"`가 되고 `message`가 채워지며, **"saved"가 잘못 보고되지 않는다** (plan의 실패 QA와 직결).
- `flush()`가 진행 중인 syncfs의 완료를 실제로 기다리는 Promise를 반환한다.

## 5. 위험/미확인 사항

- `xu4.settings->getUserPath()`와 Step 9가 마운트할 IDBFS 경로(`/persist/...`)의 일치 여부 — Step 9가 아직 main에 merge되지 않아 확인 필요.
- `Settings::write()`의 `filename`이 어디서 초기화되는지 이 세션에서 추적 못함 — 세이브 디렉터리와 같은 마운트 아래인지 확인 필요.
- `FS.trackingDelegate.onCloseFile`이 이 프로젝트의 wasm-release 빌드 플래그에서 활성화되는지 확인 필요 — 안 되면 2안(C++ 명시 훅, `web_bridge.h` 계약 확장)으로 폴백.
- `scripts/web-stub.cpp`의 `savegameSave/Load/Exists/Delete` 스텁은 실제 write path와 연결되어 있지 않은 것으로 보인다(단순 `return true`) — 죽은 코드인지 다른 미연결 경로용인지 확인 필요.
- export 아카이브 포맷(zip vs 커스텀 바이너리)은 미결정, 옵션만 제시.
- import 후 즉시 반영 vs 리로드 여부는 결론 내리지 않음(3번 항목 참고).
