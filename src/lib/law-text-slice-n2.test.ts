// N2 자체 패치 #12 시험 — MST 단독 조회가 공포본 대신 시행 판을 쓰는지, get_law_text 머리글 판 안내 (docs/N2-PATCHES.md)
// 픽스처는 2026-11-13 상법 실응답의 모양: MST 273629 target=law = 공포본(공포법령여부 Y, 개정 전 제342조, 제341조의4 없음),
// eflaw MST 273629 efYd=20260910 = 시행 판(공포법령여부 N, 2026.3.6 공포 제21448호 반영)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LawApiClient } from "./api-client.js"
import { lawCache } from "./cache.js"
import { currencyNotes } from "./law-currency-n2.js"
import { preferEffectiveSlice } from "./law-text-slice-n2.js"
import { getLawText } from "../tools/law-text.js"
import type { HistoricalVersion } from "./historical-utils.js"

const basic = (promulgated: "Y" | "N", efYd = "20260910") => ({
  법령명_한글: "상법", 법령ID: "001702", 공포일자: "20250909", 공포번호: "21044", 시행일자: efYd, 공포법령여부: promulgated,
})
const article = (no: string, branch: string, text: string) => ({ 조문여부: "조문", 조문번호: no, 조문가지번호: branch, 조문내용: text })
const PROMULGATED = JSON.stringify({ 법령: { 기본정보: basic("Y"), 조문: { 조문단위: [
  article("342", "", "제342조(자기주식의 처분) 회사가 보유하는 자기의 주식을 처분하는 경우에 다음 각 호의 사항으로서 정관에 규정이 없는 것은 이사회가 결정한다."),
] } } })
const SLICE = JSON.stringify({ 법령: { 기본정보: basic("N"), 조문: { 조문단위: [
  article("341", "4", "제341조의4(자기주식의 소각의무 등) 회사가 자기주식을 취득한 때에는 그 취득한 날부터 1년 이내에 소각하여야 한다."),
  article("342", "", "제342조(자기주식의 처분) 회사가 자기주식을 처분하는 때에는 각 주주가 가진 주식 수에 따라 균등한 조건으로 취득하게 하여야 한다."),
] } } })
const v = (mst: string, efYd: string, ancYd: string, ancNo: string): HistoricalVersion =>
  ({ mst, efYd, ancYd, ancNo, lawNm: "상법", rrCls: "일부개정" })
// 실측 계보(2026-11-13, 시행일 내림차순 상위)
const LINEAGE = [
  v("284143", "20270101", "20260306", "21448"), v("272919", "20270101", "20250722", "20991"),
  v("273629", "20260910", "20250909", "21044"), v("272919", "20260723", "20250722", "20991"),
  v("284143", "20260306", "20260306", "21448"), v("272919", "20250722", "20250722", "20991"),
]
const NOW = Date.parse("2026-11-13T03:00:00Z")
const json = (body: string) => new Response(body, { status: 200, headers: { "content-type": "application/json" } })

describe("preferEffectiveSlice", () => {
  beforeEach(() => lawCache.clear())

  it("이미 시행된 공포본이면 같은 시행일의 시행 판으로 바꾼다", async () => {
    const fetchSlice = vi.fn(async () => SLICE)
    expect(await preferEffectiveSlice(PROMULGATED, "273629", fetchSlice, NOW)).toBe(SLICE)
    expect(fetchSlice).toHaveBeenCalledWith("20260910")
  })

  it("시행 전 공포본·시행 판 응답·빈 시행 판은 그대로 둔다", async () => {
    const fetchSlice = vi.fn(async () => SLICE)
    const future = JSON.stringify({ 법령: { 기본정보: basic("Y", "20270101") } })
    expect(await preferEffectiveSlice(future, "1", fetchSlice, NOW)).toBe(future)
    expect(await preferEffectiveSlice(SLICE, "2", fetchSlice, NOW)).toBe(SLICE)
    expect(fetchSlice).not.toHaveBeenCalled()
    expect(await preferEffectiveSlice(PROMULGATED, "3", async () => "{}", NOW)).toBe(PROMULGATED)
  })

  it("시행 판 조회 장애는 공포본으로 조용히 물러서지 않고 올린다", async () => {
    await expect(preferEffectiveSlice(PROMULGATED, "4", async () => { throw new Error("503") }, NOW)).rejects.toThrow("503")
  })
})

describe("api-client.getLawText MST 단독", () => {
  let urls: string[] = []
  beforeEach(() => {
    lawCache.clear()
    urls = []
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] })
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(String(url))
      return json(String(url).includes("target=law&") ? PROMULGATED : SLICE)
    }))
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  it("공포본을 받으면 시행 판으로 다시 받고, 같은 MST 다음 조회는 시행 판으로 바로 간다", async () => {
    const client = new LawApiClient({ apiKey: "test" })
    const first = JSON.parse(await client.getLawText({ mst: "273629", jo: "034104" }))
    expect(first.법령.기본정보.공포법령여부).toBe("N")
    expect(urls.map(u => /target=(\w+)/.exec(u)?.[1])).toEqual(["law", "eflaw"])
    expect(urls[1]).toContain("efYd=20260910")
    urls = []
    await client.getLawText({ mst: "273629", jo: "034200" })
    expect(urls.map(u => /target=(\w+)/.exec(u)?.[1])).toEqual(["eflaw"])
  })
})

describe("get_law_text 현행 조회 — 상법 MST 273629 제341조의4", () => {
  beforeEach(() => {
    lawCache.clear()
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] })
  })
  afterEach(() => vi.useRealTimers())

  const client = (promulgatedOnly: boolean) => ({
    getLawText: async (p: { mst?: string, efYd?: string }) => (promulgatedOnly ? PROMULGATED : SLICE),
    fetchApi: async () => { throw new Error("계보는 캐시에서") },
  })

  it("MST 로 불러도 현행 조문을 내고, 반영된 이후 공포 개정과 시행 전 개정을 알린다", async () => {
    lawCache.set("lineage:001702", LINEAGE, 60_000)
    const r = await getLawText(client(false) as never, { mst: "273629", jo: "제341조의4" })
    const text = r.content[0].text
    expect(r.isError).toBeFalsy()
    expect(text).toContain("1년 이내에 소각하여야 한다")
    expect(text).toContain("이 판 시행일 전에 시행된 개정도 본문에 반영돼 있습니다: 제21448호(2026.03.06 공포, 2026.03.06 시행)")
    expect(text).toContain("아직 시행 전인 개정이 있습니다: 2027.01.01 시행(제21448호·제20991호")
    expect(text).not.toContain("현행 아님")
  })

  it("시행 판을 못 받아 공포본이 나간 경우 이후 개정이 빠졌다고 경고한다", async () => {
    lawCache.set("lineage:001702", LINEAGE, 60_000)
    const r = await getLawText(client(true) as never, { mst: "273629", jo: "제342조" })
    expect(r.content[0].text).toContain("공포 당시 원문이라 이후 공포·시행된 개정이 빠져 있습니다")
  })
})

describe("currencyNotes", () => {
  it("옛 판(연혁 MST)이면 현행 아님을 알린다", () => {
    const text = currencyNotes(LINEAGE, { promDate: "20250722", effDate: "20250722", promulgatedOnly: false }, "20261113")
    expect(text).toContain("현행 아님: 오늘(2026.11.13) 시행 중인 판은 시행 2026.09.10(MST 273629)")
  })

  it("계보가 비었거나 시행 전 판이면 안내하지 않는다", () => {
    expect(currencyNotes([], { promDate: "20250909", effDate: "20260910", promulgatedOnly: false }, "20261113")).toBe("")
    expect(currencyNotes(LINEAGE, { promDate: "20260306", effDate: "20270101", promulgatedOnly: true }, "20261113")).toBe("")
  })
})

describe("시행 판이 없는 MST — 안내 페이지면 공포본으로 물러선다 (적대적 검토 r3 E1)", () => {
  const HTML_GUIDE = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN">
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>국가법령정보 공동활용</title></head>
<body>미신청된 목록/본문에 대한 접근입니다.</body></html>`
  let urls: string[] = []
  beforeEach(() => {
    lawCache.clear()
    urls = []
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] })
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(String(url))
      return String(url).includes("target=law&")
        ? json(PROMULGATED)
        : new Response(HTML_GUIDE, { status: 200, headers: { "content-type": "text/html" } })
    }))
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  it("api-client: 오류가 아니라 공포본을 돌려주고, 시행 판 재조회는 확인 1회로 끝낸다", async () => {
    const client = new LawApiClient({ apiKey: "test" })
    const body = JSON.parse(await client.getLawText({ mst: "273629", jo: "034200" }))
    expect(body.법령.기본정보.공포법령여부).toBe("Y")
    expect(urls.length).toBeLessThanOrEqual(3)
    expect(urls.filter(u => u.includes("target=eflaw")).length).toBeLessThanOrEqual(2)
  })

  it("get_law_text: 공포본 본문에 '이후 개정이 빠져 있을 수 있음' 경고를 붙인다(계보를 못 받아도)", async () => {
    const client = new LawApiClient({ apiKey: "test" })
    const r = await getLawText(client, { mst: "273629", jo: "제342조" })
    const text = r.content[0].text
    expect(r.isError).toBeFalsy()
    expect(text).toContain("정관에 규정이 없는 것은 이사회가 결정한다")
    expect(text).toContain("공포 당시 원문입니다(시행 판을 받지 못함)")
  })
})

describe("옛 판 문구 (적대적 검토 r3 3절)", () => {
  it("현행 아님과 '위 본문은 오늘 시행 중인 조문'이 함께 나오지 않는다", () => {
    const text = currencyNotes(LINEAGE, { promDate: "20250722", effDate: "20250722", promulgatedOnly: false }, "20261113")
    expect(text).toContain("현행 아님")
    expect(text).toContain("공포됐지만 아직 시행 전인 개정도 있습니다")
    expect(text).not.toContain("위 본문은 오늘 시행 중인 조문")
  })
})
