// N2 자체 패치 #4 테스트 — verify_citations 행정규칙 인용 검증
import { describe, expect, it } from "vitest"
import type { LawApiClient } from "../lib/api-client.js"
import { isAdminRuleName, tryVerifyAdminRuleCitation, verifyAdminRuleCitation } from "./admin-rule-citation.js"
import { parseCitations } from "./verify-citations.js"

const MATCH_XML = `<?xml version="1.0" encoding="UTF-8"?>
<AdmRulSearch>
<admrul id="1">
<행정규칙명>식품등의 표시기준</행정규칙명>
<행정규칙일련번호>2100000000000</행정규칙일련번호>
<발령일자>20240115</발령일자>
<행정규칙종류>고시</행정규칙종류>
<소관부처명>식품의약품안전처</소관부처명>
</admrul>
</AdmRulSearch>`

const EMPTY_XML = `<?xml version="1.0" encoding="UTF-8"?><AdmRulSearch><totalCnt>0</totalCnt></AdmRulSearch>`

function stubClient(xml: string): LawApiClient {
  return { searchAdminRule: async () => xml } as unknown as LawApiClient
}

describe("isAdminRuleName", () => {
  it("행정규칙 접미사를 인식한다", () => {
    expect(isAdminRuleName("식품등의 표시기준")).toBe(true)
    expect(isAdminRuleName("법인세법 기본통칙")).toBe(true)
    expect(isAdminRuleName("국세청 고시")).toBe(true)
    expect(isAdminRuleName("개인정보 보호지침")).toBe(true)
  })
  it("법령 접미사는 행정규칙으로 보지 않는다", () => {
    expect(isAdminRuleName("법인세법")).toBe(false)
    expect(isAdminRuleName("법인세법 시행규칙")).toBe(false)
    expect(isAdminRuleName("서울특별시 조례")).toBe(false)
  })
})

describe("parseCitations 행정규칙 추출 (접미사 확장)", () => {
  it("「식품등의 표시기준」 제N조에서 규칙명을 추출한다", () => {
    const cites = parseCitations("「식품등의 표시기준」 제4조에 따라 표시하여야 한다.", 15)
    expect(cites).toHaveLength(1)
    expect(cites[0].lawName).toBe("식품등의 표시기준")
  })
  it("기존 법령 추출은 그대로 동작한다", () => {
    const cites = parseCitations("법인세법 제19조에 따른 손금", 15)
    expect(cites[0].lawName).toBe("법인세법")
  })
})

describe("tryVerifyAdminRuleCitation", () => {
  it("행정규칙 DB에 실존하면 ✓ + 명칭만 확인했음을 명시한다", async () => {
    const result = await tryVerifyAdminRuleCitation(
      stubClient(MATCH_XML), ["식품등의 표시기준"], "식품등의 표시기준 제4조"
    )
    expect(result).toContain("✓")
    expect(result).toContain("행정규칙 「식품등의 표시기준」 실존")
    expect(result).toContain("명칭 실존만 확인")
  })
  it("미발견이면 null (호출자가 폴백 계속)", async () => {
    const result = await tryVerifyAdminRuleCitation(
      stubClient(EMPTY_XML), ["가상의무언가고시명"], "라벨"
    )
    expect(result).toBeNull()
  })
})

describe("verifyAdminRuleCitation", () => {
  it("확실 접미사(고시)는 미발견 시 ✗ NOT_FOUND", async () => {
    const result = await verifyAdminRuleCitation(
      stubClient(EMPTY_XML), ["존재하지않는국세청고시"], "라벨A", "존재하지않는국세청고시"
    )
    expect(result.startsWith("✗")).toBe(true)
    expect(result).toContain("NOT_FOUND")
  })
  it("모호 접미사(기준)는 미발견 시 ⚠로만 보고 (일반 명사 오탐 방지)", async () => {
    const result = await verifyAdminRuleCitation(
      stubClient(EMPTY_XML), ["애매한판단기준"], "라벨B", "애매한판단기준"
    )
    expect(result.startsWith("⚠")).toBe(true)
    expect(result).toContain("확인 실패")
  })
  it("검색 실패는 ⚠로 보고한다 (검증 불가 ≠ 환각)", async () => {
    const client = { searchAdminRule: async () => { throw new Error("네트워크 오류") } } as unknown as LawApiClient
    const result = await verifyAdminRuleCitation(client, ["아무고시"], "라벨C", "아무고시")
    expect(result.startsWith("⚠")).toBe(true)
  })
})
