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

<!-- 패치 항목 템플릿 (복사해서 사용)
### N. <제목> (YYYY-MM-DD)
- **무엇을**: 
- **왜**: 
- **건드린 파일**: 
- **upstream PR 가능 여부**: 가능/불가(사유)
- **검증 방법**: 
-->
