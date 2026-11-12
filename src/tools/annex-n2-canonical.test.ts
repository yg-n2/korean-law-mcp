// N2 자체 패치 #7 — 정본에서 걸러진 별표 항목을 호출부가 "대조 완료"·"없음"으로 읽지 않는지 (getAnnexes 수준)
// 2026-11-12 적대적 검토 r1 B1·B2. 판정은 내려받은 링크 + 응답 문구로 한다.
// 여권법 시행령 실응답(2026-11-12): 색인 000000 → flSeq=161427905, 현행 본문 별표단위 1건 `0000` → flSeq=161544623.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
// 파일 파싱은 이 시험 대상이 아니다 — 머리글(경고 문구)까지 가도록 파서를 갈아 끼운다
vi.mock("kordoc", () => ({
  parse: async () => ({ success: true, fileType: "hwpx", markdown: ["| 구분 | 금액 |", "| --- | --- |", "| 가 | 1 |"].join("\n") }),
}))

import { getAnnexes } from "./annex.js"
import { lawCache } from "../lib/cache.js"
import type { LawApiClient } from "../lib/api-client.js"

type Item = { code: string, title: string, flSeq: string }
const LAW = "가나시험법 시행령"
const MST = "900001"

const licbyl = (items: Item[]) => JSON.stringify({
  licBylSearch: {
    resultMsg: "success",
    licbyl: items.map(it => ({
      별표번호: it.code, 별표명: it.title, 별표종류: "별표",
      별표서식파일링크: `/LSW/flDownload.do?flSeq=${it.flSeq}`, 관련법령명: LAW, 관련법령일련번호: MST,
    })),
  },
})
const lawBody = (units: Record<string, unknown>[]) => JSON.stringify({ 법령: { 기본정보: {}, 별표: { 별표단위: units } } })
const unit = (no: string, title: string, link: string | null | undefined) => ({
  별표번호: no, 별표가지번호: "00", 별표구분: "별표", 별표제목: title,
  ...(link === undefined ? {} : { 별표서식파일링크: link === null ? "" : `/LSW/flDownload.do?flSeq=${link}`, 별표서식PDF파일링크: "" }),
})

function client(index: Item[], body: string, calls: string[] = []): LawApiClient {
  return {
    getAnnexes: async () => licbyl(index),
    fetchApi: async (p: { target: string }) => { calls.push(p.target); return body },
  } as unknown as LawApiClient
}

let urls: string[] = []
beforeEach(() => {
  lawCache.clear()
  urls = []
  vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
    urls.push(String(url))
    return new Response("[별표] 본문", { status: 200, headers: { "content-type": "text/plain" } })
  }))
})
afterEach(() => vi.unstubAllGlobals())

const downloaded = (flSeq: string) => urls.some(u => u.endsWith(`flSeq=${flSeq}`))

describe("B1: 고른 별표가 정본에서 걸러졌을 때", () => {
  it("단일 무번호 별표(000000)는 색인 항목과 짝지어 정본 링크를 내려받는다 (여권법 시행령 실응답의 번호·링크)", async () => {
    const c = client([{ code: "000000", title: "수수료(제39조 관련)", flSeq: "161427905" }], lawBody([unit("0000", "수수료(제39조 관련)", "161544623")]))
    const r = await getAnnexes(c, { lawName: LAW, annexNo: "1" } as never)
    expect(downloaded("161544623")).toBe(true)
    expect(downloaded("161427905")).toBe(false)
    expect(r.content[0].text).toContain("| 가 | 1 |")
    expect(r.content[0].text).not.toContain("⚠️")
  })

  it("현행 본문에서 링크가 비어 있는(삭제된) 별표는 색인 링크를 쓰되 경고한다", async () => {
    const c = client(
      [{ code: "000100", title: "가", flSeq: "OLD1" }, { code: "000300", title: "다", flSeq: "OLD3" }],
      lawBody([unit("0001", "가", "NEW1"), unit("0003", "삭제", null)]),
    )
    const r = await getAnnexes(c, { lawName: LAW, bylSeq: "000300" } as never)
    expect(downloaded("OLD3")).toBe(true)
    expect(r.content[0].text).toContain("정본 링크를 확인하지 못했습니다")
    expect(r.content[0].text).toContain("삭제됐을 수 있음")
  })

  it("링크 키가 일부 항목에서 빠진 형식 변경이면 경고하고 그 결과를 캐시하지 않는다", async () => {
    const calls: string[] = []
    const c = client(
      [{ code: "000100", title: "가", flSeq: "OLD1" }, { code: "000300", title: "다", flSeq: "OLD3" }],
      lawBody([unit("0001", "가", "NEW1"), unit("0003", "다", undefined)]),
      calls,
    )
    const r = await getAnnexes(c, { lawName: LAW, bylSeq: "000300" } as never)
    expect(r.content[0].text).toContain("링크 필드 없음")
    await getAnnexes(c, { lawName: LAW, bylSeq: "000300" } as never)
    expect(calls.filter(t => t === "law")).toHaveLength(2)
  })

  it("고른 별표가 현행 본문 별표 목록에 아예 없으면 경고한다", async () => {
    const c = client(
      [{ code: "000100", title: "가", flSeq: "OLD1" }, { code: "000300", title: "다", flSeq: "OLD3" }],
      lawBody([unit("0001", "가", "NEW1")]),
    )
    const r = await getAnnexes(c, { lawName: LAW, bylSeq: "000300" } as never)
    expect(downloaded("OLD3")).toBe(true)
    expect(r.content[0].text).toContain("현행 본문 별표 목록에서 이 별표(000300)를 찾지 못했습니다")
  })

  it("정본에 있는 별표는 종전대로 정본 링크, 경고 없음", async () => {
    const c = client([{ code: "000100", title: "가", flSeq: "OLD1" }], lawBody([unit("0001", "가", "NEW1")]))
    const r = await getAnnexes(c, { lawName: LAW, bylSeq: "000100" } as never)
    expect(downloaded("NEW1")).toBe(true)
    expect(r.content[0].text).toContain("| 가 | 1 |")
    expect(r.content[0].text).not.toContain("⚠️")
  })
})

describe("B2: 걸러진 항목을 '없음'으로 단정하지 않는다", () => {
  const index = [{ code: "000100", title: "가", flSeq: "OLD1" }]
  const body = lawBody([unit("0001", "가", "NEW1"), unit("0002", "신설 나", undefined)])

  it("색인에 없는 신설 별표가 정본에서 링크 키만 빠졌으면 NOT_FOUND 대신 확인 불가", async () => {
    const r = await getAnnexes(client(index, body), { lawName: LAW, bylSeq: "000200" } as never)
    expect(r.content[0].text).toContain("[확인 불가]")
    expect(r.content[0].text).toContain("000200")
    expect(r.content[0].text).not.toContain("[NOT_FOUND]")
  })

  it("정본에서 링크가 빈(삭제된) 번호를 요청해도 확인 불가", async () => {
    const r = await getAnnexes(client(index, lawBody([unit("0001", "가", "NEW1"), unit("0002", "삭제", null)])), { lawName: LAW, bylSeq: "000200" } as never)
    expect(r.content[0].text).toContain("[확인 불가]")
  })

  it("정본에도 없는 번호는 종전대로 NOT_FOUND", async () => {
    const r = await getAnnexes(client(index, lawBody([unit("0001", "가", "NEW1")])), { lawName: LAW, bylSeq: "000200" } as never)
    expect(r.content[0].text).toContain("[NOT_FOUND]")
  })

  it("목록 조회는 걸러진 신설 별표가 빠졌음을 병합 경고로 알린다", async () => {
    const r = await getAnnexes(client(index, body), { lawName: LAW } as never)
    expect(r.content[0].text).toContain("신설 별표 병합 확인 불가")
    expect(r.content[0].text).toContain("000200")
  })

  it("목록 조회: 색인에 있는 무번호 별표나 삭제 별표는 경고하지 않는다", async () => {
    const c = client([{ code: "000000", title: "수수료", flSeq: "OLD0" }], lawBody([unit("0000", "수수료", "NEW0")]))
    const r = await getAnnexes(c, { lawName: LAW } as never)
    expect(r.content[0].text).not.toContain("병합 확인 불가")
  })
})

describe("B2: 기준일(date) 조회", () => {
  const row = (efYd: string) =>
    `<law id="x"><법령일련번호>${MST}</법령일련번호><법령명한글><![CDATA[${LAW}]]></법령명한글><법령ID>777777</법령ID>` +
    `<공포일자>20200101</공포일자><공포번호>1</공포번호><제개정구분명>일부개정</제개정구분명><시행일자>${efYd}</시행일자></law>`
  const dated = (body: string): LawApiClient => ({
    searchLaw: async () => `<LawSearch><totalCnt>1</totalCnt><law id="1"><법령일련번호>${MST}</법령일련번호><법령명한글><![CDATA[${LAW}]]></법령명한글><법령ID>777777</법령ID><법령구분명>대통령령</법령구분명></law></LawSearch>`,
    fetchApi: async (p: { target: string, extraParams?: Record<string, string> }) => {
      if (p.extraParams?.LID) return `<LawSearch><totalCnt>1</totalCnt>${row("20200101")}</LawSearch>`
      return body
    },
  }) as unknown as LawApiClient

  it("단일 무번호 별표만 있는 버전도 '별표 없음'이 아니라 그 별표를 보여 준다", async () => {
    const r = await getAnnexes(dated(lawBody([unit("0000", "수수료(제39조 관련)", "NEW0")])), { lawName: LAW, date: "2024-01-01" } as never)
    expect(r.content[0].text).not.toContain("[NOT_FOUND]")
    expect(r.content[0].text).toContain("수수료(제39조 관련)")
  })

  it("걸러진 항목만 있으면 '별표 없음' 대신 확인 불가", async () => {
    const r = await getAnnexes(dated(lawBody([unit("0001", "삭제", null)])), { lawName: LAW, date: "2024-01-01" } as never)
    expect(r.content[0].text).toContain("[확인 불가]")
    expect(r.content[0].text).not.toContain("별표·서식이 없습니다")
  })

  it("별표 요소 자체가 비어 있으면(\"\") 종전대로 별표 없음", async () => {
    const r = await getAnnexes(dated(JSON.stringify({ 법령: { 기본정보: {}, 별표: "" } })), { lawName: LAW, date: "2024-01-01" } as never)
    expect(r.content[0].text).toContain("별표·서식이 없습니다")
  })
})
