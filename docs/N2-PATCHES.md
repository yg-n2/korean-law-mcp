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

<!-- 패치 항목 템플릿 (복사해서 사용)
### N. <제목> (YYYY-MM-DD)
- **무엇을**: 
- **왜**: 
- **건드린 파일**: 
- **upstream PR 가능 여부**: 가능/불가(사유)
- **검증 방법**: 
-->
