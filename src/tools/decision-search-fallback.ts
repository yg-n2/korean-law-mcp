// N2 자체 패치 #5 — search_decisions 축약 재검색 사다리 (docs/N2-PATCHES.md)
//
// 배경: 법제처 API는 공백 키워드를 AND로 처리해 자연어형 검색어는 0건이 되기 쉽다.
// 판례(precedent)는 precedent-search-core가 자동 폴백을 돌리지만, 예규(nts)·해석례
// (interpretation)·조세심판(tax_tribunal)은 noResultHint의 재시도 제안 문구만 반환하고
// 재검색은 LLM에 떠넘겼다. 실측: "판매후리스 세금계산서 공급자" 0건 / "판매후리스" 14건.
//
// 동작: 첫 검색이 [NOT_FOUND]면 검색어를 앞에서부터 줄여가며 재시도한다
// (앞 2어절 → 첫 어절, noResultHint의 자체 제안과 동일한 사다리). 성공 시 어떤
// 축약으로 찾았는지 결과 머리에 명시한다 (축약은 recall을 넓히므로 선별 경고 동반).
import type { LawApiClient } from "../lib/api-client.js"

interface LooseToolResponse {
  content: Array<{ type: string, text: string }>
  isError?: boolean
}
type SearchHandler = (api: LawApiClient, args: any) => Promise<LooseToolResponse>

function isNotFound(res: LooseToolResponse): boolean {
  if (!res.isError) return false
  return res.content?.some(item => typeof item.text === "string" && item.text.includes("[NOT_FOUND]")) ?? false
}

/** 축약 재시도 검색어: 앞 2어절 → 첫 어절 (2어절 이하면 첫 어절만, 1어절이면 없음) */
export function compactRetryQueries(query: string): string[] {
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return []
  const out: string[] = []
  if (tokens.length > 2) out.push(tokens.slice(0, 2).join(" "))
  out.push(tokens[0])
  return out
}

/** 검색 핸들러를 축약 재검색 사다리로 감싼다 (search_decisions 디스패치 전용). */
export function withCompactFallback(handler: SearchHandler): SearchHandler {
  return async (apiClient, args) => {
    const query = typeof args?.query === "string" ? args.query.trim() : ""
    const first = await handler(apiClient, args)
    if (!query || !isNotFound(first)) return first

    for (const retry of compactRetryQueries(query)) {
      let res: LooseToolResponse
      try {
        res = await handler(apiClient, { ...args, query: retry })
      } catch {
        // API 오류는 사다리를 중단하고 원 결과(NOT_FOUND 힌트)를 반환 — 오류 은폐 금지
        break
      }
      if (res.isError) continue

      const note =
        `⚠ 검색어 축약 재검색: '${query}'는 0건이라 '${retry}'(으)로 재시도한 결과입니다.\n` +
        `축약 검색은 범위가 넓어 원 질의와 무관한 결과가 섞일 수 있습니다 — 제목·일자로 선별하세요.\n\n`
      const [head, ...rest] = res.content
      return {
        ...res,
        content: [{ type: "text", text: note + (head?.text ?? "") }, ...rest],
      }
    }
    return first
  }
}
