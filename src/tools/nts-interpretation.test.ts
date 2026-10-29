/**
 * 국세청 법령해석 본문 조회 (#178) — 상세링크의 ntstDcmId 로 taxlaw action 을 부른다
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import type { LawApiClient } from "../lib/api-client.js"
import { fetchWithRetry } from "../lib/fetch-with-retry.js"
import { getNtsInterpretationText, searchNtsInterpretations } from "./customs-interpretations.js"

vi.mock("../lib/fetch-with-retry.js", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/fetch-with-retry.js")>(), fetchWithRetry: vi.fn(),
}))
vi.mock("../lib/external-https-proxy.js", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/external-https-proxy.js")>(), getExternalHttpsProxyConfig: () => null,
}))

afterEach(() => vi.mocked(fetchWithRetry).mockReset())

const api = {} as LawApiClient

// 실측 서면-2021-법규기본-5629 (2026-10-24) 응답을 줄인 것
function actionResponse(dcmDVO: unknown, editorHtml = "") {
  return new Response(JSON.stringify({ status: "SUCCESS", data: { ASIQTB002PR01: {
    dcmDVO,
    dcmHwpEditorDVOList: [{ dcmFleTy: "hwp" }, { dcmFleTy: "html", dcmFleByte: editorHtml }],
  } } }))
}
const DOC = {
  ntstDcmId: "010000000000525482",
  ntstDcmDscmCntn: "서면-2021-법규기본-5629",
  ntstDcmTtl: "제2차 납세의무(출자자･사업양수인)의 경합 여부",
  ntstDcmGistCntn: "각 요건이 충족되는 경우, 해당 제2차 납세의무들은 병존함",
  ntstDcmCntn: " 각각의 제2차 납세의무는 병존하는 것입니다. \n ",
  ntstDcmRplyCntn: "법규과-1884",
  ntstDcmRgtDt: "20220623",
}
const EDITOR = "<html><body><p><span>1. 사실관계</span></p><p><span>&nbsp;○갑법인은 국세를 체납하고 있는 체납법인임</span></p><p>3. 관련법령</p><p>국세기본법 제39조</p></body></html>"

describe("get_nts_interpretation_text: taxlaw 본문 조회", () => {
  it("18자리 ntstDcmId 로 본문·요지·출처를 돌려준다", async () => {
    vi.mocked(fetchWithRetry).mockResolvedValue(actionResponse(DOC, EDITOR))
    const result = await getNtsInterpretationText(api, { id: "010000000000525482" })
    const text = result.content[0].text
    expect(result.isError).toBeFalsy()
    expect(text).toContain("=== 제2차 납세의무(출자자･사업양수인)의 경합 여부 ===")
    expect(text).toContain("안건번호: 서면-2021-법규기본-5629")
    expect(text).toContain("회신번호: 법규과-1884")
    expect(text).toContain("생산일자: 2022.06.23")
    expect(text).toContain("요지:\n각 요건이 충족되는 경우")
    expect(text).toContain("회신:\n각각의 제2차 납세의무는 병존하는 것입니다.\n\n본문:\n1. 사실관계\n\n○갑법인은")
    expect(text).toContain("원문 대조 권장")
    expect(text).toContain("https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000525482")

    const [url, init] = vi.mocked(fetchWithRetry).mock.calls[0]
    expect(url).toBe("https://taxlaw.nts.go.kr/action.do")
    expect(new URLSearchParams(String(init?.body)).get("paramData")).toBe('{"dcmDVO":{"ntstDcmId":"010000000000525482"}}')
  })

  it("검색 결과의 상세링크 URL 을 그대로 받아도 된다", async () => {
    vi.mocked(fetchWithRetry).mockResolvedValue(actionResponse(DOC, EDITOR))
    const result = await getNtsInterpretationText(api, { id: "https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000525482" })
    expect(result.isError).toBeFalsy()
    expect(new URLSearchParams(String(vi.mocked(fetchWithRetry).mock.calls[0][1]?.body)).get("paramData")).toContain("010000000000525482")
  })

  it("법제처 일련번호·다른 호스트 링크는 호출 없이 NOT_SUPPORTED 로 안내한다", async () => {
    for (const id of ["158752", "https://evil.example/qt/USEQTA002P.do?ntstDcmId=010000000000525482", "01000000000052548"]) {
      const result = await getNtsInterpretationText(api, { id })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("[NOT_SUPPORTED]")
      expect(result.content[0].text).toContain("본문조회ID(ntstDcmId)")
    }
    expect(fetchWithRetry).not.toHaveBeenCalled()
  })

  // 실측: 없는 ID 도 HTTP 200 + dcmDVO null 로 온다
  it("없는 문서는 NOT_FOUND", async () => {
    vi.mocked(fetchWithRetry).mockResolvedValue(actionResponse(null))
    const result = await getNtsInterpretationText(api, { id: "999999999999999999" })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain("[NOT_FOUND]")
  })

  // 실측 서면-2021-징세-6702: 회신은 한 줄("기존해석례 … 참조")이고 질의는 편집기 HTML 에만 있다
  it("회신·본문은 따로 실리고, 둘 다 없을 때만 본문 없음을 밝힌다", async () => {
    vi.mocked(fetchWithRetry).mockResolvedValue(actionResponse({ ...DOC, ntstDcmCntn: "  \n 기존해석례 서면-2021-법규기본-5629(2022.6.23.)을 참조하시기 바랍니다." }))
    const onlyReply = (await getNtsInterpretationText(api, { id: DOC.ntstDcmId })).content[0].text
    expect(onlyReply).toContain("회신:\n기존해석례 서면-2021-법규기본-5629(2022.6.23.)을 참조하시기 바랍니다.")
    expect(onlyReply).not.toContain("본문")

    vi.mocked(fetchWithRetry).mockResolvedValue(actionResponse({ ...DOC, ntstDcmCntn: " " }))
    expect((await getNtsInterpretationText(api, { id: DOC.ntstDcmId })).content[0].text).toContain("본문: (국세법령정보시스템 응답에 본문 없음")
  })

  it("taxlaw 장애·낯선 응답은 없음으로 단정하지 않고 원문 링크를 단 에러로 돌려준다", async () => {
    for (const response of [
      new Response("busy", { status: 503 }),
      new Response(JSON.stringify({ status: "FAIL", data: { ASIQTB002PR01: { dcmDVO: null } } })),
      new Response(JSON.stringify({ status: "SUCCESS", data: {} })),
    ]) {
      vi.mocked(fetchWithRetry).mockResolvedValue(response)
      const result = await getNtsInterpretationText(api, { id: DOC.ntstDcmId })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).not.toContain("[NOT_FOUND]")
      expect(result.content[0].text).toContain("ntstDcmId=010000000000525482")
    }
  })
})

describe("search_nts_interpretations: 본문조회ID 노출", () => {
  it("상세링크의 ntstDcmId 를 따로 싣는다", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><CgmExpc><totalCnt>1</totalCnt><page>1</page>` +
      `<cgmExpc id="1"><법령해석일련번호>158752</법령해석일련번호><안건명><![CDATA[과점주주 제2차 납세의무]]></안건명>` +
      `<안건번호><![CDATA[서면1팀-328]]></안건번호><해석기관명>국세청</해석기관명><해석일자>2007.03.09</해석일자>` +
      `<법령해석상세링크>https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000078586</법령해석상세링크></cgmExpc></CgmExpc>`
    const result = await searchNtsInterpretations({ fetchApi: async () => xml } as unknown as LawApiClient, { query: "제2차 납세의무", display: 20, page: 1 })
    expect(result.content[0].text).toContain("본문조회ID(ntstDcmId): 010000000000078586")
  })
})
