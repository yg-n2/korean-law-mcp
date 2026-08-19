// N2 자체 패치 #2 테스트 — 무관 판례 전문 자동첨부 게이트
import { describe, expect, it } from "vitest"
import { gateTermGroupsForHit, passesRelevanceGate } from "./precedent-relevance-gate.js"
import type { PrecedentHit, StructuredPrecedentSearchResult } from "./precedent-search-core.js"

function makeHit(overrides: Partial<PrecedentHit> = {}): PrecedentHit {
  return {
    id: "12345",
    title: "판례 제목",
    searchMode: 1,
    ...overrides,
  }
}

function makeResult(overrides: Partial<StructuredPrecedentSearchResult> = {}): StructuredPrecedentSearchResult {
  return {
    originalArgs: {} as StructuredPrecedentSearchResult["originalArgs"],
    totalCount: 1,
    page: 1,
    hits: [],
    attempts: [],
    fallbackUsed: false,
    ...overrides,
  }
}

function withOriginalQuery(query: string): StructuredPrecedentSearchResult {
  return makeResult({ originalArgs: { query } as StructuredPrecedentSearchResult["originalArgs"] })
}

describe("gateTermGroupsForHit", () => {
  it("hit의 sourceQuery 토큰을 각각 독립 그룹(AND)으로 만든다", () => {
    const hit = makeHit({ sourceQuery: "판매후리스 세금계산서 공급자" })
    const groups = gateTermGroupsForHit(hit, makeResult())
    expect(groups).toEqual([["판매후리스"], ["세금계산서"], ["공급자"]])
  })

  it("semanticAnchor도 필수 토큰에 포함한다 (중복은 제거)", () => {
    const hit = makeHit({ sourceQuery: "가지급금 인정이자", semanticAnchor: "가지급금" })
    const groups = gateTermGroupsForHit(hit, makeResult())
    expect(groups).toEqual([["가지급금"], ["인정이자"]])
  })

  it("성공 시도의 validationTermGroups가 있고 검색어가 일치하면 그걸 우선 사용한다", () => {
    const attempt = {
      query: "판매후리스",
      search: 1 as const,
      reason: "test",
      totalCount: 1,
      hitCount: 1,
      success: true,
      validationTermGroups: [["판매후리스", "세일앤리스백"]],
    }
    const hit = makeHit({ sourceQuery: "판매후리스" })
    const groups = gateTermGroupsForHit(hit, makeResult({ successfulAttempt: attempt as never }))
    expect(groups).toEqual([["판매후리스", "세일앤리스백"]])
  })

  it("validationTermGroups가 있어도 hit의 검색어가 다르면 hit 기준 토큰으로 대조한다", () => {
    const attempt = {
      query: "다른검색어",
      search: 1 as const,
      reason: "test",
      totalCount: 1,
      hitCount: 1,
      success: true,
      validationTermGroups: [["다른검색어"]],
    }
    const hit = makeHit({ sourceQuery: "판매후리스 세금계산서" })
    const groups = gateTermGroupsForHit(hit, makeResult({ successfulAttempt: attempt as never }))
    expect(groups).toEqual([["판매후리스"], ["세금계산서"]])
  })

  it("대조 기준을 만들 수 없으면 빈 배열을 반환한다", () => {
    const hit = makeHit()
    expect(gateTermGroupsForHit(hit, makeResult())).toEqual([])
  })

  it("짧은 원 질의(3어절 이하)의 토큰을 대조 기준에 합친다 (중복 제거)", () => {
    const hit = makeHit({ sourceQuery: "세금계산서" })
    const groups = gateTermGroupsForHit(hit, withOriginalQuery("판매후리스 세금계산서"))
    expect(groups).toEqual([["세금계산서"], ["판매후리스"]])
  })

  it("긴 자연어 원 질의는 planner 핵심 키워드로 변별 토큰만 추출한다", () => {
    const hit = makeHit({ sourceQuery: "세금계산서" })
    const groups = gateTermGroupsForHit(
      hit,
      withOriginalQuery("판매후리스 거래에서 세금계산서 발급 시 공급자와 공급받는 자는 누구인가")
    )
    const flat = groups.flat()
    expect(flat).toContain("판매후리스")
    expect(flat).not.toContain("누구인가")
    expect(flat).not.toContain("거래에서")
  })
})

describe("passesRelevanceGate", () => {
  const searchResult = makeResult()

  it("본문에 모든 토큰이 있으면 통과한다 (공백·표기 차이 무시)", () => {
    const hit = makeHit({ sourceQuery: "판매후리스 세금계산서 공급자" })
    const body = "사업자가 판매 후 리스 거래에서 세금계산서를 교부할 때 공급자 및 공급받는 자는…"
    expect(passesRelevanceGate(body, hit, searchResult)).toBe(true)
  })

  it("핵심 토큰이 본문에 없으면 차단한다 (무관 판결문 시나리오)", () => {
    const hit = makeHit({ sourceQuery: "판매후리스 세금계산서 공급자" })
    const body = "금지금 가공거래에서 허위 세금계산서를 수취한 공급자에 대한 부가가치세 부과처분…"
    expect(passesRelevanceGate(body, hit, searchResult)).toBe(false)
  })

  it("대조 기준이 없으면 게이트를 적용하지 않는다 (기존 동작 유지)", () => {
    const hit = makeHit()
    expect(passesRelevanceGate("아무 본문", hit, searchResult)).toBe(true)
  })

  it("완화된 폴백 검색어로 잡힌 무관 판례를 원 질의 변별 토큰으로 차단한다 (실측 재현)", () => {
    // legal_research가 원 질문을 보존한 채 폴백이 "세금계산서"로 완화된 상황
    const result = withOriginalQuery("판매후리스 거래에서 세금계산서 발급 시 공급자와 공급받는 자는 누구인가")
    const hit = makeHit({ sourceQuery: "세금계산서" })
    const irrelevantBody = "실물거래 없이 수취한 세금계산서이므로 부가가치세 부과처분은 적법함 (마스크 가공거래)"
    const relevantBody = "판매 후 리스 거래에서 세금계산서 교부 시 자기를 공급자 및 공급받는 자로 하여…"
    expect(passesRelevanceGate(irrelevantBody, hit, result)).toBe(false)
    expect(passesRelevanceGate(relevantBody, hit, result)).toBe(true)
  })

  it("구어체 의문 어미는 대조 기준에서 제외한다 (Opus 차단 2 회귀 방지)", () => {
    const hit = makeHit({ sourceQuery: "식대 비과세 되나요" })
    expect(gateTermGroupsForHit(hit, makeResult())).toEqual([["식대"], ["비과세"]])
    const body = "사용자가 근로자에게 지급한 식대는 월 20만원까지 비과세 근로소득에 해당한다"
    expect(passesRelevanceGate(body, hit, makeResult())).toBe(true)
  })

  it("짧은 원 질의의 구어체 어미도 제외된다", () => {
    const hit = makeHit({ sourceQuery: "퇴직금" })
    const groups = gateTermGroupsForHit(hit, withOriginalQuery("퇴직금 중간정산 가능한가요"))
    expect(groups).toEqual([["퇴직금"], ["중간정산"]])
  })

  it("문장부호가 붙은 구어체 어미도 제외한다 (Codex 차단 1 회귀 방지)", () => {
    const hit = makeHit({ sourceQuery: "식대 비과세 되나요?" })
    expect(gateTermGroupsForHit(hit, makeResult())).toEqual([["식대"], ["비과세"]])
    const body = "사용자가 근로자에게 지급한 식대는 월 20만원까지 비과세 근로소득에 해당한다"
    expect(passesRelevanceGate(body, hit, makeResult())).toBe(true)
  })

  it("짧은 원 질의의 부호 붙은 어미도 제외된다", () => {
    const hit = makeHit({ sourceQuery: "퇴직금" })
    const groups = gateTermGroupsForHit(hit, withOriginalQuery("퇴직금 중간정산 가능한가요?"))
    expect(groups).toEqual([["퇴직금"], ["중간정산"]])
  })

  it("validationTermGroups 경로에서도 구어체 토큰은 제외된다 (Codex 권고 1)", () => {
    const attempt = {
      query: "판매후리스",
      search: 1 as const,
      reason: "test",
      totalCount: 1,
      hitCount: 1,
      success: true,
      validationTermGroups: [["판매후리스"], ["되나요?"]],
    }
    const hit = makeHit({ sourceQuery: "판매후리스" })
    const groups = gateTermGroupsForHit(hit, makeResult({ successfulAttempt: attempt as never }))
    expect(groups).toEqual([["판매후리스"]])
  })

  it("사건번호 지정 조회(검색어 없는 검색)는 게이트를 적용하지 않는다 (Opus 권고 4)", () => {
    const hit = makeHit() // sourceQuery 없음 + 성공 시도 query 없음 = 사건번호 조회
    const result = withOriginalQuery("판매후리스")
    expect(gateTermGroupsForHit(hit, result)).toEqual([])
    expect(passesRelevanceGate("판매후리스와 무관한 본문", hit, result)).toBe(true)
  })

  it("hit에 검색어가 없으면 성공 시도의 query로 폴백해 대조한다", () => {
    const attempt = {
      query: "부당행위계산부인",
      search: 1 as const,
      reason: "test",
      totalCount: 1,
      hitCount: 1,
      success: true,
    }
    const result = makeResult({ successfulAttempt: attempt as never })
    const hit = makeHit()
    expect(passesRelevanceGate("특수관계인 저가양도에 대한 부당행위계산부인 규정 적용", hit, result)).toBe(true)
    expect(passesRelevanceGate("전혀 무관한 산업재해 판결문", hit, result)).toBe(false)
  })
})
