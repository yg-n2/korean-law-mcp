// N2 자체 패치 #12 — MST 단독 조회가 공포본(개정 전 원문)을 돌려주던 결함 (docs/N2-PATCHES.md, 상류 보고 후보)
//
// 상류 api-client.getLawText 는 MST 단독(efYd 없음)을 target=law 로 보낸다. target=law 는 그 MST 의 "공포본"
// (기본정보.공포법령여부=Y, 공포 당시 원문)을 준다. 그런데 이 MST 보다 나중에 공포됐지만 이 MST 의 시행일보다
// 먼저 시행된 개정이 있으면, 그 개정은 공포본에 없고 같은 시행일의 "시행 판"(eflaw MST+efYd, 공포법령여부=N)에만
// 반영된다. 실측(2026-11-13): 상법 MST 273629(공포 2025.9.9, 시행 2026.9.10) target=law → 개정 전 제342조, 제341조의4
// 없음 / eflaw MST 273629 efYd=20260910 → 2026.3.6 공포·시행 개정(제21448호)이 반영된 현행 조문. 같은 구조가
// 소득세법·근로기준법·조세특례제한법에도 있었다(계보 대조). search_law 가 [현행]으로 안내하는 MST 가 바로 이 MST 라
// 팀원 질문에서 옛 조문으로 결론이 날 수 있었다.
//
// 처리: 공포본이고 시행일이 오늘 이전이면 같은 MST·시행일의 시행 판으로 다시 받는다. 시행일은 MST 별로 하루 기억해
// 다음 조회부터는 시행 판으로 바로 간다(추가 호출은 MST 당 첫 1회). 시행 판이 없다는 응답(빈 봉투·안내 페이지)이면
// 공포본을 그대로 쓴다 — 자료가 없는 것이지 장애가 아니다. 그 밖의 오류는 올린다(공포본으로 조용히 물러서지 않는다).
import { lawCache } from "./cache.js"
import { UpstreamRecordMissingError } from "./upstream-miss.js"

const SLICE_TTL_MS = 24 * 60 * 60 * 1000
const sliceKey = (mst: string) => `n2slice:${mst}`

function todayKst(now = Date.now()): string {
  return new Date(now + 9 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "")
}

/** 앞서 확인한 이 MST 의 시행 판 시행일(있으면 바로 eflaw 로 간다) */
export function knownSliceEfYd(mst: string): string | undefined {
  return lawCache.get<string>(sliceKey(mst)) ?? undefined
}

function isEmptyEnvelope(text: string): boolean {
  try {
    return !JSON.parse(text)?.법령
  } catch {
    return false
  }
}

/**
 * target=law(MST 단독) 응답을 받아, 공포본이고 이미 시행됐으면 같은 시행일의 시행 판으로 바꿔 돌려준다.
 * fetchSlice(efYd) 는 eflaw MST+efYd 조회.
 */
export async function preferEffectiveSlice(
  promulgatedText: string,
  mst: string,
  fetchSlice: (efYd: string) => Promise<string>,
  now = Date.now(),
): Promise<string> {
  let basic: Record<string, unknown> | undefined
  try {
    basic = JSON.parse(promulgatedText)?.법령?.기본정보
  } catch {
    return promulgatedText
  }
  if (!basic || String(basic.공포법령여부 ?? "") !== "Y") return promulgatedText
  const efYd = String(basic.시행일자 ?? "").trim()
  if (!/^\d{8}$/.test(efYd) || efYd > todayKst(now)) return promulgatedText
  let slice: string
  try {
    slice = await fetchSlice(efYd)
  } catch (error) {
    if (error instanceof UpstreamRecordMissingError) return promulgatedText
    throw error
  }
  if (isEmptyEnvelope(slice)) return promulgatedText
  lawCache.set(sliceKey(mst), efYd, SLICE_TTL_MS)
  return slice
}
