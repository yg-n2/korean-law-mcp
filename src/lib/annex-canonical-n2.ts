// N2 자체 패치 #7 — 별표 정본(현행 본문) 응답 구조 검증 + 걸러진 항목 추적 (docs/N2-PATCHES.md)
//
// 1) 구조 결함(JSON 오류·오류 봉투·별표/별표단위 비객체·링크 필드 전체 소실)은 "별표 0건"이 아니라
//    조회 실패다 → throw 해 호출부의 조회 실패(licbyl 폴백 + 경고, 미선택 시 [확인 불가]) 경로로 보낸다.
// 2) 상류 파서(lawAnnexUnitsFromJson)는 링크 없는 항목과 본번 0 코드(000000) 항목을 버린다. 버린 사실을
//    호출부가 모르면 "정본 대조 완료"·"별표 없음"으로 읽힌다(2026-11-12 적대적 검토 r1 B1·B2). 그래서
//    걸러진 항목(번호·사유)을 돌려준 배열에 붙여 둔다(WeakMap — 상류 반환 타입은 그대로, 캐시도 같은 배열).
//    - zero_code: 본번 0(무번호) 별표. 링크가 있으면 정본 단위 그 자체다(여권법 시행령 실응답: 별표단위
//      1건 `0000`, 링크 flSeq=161544623 — 색인 000000 의 링크 flSeq=161427905 와 다름, 2026-11-12 실호출)
//    - no_link: 링크 키는 있는데 값이 비었다(삭제 별표 등)
//    - no_link_key: 링크 키 자체가 없다(형식 변경 의심 — 이런 결과는 캐시하지 않는다)
import type { LawAnnexUnit } from "./annex-canonical.js"

const LINK_KEYS = ["별표서식파일링크", "별표서식PDF파일링크"] as const

export type SkipReason = "zero_code" | "no_link" | "no_link_key"

export interface SkippedAnnexUnit {
  code6: string
  kind: string
  title: string
  reason: SkipReason
  /** zero_code 이면서 링크가 있으면 정본 단위로 쓸 수 있다 */
  unit?: LawAnnexUnit
}

const SKIPPED = new WeakMap<LawAnnexUnit[], SkippedAnnexUnit[]>()

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const isEmptyish = (v: unknown) =>
  v == null || v === "" || (Array.isArray(v) && v.length === 0) || (isPlainObject(v) && Object.keys(v).length === 0)

const firstLink = (v: unknown): string | undefined => {
  const raw = Array.isArray(v) ? v[0] : v
  const s = raw == null ? "" : String(raw).trim()
  return s || undefined
}

const codeOf = (u: Record<string, unknown>) =>
  String(u.별표번호 ?? "").trim().padStart(4, "0") + String(u.별표가지번호 ?? "0").trim().padStart(2, "0")

/** lawService JSON 본문을 파싱·검증해 별표단위 원본 목록을 돌려준다. 구조 결함이면 throw. */
export function parseCanonicalLawJson(text: string): { body: Record<string, unknown>, rawUnits: Record<string, unknown>[] } {
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error("현행 본문 JSON 해석 불가")
  }
  if (!isPlainObject(body) || !isPlainObject(body.법령)) {
    throw new Error("현행 본문 법령 구조 확인 불가")
  }
  const annex = body.법령.별표
  // 빈 요소("", [], {})는 별표 없음으로 받는다
  if (isEmptyish(annex)) return { body, rawUnits: [] }
  if (!isPlainObject(annex)) throw new Error("현행 본문 별표 구조 확인 불가")
  const raw = annex.별표단위
  if (isEmptyish(raw)) return { body, rawUnits: [] }
  const rawUnits = Array.isArray(raw) ? raw : [raw]
  if (!rawUnits.every(isPlainObject)) throw new Error("현행 본문 별표단위 구조 확인 불가")
  // 항목은 있는데 어느 항목에도 링크 필드 자체가 없으면 응답 형식이 바뀐 것이다
  if (!rawUnits.some(u => LINK_KEYS.some(key => key in u))) {
    throw new Error("현행 본문 별표 파일 링크 필드 확인 불가")
  }
  return { body, rawUnits: rawUnits as Record<string, unknown>[] }
}

/** 상류 파서(lawAnnexUnitsFromJson)가 버린 항목을 사유와 함께 모은다 — 버리는 조건은 상류와 같다(링크 없음 또는 000000) */
export function collectSkipped(rawUnits: Record<string, unknown>[]): SkippedAnnexUnit[] {
  const skipped: SkippedAnnexUnit[] = []
  for (const u of rawUnits) {
    const code6 = codeOf(u)
    const kind = String(u.별표구분 ?? "")
    const title = String(u.별표제목 ?? "")
    const hwpLink = firstLink(u.별표서식파일링크)
    const pdfLink = firstLink(u.별표서식PDF파일링크)
    if ((hwpLink || pdfLink) && code6 !== "000000") continue
    if (!LINK_KEYS.some(key => key in u)) skipped.push({ code6, kind, title, reason: "no_link_key" })
    else if (!hwpLink && !pdfLink) skipped.push({ code6, kind, title, reason: "no_link" })
    else skipped.push({ code6, kind, title, reason: "zero_code", unit: { code6, kind, title, hwpLink, pdfLink } })
  }
  return skipped
}

/**
 * fetchLawAnnexUnits 용: 본문 검증 → 상류 매핑 → 걸러진 항목 부착. cacheable=false 면 캐시하지 않는다
 * (링크 키 없는 항목 = 형식 변경 의심 — 6시간 동안 불완전한 결과를 쓰지 않게).
 */
export function readCanonicalAnnexUnits(
  text: string,
  toUnits: (json: unknown) => LawAnnexUnit[],
): { units: LawAnnexUnit[], cacheable: boolean } {
  const { body, rawUnits } = parseCanonicalLawJson(text)
  const units = toUnits(body)
  return { units, cacheable: attachSkipped(units, collectSkipped(rawUnits)) }
}

/** 걸러진 항목을 배열에 붙인다. 캐시해도 되는지(링크 키 없는 항목이 없음)를 돌려준다 */
export function attachSkipped(units: LawAnnexUnit[], skipped: SkippedAnnexUnit[]): boolean {
  if (skipped.length > 0) SKIPPED.set(units, skipped)
  return !skipped.some(s => s.reason === "no_link_key")
}

export function skippedAnnexUnits(units: LawAnnexUnit[]): SkippedAnnexUnit[] {
  return SKIPPED.get(units) ?? []
}

/**
 * 정본의 무번호(000000) 단위가 링크 유무·종류와 관계없이 정확히 1건이고 그 단위에 링크가 있으면 그 단위.
 * 링크 있는 것만 세면 "무번호 별표(링크 있음) + 무번호 서식(링크 빈 값)"에서 별표를 유일로 잘못 판정한다(적대적 검토 r2 C1).
 * kind 를 주면 종류도 같아야 한다.
 */
export function soleZeroCodeUnit(units: LawAnnexUnit[], kind?: string): LawAnnexUnit | undefined {
  const zero = skippedAnnexUnits(units).filter(s => s.code6 === "000000")
  if (zero.length !== 1 || !zero[0].unit) return undefined
  if (kind !== undefined && zero[0].kind.trim() !== kind.trim()) return undefined
  return zero[0].unit
}

/** 목록·기준일 조회용: 걸러진 단일 무번호 별표를 정본 단위로 되살린 배열(걸러진 정보도 이어 붙인다) */
export function usableCanonicalUnits(units: LawAnnexUnit[]): LawAnnexUnit[] {
  const zero = soleZeroCodeUnit(units)
  if (!zero) return units
  const out = [...units, zero]
  SKIPPED.set(out, skippedAnnexUnits(units).filter(s => s.unit !== zero))
  return out
}

const describeSkip = (s: SkippedAnnexUnit) =>
  `${s.code6}${s.reason === "no_link" ? "(링크 비어 있음 — 삭제됐을 수 있음)" : s.reason === "no_link_key" ? "(링크 필드 없음 — 응답 형식 변경 의심)" : "(무번호 별표)"}`

export interface CanonicalPickReview {
  /** 정본 링크로 쓸 단위 */
  unit?: LawAnnexUnit
  /** 색인 링크를 그대로 쓰지만 정본에서 확인하지 못했다는 경고 */
  note?: string
  /** 요청한 별표가 정본에 있으나 쓸 수 없어 "없음"으로 단정하면 안 되는 사유 */
  unverified?: string
}

/**
 * pickAnnexUnit 결과를 걸러진 항목과 맞춰 본다.
 * - 고른 색인 항목이 무번호(000000·빈 코드)이고 정본 무번호 단위가 1건이면 그 정본 링크를 쓴다
 * - 고른 색인 항목이 정본 단위에 없으면 경고(삭제·구본 가능)
 * - 색인에 없는 번호를 요청했는데 정본에 그 번호가 링크 없이 있으면 확인 불가
 */
export interface MatchedIndexItem {
  /** 색인 별표번호(6자리 코드 또는 빈 값) */
  code: string
  /** 색인 별표종류(별표·서식 등) */
  kind?: string
  /** 색인 항목이 스스로 번호를 갖는가(annex-select hasIdentifiableAnnexNumber — 코드 본번≥1 또는 제목 앞 번호 표기) */
  numbered: boolean
  /** 색인 별표명 — 정본 무번호 단위 제목과 같은 별표인지 본다 */
  title?: string
}

const normTitle = (t: string) => t.replace(/<[^>]+>/g, "").replace(/[^\p{L}\p{N}]+/gu, "")

/** 같은 별표의 제목인가 — 같거나 한쪽이 다른 쪽을 품을 때(개정으로 "(제N조 관련)"이 붙는 정도는 허용) */
function sameAnnexTitle(a: string | undefined, b: string): boolean {
  const x = normTitle(a ?? "")
  const y = normTitle(b)
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}

export function reviewCanonicalPick(
  units: LawAnnexUnit[],
  picked: LawAnnexUnit | undefined,
  matched: MatchedIndexItem | undefined,
  selectorCandidates: Set<string> | undefined,
): CanonicalPickReview {
  if (picked) return { unit: picked }
  const skipped = skippedAnnexUnits(units)
  if (matched !== undefined) {
    const code = matched.code.trim()
    // 무번호 짝짓기(적대적 검토 r2 C1): 색인 코드가 무번호이고, 제목에도 번호가 없고, 종류가 같고,
    // 정본 무번호 단위가 (링크 유무와 관계없이) 1건이고, 제목이 같은 별표일 때만. 벗어나면 아래 색인 링크 + 경고
    if ((code === "" || /^0{6}$/.test(code)) && !matched.numbered && matched.kind) {
      const zero = soleZeroCodeUnit(units, matched.kind)
      if (zero && sameAnnexTitle(matched.title, zero.title)) return { unit: zero }
    }
    const hit = skipped.find(s => s.code6 === code)
    return {
      note: hit
        ? `⚠️ 현행 본문에서 이 별표(${describeSkip(hit)})의 정본 링크를 확인하지 못했습니다 — 검색 인덱스(licbyl) 링크로 조회했으며, 삭제됐거나 구본일 수 있습니다.\n`
        : `⚠️ 현행 본문 별표 목록에서 이 별표(${code || "번호 없음"})를 찾지 못했습니다 — 검색 인덱스(licbyl) 링크로 조회했으며, 삭제됐거나 구본일 수 있습니다.\n`,
    }
  }
  const hit = selectorCandidates ? skipped.find(s => s.reason !== "zero_code" && selectorCandidates.has(s.code6)) : undefined
  if (hit) return { unverified: `현행 본문에 ${describeSkip(hit)} 항목은 있으나 파일 링크를 쓸 수 없음` }
  const formatChange = skipped.find(s => s.reason === "no_link_key")
  if (formatChange) return { unverified: `현행 본문 일부 별표의 링크 필드가 없음 — ${describeSkip(formatChange)}` }
  return {}
}

/** 목록 병합 경고: 색인에 없는데 정본에서 걸러진 항목(형식 변경·무번호)이 있으면 목록이 완전하지 않다 */
export function listMergeIssue(indexCodes: string[], units: LawAnnexUnit[]): string | undefined {
  const known = new Set(indexCodes.map(c => (c.trim() === "" ? "000000" : c.trim())))
  const missing = skippedAnnexUnits(units).filter(s => s.reason !== "no_link" && !known.has(s.code6))
  if (missing.length === 0) return undefined
  return `현행 본문의 일부 별표를 목록에 넣지 못함: ${missing.slice(0, 5).map(describeSkip).join(", ")}`
}

/** 기준일 조회: 걸러진 결과 0건을 "별표 없음"으로 단정하지 않기 위한 사유(없으면 undefined) */
export function emptyUnitsIssue(units: LawAnnexUnit[]): string | undefined {
  const skipped = skippedAnnexUnits(units)
  if (units.length > 0 || skipped.length === 0) return undefined
  return `본문에 별표단위 ${skipped.length}건이 있으나 파일 링크를 쓸 수 없음: ${skipped.slice(0, 5).map(describeSkip).join(", ")}`
}
