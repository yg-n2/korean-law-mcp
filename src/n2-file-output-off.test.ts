// N2 자체 패치 #11 감시 — 팀 배포판(stdio·HTTP 서버)은 대비표 HWPX 파일 저장을 켜지 않는다 (docs/N2-PATCHES.md)
//
// 패치는 상류 index.ts 에서 enableAmendmentFileOutput() 호출 한 줄을 지운 것이다. 상류가 이 호출을
// 다른 파일(createServer·새 진입점 등)로 옮기면 squash 재적용이 충돌 없이 저장을 다시 켠다.
// 그래서 호출 위치를 소스 전체에서 감시한다 — 허용은 정의(amendment-table.ts)와 CLI 진입점(cli.ts)뿐.
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { LawApiClient } from "./lib/api-client.js"
import { amendmentTable, AmendmentTableSchema } from "./tools/amendment-table.js"

const SRC = path.dirname(fileURLToPath(import.meta.url))
const ALLOWED = new Set(["tools/amendment-table.ts", "cli.ts"])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [full] : []
  })
}

describe("대비표 파일 저장 비활성 (N2 패치 11)", () => {
  it("enableAmendmentFileOutput 은 정의와 CLI 진입점 밖에서 부르거나 가져오지 않는다", () => {
    const offenders = sourceFiles(SRC)
      .map(file => path.relative(SRC, file).split(path.sep).join("/"))
      .filter(rel => !ALLOWED.has(rel))
      .filter(rel => /enableAmendmentFileOutput/.test(readFileSync(path.join(SRC, rel), "utf8")))
    expect(offenders).toEqual([])
  })

  it("서버 진입점(index.ts)은 저장을 켜지 않는다", () => {
    expect(readFileSync(path.join(SRC, "index.ts"), "utf8")).not.toMatch(/enableAmendmentFileOutput\s*\(/)
  })

  it("기본 상태에서 outputPath 를 주면 저장하지 않고 미지원을 알린다", async () => {
    const stub = {
      fetchApi: async () => { throw new Error("현행 조회는 이 시험 대상이 아님") },
    } as unknown as LawApiClient
    const input = AmendmentTableSchema.parse({
      lawName: "가나다법",
      amendments: [{ text: "제1조(목적) 이 법은 시험한다.", currentText: "제1조(목적) 이 법은 시험을 한다." }],
      outputPath: path.join(SRC, "..", "n2-should-not-exist.hwpx"),
    })
    const res = await amendmentTable(stub, input)
    expect(res.content[0].text).toContain("이 배포판은 대비표 파일 저장을 지원하지 않습니다")
    expect(res.content[0].text).not.toContain("HWPX 저장:")
  })
})
