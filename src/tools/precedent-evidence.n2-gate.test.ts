// N2 자체 패치 #2 연결부 시험 — fetchPrecedentEvidence 의 relevanceGate (docs/N2-PATCHES.md)
import { describe, expect, it } from "vitest"
import type { LawApiClient } from "../lib/api-client.js"
import { fetchPrecedentEvidence } from "./precedent-evidence.js"
import type { PrecedentHit, StructuredPrecedentSearchResult } from "./precedent-search-core.js"

// precedentCache 가 전역이라 시험 파일 고유 id 를 쓴다
const BODIES: Record<string, string> = {
  "N2G-1": "퇴직금 중간정산의 효력에 관하여 근로자가 퇴직금을 중간정산 받은 경우",
  "N2G-2": "금지금 거래에서 가공세금계산서를 수취한 경우 매입세액 불공제",
}

const client = {
  async fetchApi({ extraParams }: { extraParams?: Record<string, string> }) {
    const id = extraParams?.ID ?? ""
    return JSON.stringify({ PrecService: {
      사건명: `사건 ${id}`, 사건번호: `2020두${id.slice(-1)}`, 법원명: "대법원", 선고일자: "20200101",
      판시사항: BODIES[id] ?? "",
    } })
  },
} as unknown as LawApiClient

const hit = (id: string, sourceQuery?: string): PrecedentHit => ({ id, title: `판례 ${id}`, searchMode: 1, sourceQuery })
const result = (hits: PrecedentHit[], query?: string): StructuredPrecedentSearchResult => ({
  originalArgs: { query } as StructuredPrecedentSearchResult["originalArgs"],
  totalCount: hits.length, page: 1, hits, attempts: [], fallbackUsed: false,
})

describe("fetchPrecedentEvidence relevanceGate (N2 패치 2)", () => {
  const q = "퇴직금을 중간정산하는 경우"
  const hits = [hit("N2G-1", q), hit("N2G-2", q)]

  it("무관 판례만 전문을 생략하고 건수·직접 조회 안내를 붙인다", async () => {
    const evidence = await fetchPrecedentEvidence(client, result(hits, q), { relevanceGate: true })
    expect(evidence?.text).toContain("관련성 미확인 1건 전문 생략")
    expect(evidence?.text).toContain("퇴직금 중간정산의 효력")
    expect(evidence?.text).not.toContain("가공세금계산서")
    expect(evidence?.text).toContain('get_decision_text(domain="precedent", id="N2G-2")')
    expect(evidence?.items.map(item => !!item.gated)).toEqual([false, true])
  })

  it("relevanceGate 를 켜지 않으면 종전대로 전문을 모두 붙인다 (검증 경로)", async () => {
    const evidence = await fetchPrecedentEvidence(client, result(hits, q))
    expect(evidence?.text).toContain("가공세금계산서")
    expect(evidence?.text).not.toContain("관련성 미확인")
  })

  it("원 질의를 비운 병합 결과(document_review)는 hit 별 검색어로만 대조한다", async () => {
    const merged = result([hit("N2G-1", "퇴직금 중간정산"), hit("N2G-2", "가공세금계산서 매입세액")], undefined)
    const evidence = await fetchPrecedentEvidence(client, merged, { relevanceGate: true })
    expect(evidence?.items.map(item => !!item.gated)).toEqual([false, false])
  })
})
