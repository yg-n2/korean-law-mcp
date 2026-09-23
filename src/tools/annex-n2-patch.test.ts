// [N2 패치 2026-09-23] 별표 오선택(N1)·정본 대조 실패의 부존재 단정(N2) 회귀 시험.
// upstream 테스트와 분리해 두어 sync-upstream rebase 충돌을 줄인다.
import { describe, expect, it } from "vitest"
import { getAnnexes } from "./annex.js"
import { findMatchingAnnex, hasIdentifiableAnnexNumber, type AnnexItem } from "./annex-select.js"
import { readExecutionLimits } from "../lib/execution-limits.js"
import type { LawApiClient } from "../lib/api-client.js"

describe("N1: 유일 별표 폴백은 번호 없는 별표에만", () => {
  it("제목 안의 별표 참조나 조문 번호를 항목 자체 번호로 오인하지 않는다", () => {
    for (const title of ["수수료(별표 2 관련)", "별표 제39조 관련 수수료"]) {
      const item = { 별표번호: "", 별표명: title, 별표종류: "별표" }
      expect(hasIdentifiableAnnexNumber(item)).toBe(false)
      expect(findMatchingAnnex([item], "별표 1")).toBe(item)
    }
  })

  const ONLY_1: AnnexItem[] = [{ 별표번호: "000100", 별표명: "[별표 1] 과태료 부과기준", 별표종류: "별표" }]

  it("번호 있는 유일 별표 1을 '별표 2' 요청에 돌려주지 않는다", () => {
    expect(findMatchingAnnex(ONLY_1, "2")).toBeUndefined()
    expect(findMatchingAnnex(ONLY_1, "별표 2")).toBeUndefined()
  })

  it("6자리 가지번호 코드(000102)도 별표 1로 대체하지 않는다", () => {
    expect(findMatchingAnnex(ONLY_1, "000102")).toBeUndefined()
    expect(findMatchingAnnex(ONLY_1, "1의2")).toBeUndefined()
  })

  it("정확히 일치하면 그대로 선택한다 (회귀 없음)", () => {
    expect(findMatchingAnnex(ONLY_1, "1")?.별표번호).toBe("000100")
    expect(findMatchingAnnex(ONLY_1, "000100")?.별표번호).toBe("000100")
  })

  it("별표번호 코드는 없고 제목에만 번호가 있어도 번호 있는 별표로 본다", () => {
    const titled: AnnexItem[] = [{ 별표번호: "", 별표명: "[별표 3] 수수료", 별표종류: "별표" }]
    expect(hasIdentifiableAnnexNumber(titled[0])).toBe(true)
    expect(findMatchingAnnex(titled, "5")).toBeUndefined()
  })

  it("번호 없는 단일 별표는 원래 취지대로 폴백한다", () => {
    const unnumbered: AnnexItem[] = [{ 별표번호: "", 별표명: "수수료 및 사무의 대행에 드는 비용(제39조 관련)", 별표종류: "별표" }]
    expect(hasIdentifiableAnnexNumber(unnumbered[0])).toBe(false)
    expect(findMatchingAnnex(unnumbered, "별표1")?.별표명).toContain("수수료")
  })
})

// licbyl 색인: 별표 1·3만 있음 (별표 2 없음)
const licbyl = (mst = "283481") => JSON.stringify({
  licBylSearch: {
    resultMsg: "success",
    licbyl: [
      { 별표번호: "000100", 별표명: "[별표 1] 가", 별표종류: "별표",
        별표서식파일링크: "/LSW/flDownload.do?flSeq=1", 관련법령명: "소득세법 시행령", 관련법령일련번호: mst },
      { 별표번호: "000300", 별표명: "[별표 3] 다", 별표종류: "별표",
        별표서식파일링크: "/LSW/flDownload.do?flSeq=3", 관련법령명: "소득세법 시행령", 관련법령일련번호: mst },
    ],
  },
})

const lawBodyWithout2 = JSON.stringify({
  법령: { 별표: { 별표단위: [
    { 별표번호: "0001", 별표가지번호: "00", 별표구분: "별표", 별표제목: "가", 별표서식파일링크: "/LSW/flDownload.do?flSeq=1" },
    { 별표번호: "0003", 별표가지번호: "00", 별표구분: "별표", 별표제목: "다", 별표서식파일링크: "/LSW/flDownload.do?flSeq=3" },
  ] } },
})

const stub = (fetchApi: () => Promise<string>, mst = "283481") => ({
  getAnnexes: async () => licbyl(mst),
  fetchApi,
}) as unknown as LawApiClient

describe("N2: 정본 대조를 못 끝내면 '없음' 대신 '확인 불가'", () => {
  it.each(["not-json", "{}", JSON.stringify({ 법령: { 별표: { 별표단위: [{ 별표번호: "0002", 별표제목: "링크 없음" }] } } })])(
    "정본 응답이 손상됐거나 링크가 없어도 부존재로 단정하지 않는다: %s", async (body) => {
      const r = await getAnnexes(stub(async () => body), { lawName: "소득세법 시행령", bylSeq: "000200" } as never)
      expect(r.content[0].text).toContain("[확인 불가]")
      expect(r.content[0].text).not.toContain("[NOT_FOUND]")
    },
  )
  it("정본 조회가 실패하면 NOT_FOUND가 아니라 확인 불가", async () => {
    const r = await getAnnexes(stub(async () => { throw new Error("body budget exceeded") }), {
      lawName: "소득세법 시행령", bylSeq: "000200",
    } as never)
    const text = r.content[0].text
    expect(r.isError).toBe(true)
    expect(text).toContain("[확인 불가]")
    expect(text).toContain("현행 본문 조회 실패")
    expect(text).not.toContain("[NOT_FOUND]")
    expect(text).not.toContain("'해당 데이터 없음'을 사용자에게 명시")
  })

  it("법령일련번호가 없어 대조를 못 해도 확인 불가", async () => {
    const r = await getAnnexes(stub(async () => lawBodyWithout2, ""), {
      lawName: "소득세법 시행령", bylSeq: "000200",
    } as never)
    expect(r.content[0].text).toContain("[확인 불가]")
    expect(r.content[0].text).toContain("법령일련번호 미확정")
  })

  it("정본 대조까지 끝났는데도 없으면 NOT_FOUND 유지", async () => {
    const r = await getAnnexes(stub(async () => lawBodyWithout2), {
      lawName: "소득세법 시행령", bylSeq: "000200",
    } as never)
    expect(r.content[0].text).toContain("[NOT_FOUND]")
    expect(r.content[0].text).not.toContain("[확인 불가]")
  })
})

describe("L2: 실제 기동 본문 한도 기본값 8MiB/32MiB", () => {
  it("env가 없으면 단일 응답 8MiB, 요청 합계 32MiB", () => {
    const l = readExecutionLimits({})
    expect(l.maxUpstreamBodyBytes).toBe(8 * 1024 * 1024)
    expect(l.maxTotalUpstreamBodyBytes).toBe(32 * 1024 * 1024)
  })

  it("3MB급 대형 시행령 본문이 한도 안에 든다 (2026-09-02 실측 3,080,999B)", () => {
    expect(readExecutionLimits({}).maxUpstreamBodyBytes).toBeGreaterThan(3_080_999)
  })

  it("env가 있으면 env 값이 우선한다", () => {
    const l = readExecutionLimits({ MCP_MAX_UPSTREAM_BODY_BYTES: "2097152", MCP_MAX_TOTAL_UPSTREAM_BODY_BYTES: "8388608" })
    expect(l.maxUpstreamBodyBytes).toBe(2097152)
    expect(l.maxTotalUpstreamBodyBytes).toBe(8388608)
  })

  it("단일 한도만 env로 합계 기본(32MiB)보다 크게 주면 기존 검증대로 거부", () => {
    expect(() => readExecutionLimits({ MCP_MAX_UPSTREAM_BODY_BYTES: String(40 * 1024 * 1024) })).toThrow(/at least/)
  })
})
