# N2 자체 패치 목록

> 이 파일은 **n2 브랜치 전용**이다. upstream(chrisryugj/korean-law-mcp)에 없는
> 우리 자체 수정을 전부 여기에 기록한다. 항목이 늘 때마다 반드시 갱신할 것.

## 브랜치 규칙

| 브랜치 | 역할 | 규칙 |
|---|---|---|
| `main` | upstream 미러 전용 | 직접 커밋 절대 금지. 항상 `git merge --ff-only upstream/main`만 |
| `n2` | 자체 수정 전용 | upstream 갱신 시 `git rebase main`. 수정은 **신규 파일 위주** (충돌 최소화) |

업데이트 절차는 `C:\dev\n2-mcp-bundle\scripts\sync-upstream.bat` 더블클릭
(내부: fetch → main ff-merge → n2 rebase → npm install → build).

## 패치 목록

브랜치 분기 시점: `ad2d620` (upstream v4.9.7)

### 1. 국세청 예규·법령해석 본문 조회 (2026-08-13)
- **무엇을**: `get_decision_text(domain="nts")`가 `[NOT_SUPPORTED]` 대신
  국세법령정보시스템(taxlaw.nts.go.kr) `action.do`(ASIQTB002PR01)로 본문을 조회
- **왜**: 법제처 OPEN API는 국세청 법령해석 목록만 제공 — 예규 원문 인용이 불가능했음.
  세무 검토서 작성 시 예규 본문 인용이 필수 (임원 중간정산 검증에서 발견)
- **건드린 파일**:
  - `src/tools/nts-body.ts` (신규) + `src/tools/nts-body.test.ts` (신규)
  - `src/tools/unified-decisions.ts` (import 1줄 + GET_HANDLERS.nts 1줄만)
- **참고**: id는 검색 결과 링크의 `ntstDcmId`(법제처 일련번호와 별개).
  링크/원시값 허용, 짧은 숫자는 ID_MISMATCH 안내. precedents.ts의 비공개 헬퍼를
  복제(직접 수정 금지 — upstream 활발 변경 파일)
- **upstream PR 가능 여부**: 가능 (Phase 2 안정화 후 재판단 — 계획서 §결정 대기)
- **검증 방법**: `ntstDcmId=010000000000515153` 조회 → 제목 "무주택 임원 퇴직금
  중간정산 가능 여부", 문서번호 법인세과-352, 회신일자 20130716, 본문 4천자+

### 2. 무관 판례 전문 자동첨부 게이트 (2026-08-14)
- **무엇을**: chain(full_research·dispute_prep·document_review)과
  `search_decisions(precedent, includeText)`가 상위 판례 전문을 자동 첨부하기 전에
  본문을 검색 취지와 대조, 무관하면 전문 대신 안내 문구만 남김 (opt-in `relevanceGate`)
- **왜**: 최초 검색이 hit>0이면 기존 validateResult가 아예 호출되지 않아
  (requiresResultValidation 미설정) 무관 판결문 전문이 통째로 붙었음.
  실측: 판매후리스 질문에 금지금·마스크 가공세금계산서 판결문 2건 전문 첨부
  (삼일 Tax Agent 비교 분석에서 발견, 2026-08-13)
- **건드린 파일**:
  - `src/tools/precedent-relevance-gate.ts` (신규) + `.test.ts` (신규, 12케이스)
  - `src/tools/precedent-evidence.ts` (옵션 `relevanceGate`·`gated` 필드 + 게이트 적용 + 렌더링)
  - `src/tools/chains.ts` 2곳, `src/tools/unified-decisions.ts` 1곳 (relevanceGate: true 플래그만)
- **대조 기준**: hit을 찾은 검색어(sourceQuery·semanticAnchor) 토큰 AND + **원 질의
  변별 토큰** (3어절 이하=원문 토큰, 긴 자연어=compact-query-planner 핵심 키워드).
  폴백이 검색어를 일반어로 완화해 잡은 무관 hit까지 차단하기 위함.
  기준을 만들 수 없으면 게이트 미적용(기존 동작). 검증 경로
  (validatePrecedentSearchResult의 1건 조회)는 원본 본문이 필요하므로 게이트 제외
- **upstream PR 가능 여부**: 가능 (동작이 보수적·opt-in이라 부담 낮음. Codex 검토 후 재판단)
- **검증 방법**: E2E — legal_research(full_research, tax, "판매후리스 거래에서 세금계산서
  발급 시 공급자와 공급받는 자는 누구인가") → "관련성 미확인 2건 전문 생략" +
  출력 7,693→4,725자. 대조군 search_decisions(precedent, includeText,
  "부당행위계산부인") → 관련 전문 정상 첨부(오차단 없음). vitest 199 통과

### 3. 국세청 예규 목록에 문서번호 표기 (2026-08-14)
- **무엇을**: `search_decisions(domain="nts")`(관세청 customs 포함) 목록에
  문서번호(안건번호, 예: 재부가46015-182) 표기
- **왜**: 응답 XML에 `<안건번호>`가 오는데 파서가 버리고 있었음. 예규 인용은
  문서번호+일자가 표준인데 목록에서 특정 불가 — 본문을 열어야만 확인 가능했음
  (판례=사건번호, 심판=청구번호는 이미 표기 — nts만 누락)
- **건드린 파일**: `src/tools/customs-interpretations.ts` (파서 1필드 + 출력 조건부 1줄)
  + `src/tools/customs-interpretations.test.ts` (신규)
- **upstream PR 가능 여부**: 가능 (순수 버그 수정 성격)
- **검증 방법**: search_decisions(nts, "판매후리스") 목록 5건 전부 문서번호 표기 확인
  (재부가46015-182 · 법인세과-1 · 부가가치세과-1432 · 기준-2016-법령해석부가-0166 ·
  부가22601-1072). 안건번호 없는 항목은 줄 생략. vitest 201 통과

### 4. verify_citations 행정규칙 인용 검증 (2026-08-14)
- **무엇을**: 고시·훈령·예규·통칙·기준·지침 접미사 인용을 추출해 행정규칙
  API(target=admrul)로 명칭 실존 검증. `…규정`·`…규칙`이 법령 DB에 없을 때도
  admrul 폴백. 미발견 시 확실 접미사(고시·훈령·예규·통칙)=✗, 모호 접미사
  (기준·지침)=⚠ (일반 명사 오탐 방지). 폐지 연혁은 ⌛ (v4.10.0
  detectAbolishedAdminRule 재사용)
- **왜**: 접미사 화이트리스트가 법령 7종뿐이라 「식품등의 표시기준」 제N조 같은
  행정규칙 인용은 추출 실패로 **검증을 조용히 건너뜀** — 인용 검증을 게이트로
  쓰려면 선결 과제 (삼일 분석 §6 지적)
- **한계 (정직 표기)**: 행정규칙은 조문 단위 조회 API가 없어 **명칭 실존만** 확인
  (결과 문구에 명시). 기본통칙·집행기준의 하이픈 번호 체계(94-0-13)는 "제N조"
  패턴이 아니라 이번 범위 밖
- **건드린 파일**: `src/tools/admin-rule-citation.ts` (신규) + `.test.ts` (신규, 9케이스)
  + `src/tools/verify-citations.ts` (접미사 2곳 + 분기 2곳)
- **upstream PR 가능 여부**: 가능 (v4.9.0 인용 검증 강화 흐름과 부합)
- **검증 방법**: E2E — "「식품등의 표시기준」 제4조 + 법인세법 제19조 + 가짜 고시"
  혼합 텍스트 → ✓ 행정규칙 실존(고시·식약처·발령일) / ✓ 법령 기존 경로 무손상 /
  ✗ 가짜 고시 HALLUCINATION_DETECTED. vitest 210 통과

### 5. search_decisions 축약 재검색 사다리 (2026-08-14)
- **무엇을**: 예규(nts)·해석례(interpretation)·조세심판(tax_tribunal) 검색이
  [NOT_FOUND]면 검색어를 앞 2어절 → 첫 어절로 줄여 자동 재시도. 성공 시
  어떤 축약으로 찾았는지 + 선별 경고를 결과 머리에 명시
- **왜**: 법제처 API는 공백 키워드를 AND 처리 — 자연어형 검색어는 0건이 되기 쉽다.
  판례는 자동 폴백이 있는데 이 3개 도메인은 재시도 제안 문구만 주고 LLM에 떠넘겼음.
  실측: nts "판매후리스 세금계산서 공급자" 0건 / "판매후리스" 14건
- **건드린 파일**: `src/tools/decision-search-fallback.ts` (신규) + `.test.ts` (신규, 9케이스)
  + `src/tools/unified-decisions.ts` (import 1줄 + 디스패치 3줄 래핑)
- **범위**: search_decisions 디스패치 경로만. NOT_FOUND 외 오류(타임아웃 등)는
  재시도하지 않고, 재시도 중 예외는 사다리 중단 후 원 결과 반환 (오류 은폐 금지)
- **upstream PR 가능 여부**: 가능 (noResultHint의 자체 재시도 제안을 실행으로 옮긴 것)
- **검증 방법**: E2E — search_decisions(nts, "판매후리스 세금계산서 공급자") →
  축약 노트 + "판매후리스 세금계산서" 6건 (정답 재부가46015-182가 1위).
  성공 케이스는 노트 없이 기존과 동일. vitest 219 통과

### 검토 반영 (2026-08-14, Opus 적대적 검토 — 판정 "수정 후 배포" → 수정 완료)
- **차단 1 수정**: 행정규칙 캡처("판단 기준" 등 산문 어구 포함)가 '같은 법' 조응의
  antecedent를 덮어써 정상 인용("법인세법 시행령")을 오판정하던 회귀 —
  `parseCitations`에서 행정규칙 이름은 선행사 갱신 제외 (verify-citations.ts)
- **차단 2 수정**: 짧은 구어체 질의("식대 비과세 되나요")의 의문 어미가 AND 조건이 되어
  게이트가 정답 판례까지 전량 차단 — 의문·구어체 불용어 필터 추가
  (precedent-relevance-gate.ts STOP_TOKENS/STOP_ENDINGS, 제외 후 토큰 없으면 게이트 미적용)
- **권고 3 수정**: document_review 다중 힌트 병합 경로에서 원 질의 대조 제외
  (chains.ts — hit별 sourceQuery 대조만 적용)
- **권고 4 수정**: 사건번호 지정 조회(검색어 없는 검색)는 게이트 미적용
- **권고 7 수정**: 행정규칙 검색 display=100 + 스캔 상한 100 (api-client.searchAdminRule에
  display 파라미터 추가 — 가나다순 밀림으로 실존 고시가 ✗ 오판되는 것 방지)
- **추가**: customs 도메인도 축약 사다리 래핑 (nts와 같은 구현 — 동작 일관성)
- **문서화 수용 (코드 무변경)**: ⑤ 게이트는 full=false 축약 본문(앞 800+뒤 400자) 대조 —
  변별 용어가 이유 중간에만 있으면 관련 판례도 제목만 남을 수 있음(안전한 방향의 손실).
  ⑥ 긴 질의의 planner 키워드는 변별 토큰이 빠지거나 일반어가 붙는 편차 있음.
  ⑧ `…규정` admrul 폴백은 법령 검색이 완전 0건일 때만 발동 (부분매칭 ⚠가 먼저 잡으면 미발동)
- 회귀 테스트 5건 추가, vitest 224 통과. E2E 3종(게이트·행정규칙·사다리) 재실행 무회귀 확인

### 검토 반영 (2026-08-19, Codex 교차검토 — 판정 "수정 후 배포" → 소스 실측으로 3건 전부 진성 확인, 수정 완료)
- 검토 입력은 diff 텍스트만(Codex 셸 차단 환경) — 차단 3건을 소스 실측으로 재검증한 뒤 수정
- **차단 1 수정**: 문장부호가 붙은 구어체 토큰("되나요?")이 STOP_ENDINGS `$` 앵커에
  미매칭 → AND 조건 잔류 → 정상 판례 오차단. `isStopToken`이 문자·숫자 외 문자를 벗긴
  bare 토큰으로 비교하도록 수정 (precedent-relevance-gate.ts)
- **차단 2 수정**: 축약 사다리가 NOT_FOUND 아닌 오류 응답(429 등)에도 `continue`로
  다음 단계 재시도 — 설계("NOT_FOUND만 재시도")와 불일치, 쿼터 소진·오류 은폐.
  NOT_FOUND만 계속, 그 외 오류는 throw 경로와 동일하게 사다리 중단
  (decision-search-fallback.ts)
- **차단 3 수정**: `searchAdminRule`은 `searchLaw`와 달리 HTML/빈 응답 검사가 없어
  200 상태의 장애 페이지가 "admrul 0건" 파싱 → ✗ NOT_FOUND(환각 의심)로 오보.
  `findAdminRule`에서 빈 응답·HTML·documentElement 부재를 throw로 판별해
  기존 catch의 ⚠(판정 불가) 경로에 태움 (admin-rule-citation.ts)
- **권고 1 수정**: validationTermGroups 우선 경로에도 구어체 불용어 필터 적용
  (제외로 그룹이 비면 그룹째 탈락 — 게이트 완화 방향이라 오차단 없음)
- **권고 2 문서화 수용 (코드 무변경)**: 외부 XML 크기 제한은 upstream 패턴과 동일
  (fetchWithRetry 30초 타임아웃, 응답 크기 제한은 upstream 전반에 부재 — 별도 도입 안 함).
  타입 검사는 차단 3 수정의 HTML/빈 응답 판별로 해소
- **참고 (조치 없음)**: detectAbolishedAdminRule 재사용은 충돌 없음 (Codex도 동일 판단)
- 회귀 테스트 7건 추가, vitest 231 통과

### 검토 반영 2차 (2026-08-19, Codex 재검토 — 수정분 재검토에서 차단 2건 추가 발견 → 수정 완료)
- **차단 1 수정**: 사다리 중단 시 오류 응답을 버리고 원 NOT_FOUND만 반환 → 429·타임아웃이
  "0건"으로 은폐. `withLadderAbortNote`로 중단 사유(오류 첫 줄)를 원 결과에 병기 —
  오류 응답 경로·throw 경로 동일 적용 (decision-search-fallback.ts)
- **차단 2 수정**: HTML 판별이 대소문자 구분(`<HTML>` 통과) + 루트 미검증(`<error>` 오류
  XML이 0건으로 읽힘). 대소문자 무시 정규식 + 루트 `AdmRulSearch` 검증(실호출로 루트명
  확인) 추가, 불일치 시 throw → ⚠ (admin-rule-citation.ts)
- **권고 2 수정**: 는지·한지·인지는 단독 실질 검색어일 수 있어(예: "인지" 청구) 접두부
  있을 때만 어미 취급 (STOP_AMBIGUOUS_ENDINGS 분리 — 게이트 정밀도 보전)
- **권고 1 문서화 수용 (코드 무변경)**: isNotFound가 content 항목의 `[NOT_FOUND]` 문자열
  포함으로 판별 — LooseToolResponse에 구조적 오류 코드가 없어 문자열 판별이 한계.
  핸들러들의 NOT_FOUND 렌더링(noResultHint)과 오류 렌더링([ERROR])이 분리돼 있어
  실제 혼입 사례는 없음
- 회귀 테스트 3건 추가·2건 강화, vitest 234 통과. 게이트 실호출 실증:
  "퇴직금 중간정산 되나요?" → 판례 전문 첨부(수정 전이면 전량 차단),
  "식대 비과세 되나요?" → 무관 판례(1세대1주택)만 정당 생략 + 직접조회 안내

### upstream 동기화 (2026-09-02, v4.10.0 → v4.12.2 — 법제처 API 변경 장애 복구)
- **계기**: 법제처가 2026-08-27부터 `lawService.do?target=eflaw` 단건 조회에 `efYd`를
  요구하도록 바뀌어, MST 단독 `get_law_text`가 HTML 안내 페이지를 받고 통째로 실패.
  `verify_citations`는 이 경로만 타므로 실존 인용 전건이 ⚠로 나옴.
  4.10.0 설치본 실호출로 재현: 소득세법 §12·법인세법 §19 → ⚠ 2/2, mst 단독 → EXTERNAL_API_ERROR
- **동기화**: `main` ff-merge `71e9f3d` → `1c55f94`(v4.12.2, 커밋 약 90건, 152파일).
  `n2` rebase 10커밋 재적용. 충돌 2곳(둘 다 `src/tools/verify-citations.ts`):
  ① import 양쪽 추가 → 둘 다 유지 ② upstream이 `extractLawName`을
  `lawNameFromCitationContext`(export)로 개명 → upstream 이름 + 패치 #4의
  `!isAdminRuleName` 선행사 가드 유지. 나머지 8커밋은 자동 적용
- **의존성**: `pdfjs-dist` `^5.5.207` → `4.10.38` 고정(upstream 변경). 배포 시 node_modules 갱신 필요
- **검증**: tsc 빌드 통과, vitest 783/783(upstream 722 + N2 61), 신빌드 실호출 —
  verify_citations ✓ 2/2 복구, get_law_text mst+jo="제12조" 5,210자·목 45개,
  nts 목록 문서번호 표기(패치 #3) 회귀 정상
- **주의(upstream 설계)**: MST 단독 폴백(`target=law`)은 분리시행 공포본의 특정 슬라이스를
  돌려준다 — 소득세법 MST 280405는 시행일 20260101판(현행은 20260701). `efYd` 동반이나
  `lawId` 조회는 20260701판. 현행 정밀 인용이 필요하면 `lawId` 또는 `efYd` 동반 권장
- **동반 수신 (upstream 4.11.0·4.12.x)**: 판례 인용 검증 축(verify_citations 법령+판례 2축),
  체인 데드라인·부분 결과, 별표 페이지네이션, 분리시행 처리(applicable_law·time_travel),
  시행 예정 개정 경고, 부존재 오단정 하드닝, 날짜 표기 `2024.01.05` 통일(사용자 가시 변경)

### 검토 반영 (2026-09-02, Codex 교차검토 — 1차 "수정 후 배포" → 차단 1 수정 완료)
- 검토 입력: `docs\codex-review-prompt-20260902-law-4122-sync.md`(번들) — range-diff·해소 후 전문·upstream
  api-client diff·N2 전체 diff 첨부(98KB). 참고1: **충돌 해소 2곳 의미 보존 확인**
- **차단 1 수정 (커밋 b19d6df)**: verify-citations.ts 법령 미매칭 후 admrul 폴백 호출부의 `catch {}`가
  429·HTML·빈 응답 throw를 삼키고 ✗ NOT_FOUND(환각 의심)로 확정 → `⚠ … 행정규칙 확인 실패(판정 불가): <사유>`
  반환. 8/19 차단 3(findAdminRule의 throw)이 verifyAdminRuleCitation 경로만 ⚠로 받고 이 폴백 경로는
  누락됐던 것. 회귀 테스트 2건(장애 → ⚠·NOT_FOUND 부재 / 정상 0건 → ✗ 유지). vitest 785 통과
- **권고 1 문서화 수용 (코드 무변경)**: nts-body.ts의 `response.text()` 직접 사용 — stdio 단일 사용자,
  taxlaw 응답 수 KB, fetchWithRetry 30초 상한, 취소 신호 발생 경로 없음. 백로그: `readResponseText` 전환
- **권고 2 문서화 수용 + 실측**: 사다리의 `[NOT_FOUND]` 문자열 판별 — v4.12.2 실호출에서 nts 미스 렌더링
  동일 확인, 사다리 E2E(3어절 0건 → 2어절 6건, 축약 표기) 정상. 8/19 권고 1과 같은 한계(구조화된 오류 코드 부재)
- **확인 불가 2건 실측 해소**: pdfjs-dist 4.10.38 — 동봉 Node v22.22.2로 ESM 로드 성공, kordoc 4.7.2 peer `^4.10.38`
  일치, 별표4 표 파싱 성공 / 사다리 실동작 — 위 E2E
- **2차 검토 판정 "배포 가능"** (`docs\codex-review-prompt-20260902-law-4122-sync-r2.md`, 수정 diff + 실측 로그 첨부):
  차단 1 해소 확인, 권고 2건 문서화 수용 타당. 참고 1(오류 메시지를 응답에 그대로 포함 — 길이 제한 권장)은
  백로그. 확인 불가 2건은 소스로 해소: ⚠ 집계는 줄머리 기호 카운트(verify-citations.ts `startsWith("⚠")`)라 일관,
  남은 `catch {}` 4곳은 전부 무해(JO 코드 변환 실패 skip·범위 힌트·URL 파싱·게이트 키워드 후보 — 검증 결과 삼킴 아님)
- **공유폴더 배포 (2026-09-02 12:22)**: law 4.10.0+N2 → **4.12.2+N2** (n2 = b19d6df). build 276 + node_modules 5,443
  (pdfjs-dist 4.10.38) + 메타·문서. 롤백: `archive\pre-law4122-20260902-122223\` (build·node_modules·메타 전부 —
  역순 스왑으로 완결). 증적: 번들 `docs\deploy-evidence-20260902-law-4122.md`

<!-- 패치 항목 템플릿 (복사해서 사용)
### N. <제목> (YYYY-MM-DD)
- **무엇을**: 
- **왜**: 
- **건드린 파일**: 
- **upstream PR 가능 여부**: 가능/불가(사유)
- **검증 방법**: 
-->
