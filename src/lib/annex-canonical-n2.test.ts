// N2 자체 패치 #7 시험 — 별표 정본 응답 구조 검증 (docs/N2-PATCHES.md)
import { describe, expect, it, vi } from "vitest"
import type { LawApiClient } from "./api-client.js"
import { fetchLawAnnexUnits } from "./annex-canonical.js"
import { parseCanonicalLawJson, skippedAnnexUnits, soleZeroCodeUnit } from "./annex-canonical-n2.js"

const unit = (no: string, extra: Record<string, unknown> = {}) => ({
  별표번호: no, 별표가지번호: "00", 별표구분: "별표", 별표제목: `별표 ${no}`,
  별표서식파일링크: `/LSW/flDownload.do?flSeq=${no}`, ...extra,
})
const lawJson = (units: unknown) => JSON.stringify({ 법령: { 별표: { 별표단위: units } } })

let seq = 0
function stub(text: string) {
  const fetchApi = vi.fn(async () => text)
  // lawCache 가 전역이라 시험마다 다른 MST 를 쓴다
  return { client: { fetchApi } as unknown as LawApiClient, fetchApi, mst: `N2T7-${Date.now()}-${++seq}` }
}

describe("fetchLawAnnexUnits — 정본 구조 검증 (N2 패치 7)", () => {
  it("정상 응답은 별표단위를 돌려주고 캐시한다", async () => {
    const { client, fetchApi, mst } = stub(lawJson([unit("0001"), unit("0002")]))
    expect((await fetchLawAnnexUnits(client, mst)).map(u => u.code6)).toEqual(["000100", "000200"])
    await fetchLawAnnexUnits(client, mst)
    expect(fetchApi).toHaveBeenCalledTimes(1)
  })

  it("링크 없는 항목(삭제 별표 등)이 섞여도 실패가 아니다 — 상류 파서처럼 그 항목만 걸러진다", async () => {
    const { client, mst } = stub(lawJson([unit("0001"), unit("0002", { 별표서식파일링크: "", 별표제목: "삭제" })]))
    expect((await fetchLawAnnexUnits(client, mst)).map(u => u.code6)).toEqual(["000100"])
  })

  it("본번 0 코드(000000) 항목이 섞여도 실패가 아니다 (여권법 시행령 단일 무번호 별표)", async () => {
    const { client, mst } = stub(lawJson(unit("0000")))
    await expect(fetchLawAnnexUnits(client, mst)).resolves.toEqual([])
    const mixed = stub(lawJson([unit("0001"), unit("0000")]))
    expect((await fetchLawAnnexUnits(mixed.client, mixed.mst)).map(u => u.code6)).toEqual(["000100"])
  })

  it("별표가 없는 법령은 0건(정본 대조 완료)", async () => {
    const { client, mst } = stub(JSON.stringify({ 법령: { 기본정보: {} } }))
    await expect(fetchLawAnnexUnits(client, mst)).resolves.toEqual([])
  })

  it("JSON 오류·오류 봉투는 0건이 아니라 조회 실패(throw)", async () => {
    const broken = stub("<html>점검 중</html>")
    await expect(fetchLawAnnexUnits(broken.client, broken.mst)).rejects.toThrow("JSON 해석 불가")
    const envelope = stub(JSON.stringify({ result: "실패", msg: "인증키 오류" }))
    await expect(fetchLawAnnexUnits(envelope.client, envelope.mst)).rejects.toThrow("법령 구조 확인 불가")
  })

  it("항목은 있는데 링크 필드 자체가 모두 사라졌으면 형식 변경으로 보고 throw", async () => {
    const { client, fetchApi, mst } = stub(lawJson([{ 별표번호: "0001", 별표가지번호: "00", 별표구분: "별표", 별표제목: "x" }]))
    await expect(fetchLawAnnexUnits(client, mst)).rejects.toThrow("링크 필드 확인 불가")
    // 실패는 캐시하지 않는다
    await expect(fetchLawAnnexUnits(client, mst)).rejects.toThrow()
    expect(fetchApi).toHaveBeenCalledTimes(2)
  })
})

describe("parseCanonicalLawJson", () => {
  it("별표·별표단위가 객체가 아니면 throw", () => {
    expect(() => parseCanonicalLawJson(JSON.stringify({ 법령: { 별표: "없음" } }))).toThrow("별표 구조")
    expect(() => parseCanonicalLawJson(JSON.stringify({ 법령: { 별표: { 별표단위: ["x"] } } }))).toThrow("별표단위 구조")
    expect(() => parseCanonicalLawJson(JSON.stringify({ 법령: [] }))).toThrow("법령 구조")
  })
})

describe("걸러진 항목 추적 (적대적 검토 r1 B1·B2)", () => {
  it("걸러진 항목을 번호·사유와 함께 붙이고, 캐시된 배열에서도 그대로 읽힌다", async () => {
    const { client, fetchApi, mst } = stub(lawJson([unit("0001"), unit("0002", { 별표서식파일링크: "" }), unit("0000")]))
    const units = await fetchLawAnnexUnits(client, mst)
    expect(skippedAnnexUnits(units).map(s => [s.code6, s.reason])).toEqual([["000200", "no_link"], ["000000", "zero_code"]])
    expect(soleZeroCodeUnit(units)?.hwpLink).toBe("/LSW/flDownload.do?flSeq=0000")
    const again = await fetchLawAnnexUnits(client, mst)
    expect(fetchApi).toHaveBeenCalledTimes(1)
    expect(skippedAnnexUnits(again)).toHaveLength(2)
  })

  it("무번호 별표가 2건 이상이면 어느 쪽인지 정할 수 없어 짝짓지 않는다", async () => {
    const { client, mst } = stub(lawJson([unit("0001"), unit("0000", { 별표제목: "a" }), unit("0000", { 별표제목: "b", 별표서식파일링크: "/x" })]))
    expect(soleZeroCodeUnit(await fetchLawAnnexUnits(client, mst))).toBeUndefined()
  })

  it("링크 키가 없는 항목이 하나라도 있으면 캐시하지 않는다", async () => {
    const noKey = { 별표번호: "0002", 별표가지번호: "00", 별표구분: "별표", 별표제목: "x" }
    const { client, fetchApi, mst } = stub(lawJson([unit("0001"), noKey]))
    const units = await fetchLawAnnexUnits(client, mst)
    expect(skippedAnnexUnits(units).map(s => s.reason)).toEqual(["no_link_key"])
    await fetchLawAnnexUnits(client, mst)
    expect(fetchApi).toHaveBeenCalledTimes(2)
  })

  it("별표 요소가 빈 문자열·빈 배열이면 별표 없음(예외 아님)", async () => {
    for (const annex of ["", [], {}]) {
      const s = stub(JSON.stringify({ 법령: { 별표: annex } }))
      await expect(fetchLawAnnexUnits(s.client, s.mst)).resolves.toEqual([])
    }
  })
})
