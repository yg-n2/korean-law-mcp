/**
 * [N2 패치] get_law_text NOT_FOUND 재조회 안내가 입력한 식별자 종류를 유지하는지 (2026-09-28 Astra M7)
 */
import { beforeEach, describe, expect, it } from "vitest"
import { getLawText } from "./law-text.js"
import { lawCache } from "../lib/cache.js"
import type { LawApiClient } from "../lib/api-client.js"

const EMPTY = JSON.stringify({})
const client = { getLawText: async () => EMPTY } as unknown as LawApiClient

beforeEach(() => lawCache.clear())

describe("NOT_FOUND 재조회 안내", () => {
  it("lawId 입력이면 lawId 로 재조회를 안내한다 (mst 로 바꾸지 않음)", async () => {
    const r = await getLawText(client, { lawId: "001706", efYd: "20260928" })
    const text = r.content[0].text
    expect(r.isError).toBe(true)
    expect(text).toContain('get_law_text(lawId="001706")')
    expect(text).not.toContain('mst="001706"')
  })

  it("mst 입력이면 mst 재조회와 함께 현행 보장 아님을 알린다", async () => {
    const r = await getLawText(client, { mst: "281865", efYd: "20260928" })
    const text = r.content[0].text
    expect(text).toContain('get_law_text(mst="281865")')
    expect(text).toContain("lawId")
    expect(text).toContain("현행이 아닌 시행판")
  })
})
