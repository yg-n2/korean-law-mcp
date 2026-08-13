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

### (없음 — 2026-08-13 기준)

브랜치 분기 시점: `ad2d620` (upstream v4.9.7). 아직 코드 패치 0건.
첫 패치 예정: 국세청 예규 본문 조회 (Phase 2 — `src/tools/nts-body.ts` 신규).

<!-- 패치 항목 템플릿 (복사해서 사용)
### N. <제목> (YYYY-MM-DD)
- **무엇을**: 
- **왜**: 
- **건드린 파일**: 
- **upstream PR 가능 여부**: 가능/불가(사유)
- **검증 방법**: 
-->
