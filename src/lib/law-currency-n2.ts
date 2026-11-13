// N2 자체 패치 #12 (2/2) — get_law_text 현행 조회의 판 안내 (docs/N2-PATCHES.md, 상류 보고 후보)
//
// 머리글의 공포일·시행일은 본문 판의 기본정보(그 시행일의 공포본 번호)라, 나중에 공포됐지만 먼저 시행돼 함께 반영된
// 개정이 머리글에 드러나지 않는다(상법: 머리글 "공포 20250909 / 시행 20260910", 본문엔 2026.3.6 공포 제21448호 반영).
// 또 공포됐지만 아직 시행 전인 개정이 있다는 사실이 본문 조회에서는 보이지 않았다. 계보(법령ID 기준 시행 판 목록)로
//  ① 이 판에 함께 반영된 이후 공포 개정 ② 오늘 시행 중인 판과 다른 판이면 그 사실 ③ 시행 전 개정을 머리글 아래에 적는다.
import { rethrowIfFatal } from "./fatal-errors.js"
import { formatDateDot } from "./schemas.js"
import type { HistoricalVersion } from "./historical-utils.js"

/** 시행 판을 받지 못해 공포본(공포 당시 원문)이 나간 경우의 경고 — 계보로 빠진 개정을 특정하지 못했을 때 */
export const PROMULGATED_ONLY_NOTE =
  "⚠️ 이 본문은 공포 당시 원문입니다(시행 판을 받지 못함). 이후 공포·시행된 개정이 빠져 있을 수 있으니 현행 조문은 lawId 로 다시 조회하세요."

const no = (v: HistoricalVersion) => `제${parseInt(v.ancNo, 10) || v.ancNo}호`

export interface CurrencyBasic {
  lawId?: string
  promDate: string
  effDate: string
  /** 기본정보.공포법령여부 — "Y" 면 공포본(이후 개정 미반영) */
  promulgatedOnly: boolean
}

/** 계보로 판 안내 문장을 만든다(순수 함수). 안내할 것이 없으면 빈 문자열 */
export function currencyNotes(versions: HistoricalVersion[], basic: CurrencyBasic, today: string): string {
  const { promDate, effDate } = basic
  if (!/^\d{8}$/.test(effDate) || effDate > today || versions.length === 0) return ""
  const desc = [...versions].filter(v => v.efYd).sort((a, b) => b.efYd.localeCompare(a.efYd) || b.ancYd.localeCompare(a.ancYd))
  const lines: string[] = []

  const merged = new Map<string, HistoricalVersion>()
  for (const v of desc) {
    if (promDate && v.ancYd > promDate && v.efYd <= effDate && !merged.has(v.ancNo)) merged.set(v.ancNo, v)
  }
  if (merged.size > 0) {
    const list = [...merged.values()].map(v => `${no(v)}(${formatDateDot(v.ancYd)} 공포, ${formatDateDot(v.efYd)} 시행)`).join(", ")
    lines.push(basic.promulgatedOnly
      ? `⚠️ 이 본문은 공포 당시 원문이라 이후 공포·시행된 개정이 빠져 있습니다: ${list}. 현행 조문은 lawId 로 다시 조회하세요.`
      : `ℹ️ 위 공포일 뒤에 공포됐지만 이 판 시행일 전에 시행된 개정도 본문에 반영돼 있습니다: ${list}.`)
  } else if (basic.promulgatedOnly) {
    lines.push(PROMULGATED_ONLY_NOTE)
  }

  const inForce = desc.find(v => v.efYd <= today)
  const notCurrent = Boolean(inForce && inForce.efYd > effDate)
  if (inForce && notCurrent) {
    lines.push(`⚠️ 현행 아님: 오늘(${formatDateDot(today)}) 시행 중인 판은 시행 ${formatDateDot(inForce.efYd)}(MST ${inForce.mst})입니다. 현행 조문은 lawId 로 다시 조회하세요.`)
  }

  const future = new Map<string, HistoricalVersion[]>()
  for (const v of desc) {
    if (v.efYd > today) future.set(v.efYd, [...(future.get(v.efYd) ?? []), v])
  }
  if (future.size > 0) {
    const dates = [...future.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 3)
    const list = dates.map(([ef, vs]) => `${formatDateDot(ef)} 시행(${[...new Set(vs.map(no))].join("·")}, MST ${vs[0].mst})`).join(", ")
    const more = future.size > 3 ? ` 외 ${future.size - 3}개 시행일` : ""
    // 옛 판(현행 아님)이면 "위 본문은 오늘 시행 중인 조문"이라고 쓰지 않는다(r3 3절 — 두 문장이 서로 어긋났다)
    lines.push(notCurrent
      ? `🔜 이 법령에는 공포됐지만 아직 시행 전인 개정도 있습니다: ${list}${more}. 시행 후 조문은 get_law_text(mst, efYd=시행일)로 보세요.`
      : `🔜 공포됐지만 아직 시행 전인 개정이 있습니다: ${list}${more}. 위 본문은 오늘 시행 중인 조문이며, 시행 후 조문은 get_law_text(mst, efYd=시행일)로 보세요.`)
  }
  return lines.length ? lines.join("\n") + "\n" : ""
}

/** 계보를 받아 안내를 만든다. 계보 조회 장애는 미확인으로 적고 본문은 그대로 낸다(예산 소진·취소는 올린다) */
export async function currencyNotesFor(
  basic: CurrencyBasic,
  today: string,
  lineage: (lawId: string) => Promise<HistoricalVersion[]>,
): Promise<string> {
  if (!/^\d{8}$/.test(basic.effDate) || basic.effDate > today) return ""
  // 공포본 경고는 계보를 못 받아도 붙인다(시행 판 미스로 물러선 경우를 놓치지 않게)
  const fallbackNote = basic.promulgatedOnly ? PROMULGATED_ONLY_NOTE + "\n" : ""
  if (!basic.lawId) return fallbackNote
  try {
    const notes = currencyNotes(await lineage(basic.lawId), basic, today)
    return notes || fallbackNote
  } catch (error) {
    rethrowIfFatal(error)
    return fallbackNote + "ℹ️ 개정 연혁을 확인하지 못해 시행 전 개정·현행 여부는 미확인입니다.\n"
  }
}
