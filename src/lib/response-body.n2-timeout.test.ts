import { afterEach, describe, expect, it, vi } from "vitest"
import { readBodyPrefix, readResponseText } from "./response-body.js"

afterEach(() => vi.useRealTimers())

describe("N2: 헤더 뒤 멈춘 본문에도 전체 읽기 제한", () => {
  it.each(["text", "prefix"])("%s 읽기는 30초 뒤 취소하고 타이머를 정리한다", async (mode) => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    const response = new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode("첫 조각")) },
      cancel,
    }))
    const read = mode === "text" ? readResponseText(response) : readBodyPrefix(response, 1000)
    const rejected = expect(read).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(30_001)
    await rejected
    expect(cancel).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
