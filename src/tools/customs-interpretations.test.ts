// N2 자체 패치 #3 테스트 — nts 목록 문서번호(안건번호) 표기
import { describe, expect, it } from "vitest"
import type { LawApiClient } from "../lib/api-client.js"
import { searchNtsInterpretations } from "./customs-interpretations.js"

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<CgmExpc>
<totalCnt>2</totalCnt>
<page>1</page>
<cgmExpc id="1"><법령해석일련번호>306988</법령해석일련번호><안건명><![CDATA[사업자 본인 소유 시설물을 시설대여업자에게 판매 후 리스하는 경우 세금계산서의 교부 방법]]></안건명><안건번호><![CDATA[재부가46015-182]]></안건번호><질의기관명></질의기관명><질의기관코드></질의기관코드><해석기관명>국세청</해석기관명><해석기관코드>1210000</해석기관코드><해석일자>1995.08.24</해석일자><법령해석상세링크>https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000076011</법령해석상세링크></cgmExpc>
<cgmExpc id="2"><법령해석일련번호>306989</법령해석일련번호><안건명><![CDATA[안건번호가 없는 항목]]></안건명><질의기관명></질의기관명><해석기관명>국세청</해석기관명><해석일자>2003.03.26</해석일자></cgmExpc>
</CgmExpc>`

function stubClient(xml: string): LawApiClient {
  return { fetchApi: async () => xml } as unknown as LawApiClient
}

describe("searchNtsInterpretations 문서번호 표기", () => {
  it("응답의 안건번호를 목록에 문서번호로 표기한다", async () => {
    const res = await searchNtsInterpretations(stubClient(SAMPLE_XML), { query: "판매후리스", display: 20, page: 1 })
    const text = res.content.map(c => c.text).join("\n")
    expect(text).toContain("문서번호: 재부가46015-182")
    expect(text).toContain("[306988]")
  })

  it("안건번호가 없는 항목은 문서번호 줄을 생략한다 (N/A 노이즈 방지)", async () => {
    const res = await searchNtsInterpretations(stubClient(SAMPLE_XML), { query: "판매후리스", display: 20, page: 1 })
    const text = res.content.map(c => c.text).join("\n")
    const secondItem = text.slice(text.indexOf("[306989]"))
    expect(secondItem).not.toContain("문서번호:")
  })
})
