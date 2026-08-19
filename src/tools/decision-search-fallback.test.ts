// N2 자체 패치 #5 테스트 — search_decisions 축약 재검색 사다리
import { describe, expect, it } from "vitest"
import type { LawApiClient } from "../lib/api-client.js"
import { compactRetryQueries, withCompactFallback } from "./decision-search-fallback.js"

const API = {} as LawApiClient

function notFound(query: string) {
  return { content: [{ type: "text", text: `[NOT_FOUND] '${query}' 검색 결과가 없습니다.` }], isError: true as const }
}
function found(query: string) {
  return { content: [{ type: "text", text: `검색 결과 (총 14건): ${query}` }] }
}

describe("compactRetryQueries", () => {
  it("3어절 이상은 [앞 2어절, 첫 어절] 사다리", () => {
    expect(compactRetryQueries("판매후리스 세금계산서 공급자")).toEqual(["판매후리스 세금계산서", "판매후리스"])
  })
  it("2어절은 첫 어절만", () => {
    expect(compactRetryQueries("가지급금 인정이자")).toEqual(["가지급금"])
  })
  it("1어절은 재시도 없음", () => {
    expect(compactRetryQueries("부당행위계산부인")).toEqual([])
  })
})

describe("withCompactFallback", () => {
  it("첫 검색이 성공하면 재시도하지 않는다", async () => {
    const calls: string[] = []
    const wrapped = withCompactFallback(async (_api, args) => { calls.push(args.query); return found(args.query) })
    const res = await wrapped(API, { query: "판매후리스 세금계산서 공급자" })
    expect(calls).toEqual(["판매후리스 세금계산서 공급자"])
    expect(res.content[0].text).not.toContain("축약 재검색")
  })

  it("0건이면 사다리로 재시도하고 축약 사실을 결과 머리에 명시한다", async () => {
    const calls: string[] = []
    const wrapped = withCompactFallback(async (_api, args) => {
      calls.push(args.query)
      return args.query === "판매후리스" ? found(args.query) : notFound(args.query)
    })
    const res = await wrapped(API, { query: "판매후리스 세금계산서 공급자" })
    expect(calls).toEqual(["판매후리스 세금계산서 공급자", "판매후리스 세금계산서", "판매후리스"])
    expect(res.isError).toBeUndefined()
    expect(res.content[0].text).toContain("축약 재검색")
    expect(res.content[0].text).toContain("'판매후리스'(으)로 재시도")
    expect(res.content[0].text).toContain("총 14건")
  })

  it("사다리 전부 0건이면 원 NOT_FOUND 결과를 그대로 반환한다", async () => {
    const wrapped = withCompactFallback(async (_api, args) => notFound(args.query))
    const res = await wrapped(API, { query: "가 나 다" })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain("[NOT_FOUND] '가 나 다'")
  })

  it("NOT_FOUND가 아닌 오류(API 실패 등)에는 재시도하지 않는다", async () => {
    const calls: string[] = []
    const wrapped = withCompactFallback(async (_api, args) => {
      calls.push(args.query)
      return { content: [{ type: "text", text: "[ERROR] 타임아웃" }], isError: true }
    })
    await wrapped(API, { query: "가지급금 인정이자 부당행위" })
    expect(calls).toHaveLength(1)
  })

  it("재시도 중 NOT_FOUND 아닌 오류가 나면 사다리를 중단하고 중단 사유를 병기한다 (Codex 차단 2 회귀 방지)", async () => {
    const calls: string[] = []
    const wrapped = withCompactFallback(async (_api, args) => {
      calls.push(args.query)
      if (calls.length === 1) return notFound(args.query)
      return { content: [{ type: "text", text: "[ERROR] API 요청 한도 초과 (429)" }], isError: true }
    })
    const res = await wrapped(API, { query: "판매후리스 세금계산서 공급자" })
    // 429 뒤 첫 어절("판매후리스") 재시도까지 가면 안 된다 — 쿼터 소진 방지
    expect(calls).toEqual(["판매후리스 세금계산서 공급자", "판매후리스 세금계산서"])
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain("[NOT_FOUND] '판매후리스 세금계산서 공급자'")
    // 오류를 "0건"으로 은폐하지 않는다 (Codex 재검토 차단 1) — 중단 사유가 결과에 남아야 함
    const noteText = res.content.map(c => c.text).join("\n")
    expect(noteText).toContain("축약 재검색('판매후리스 세금계산서') 시도가 오류로 중단됨")
    expect(noteText).toContain("429")
  })

  it("재시도 중 예외가 나면 사다리를 중단하고 중단 사유를 병기한다 (오류 은폐 금지)", async () => {
    let first = true
    const wrapped = withCompactFallback(async (_api, args) => {
      if (first) { first = false; return notFound(args.query) }
      throw new Error("네트워크 오류")
    })
    const res = await wrapped(API, { query: "판매후리스 세금계산서 공급자" })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain("[NOT_FOUND]")
    const noteText = res.content.map(c => c.text).join("\n")
    expect(noteText).toContain("오류로 중단됨")
    expect(noteText).toContain("네트워크 오류")
  })

  it("query가 없으면 그대로 통과한다", async () => {
    const calls: unknown[] = []
    const wrapped = withCompactFallback(async (_api, args) => { calls.push(args.query); return notFound("") })
    await wrapped(API, { gana: "ga" })
    expect(calls).toHaveLength(1)
  })
})
