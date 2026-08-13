import { describe, it, expect } from "vitest"
import { parseNtstDcmId } from "./nts-body.js"

// N2 자체 패치 #1 — id 입력 해석 규칙 (docs/N2-PATCHES.md)
describe("parseNtstDcmId", () => {
  it("taxlaw 상세 링크에서 ntstDcmId를 추출한다", () => {
    expect(
      parseNtstDcmId("https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000515153")
    ).toBe("010000000000515153")
  })

  it("다른 쿼리 파라미터가 섞인 링크에서도 추출한다", () => {
    expect(
      parseNtstDcmId("https://taxlaw.nts.go.kr/qt/USEQTA002P.do?foo=1&ntstDcmId=010000000000515153&bar=2")
    ).toBe("010000000000515153")
  })

  it("ntstDcmId 원시값(12자리 이상 숫자)을 그대로 통과시킨다", () => {
    expect(parseNtstDcmId("010000000000515153")).toBe("010000000000515153")
    expect(parseNtstDcmId("  010000000000515153  ")).toBe("010000000000515153")
  })

  it("법제처 일련번호(짧은 숫자)는 null — 자동 변환 불가", () => {
    expect(parseNtstDcmId("515153")).toBeNull()
    expect(parseNtstDcmId("1234567")).toBeNull()
  })

  it("숫자가 아닌 입력은 null", () => {
    expect(parseNtstDcmId("법인세과-352")).toBeNull()
    expect(parseNtstDcmId("")).toBeNull()
  })
})
