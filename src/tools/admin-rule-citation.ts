// N2 자체 패치 #4 — verify_citations 행정규칙 인용 검증 (docs/N2-PATCHES.md)
//
// 배경: verify_citations의 법령명 접미사 화이트리스트가 법령 7종뿐이라
// 「식품등의 표시기준」 제N조 같은 고시·행정규칙 인용은 추출조차 안 되어
// 검증을 조용히 건너뛰었다. 세무 맥락에서 고시·통칙 인용은 빈번하다.
//
// 동작: 행정규칙 접미사(고시·훈령·예규·통칙·기준·지침)로 끝나는 인용은
// 법령 검색 대신 행정규칙 API(target=admrul)로 명칭 실존을 확인한다.
// 행정규칙 본문은 조문 단위 조회 API가 없어 **명칭 실존만** 검증한다(정직 표기).
// '기준'·'지침'은 일반 명사와 겹칠 수 있어 미발견 시 ✗ 대신 ⚠로 보고한다.
import { DOMParser } from "@xmldom/xmldom"
import type { LawApiClient } from "../lib/api-client.js"
import { looseMatchLawName } from "../lib/law-search.js"
import { detectAbolishedAdminRule } from "../lib/abolished-laws.js"

// 확실한 행정규칙 접미사 — 미발견 시 ✗(환각 의심)로 보고
const STRICT_ADMIN_SUFFIX = /(고시|훈령|예규|통칙)$/
// 일반 명사와 겹칠 수 있는 접미사 — 미발견 시 ⚠(재확인)로만 보고
const SOFT_ADMIN_SUFFIX = /(기준|지침)$/

export function isAdminRuleName(name: string): boolean {
  const trimmed = name.trim()
  return STRICT_ADMIN_SUFFIX.test(trimmed) || SOFT_ADMIN_SUFFIX.test(trimmed)
}

interface AdminRuleMatch {
  name: string
  promDate?: string
  orgName?: string
  ruleType?: string
}

async function findAdminRule(
  apiClient: LawApiClient,
  name: string,
  apiKey?: string
): Promise<AdminRuleMatch | null> {
  // display=100 (Opus 검토 권고 7): 법제처는 LIKE 부분검색+가나다순이라 정확한 규칙명이
  // 기본 20건 밖으로 밀릴 수 있다 — 법령 경로의 findLaws display=100과 같은 이유
  const xml = await apiClient.searchAdminRule({ query: name, display: "100", apiKey })
  const doc = new DOMParser().parseFromString(xml, "text/xml")
  const rules = doc.getElementsByTagName("admrul")
  const limit = Math.min(rules.length, 100)
  for (let i = 0; i < limit; i++) {
    const rule = rules[i]
    const ruleName = rule.getElementsByTagName("행정규칙명")[0]?.textContent?.trim() || ""
    if (ruleName && looseMatchLawName(name, ruleName)) {
      return {
        name: ruleName,
        promDate: rule.getElementsByTagName("발령일자")[0]?.textContent?.trim() || undefined,
        orgName: rule.getElementsByTagName("소관부처명")[0]?.textContent?.trim() || undefined,
        ruleType: rule.getElementsByTagName("행정규칙종류")[0]?.textContent?.trim() || undefined,
      }
    }
  }
  return null
}

/**
 * 후보들을 행정규칙 DB에서 찾아 실존이면 결과 문자열, 아니면 null.
 * 법령 검색 실패 후의 폴백 경로에서도 사용한다 (…규정/…규칙이 행정규칙인 경우).
 */
export async function tryVerifyAdminRuleCitation(
  apiClient: LawApiClient,
  candidates: string[],
  label: string,
  apiKey?: string
): Promise<string | null> {
  for (const cand of candidates) {
    const match = await findAdminRule(apiClient, cand, apiKey)
    if (match) {
      const meta = [match.ruleType, match.orgName, match.promDate ? `발령 ${match.promDate}` : undefined]
        .filter(Boolean)
        .join(" · ")
      return (
        `✓ ${label} — 행정규칙 「${match.name}」 실존${meta ? ` (${meta})` : ""}. ` +
        `※ 행정규칙은 조문 단위 검증 미지원 — 명칭 실존만 확인함`
      )
    }
  }
  return null
}

/** 행정규칙 접미사 인용의 전용 검증 경로 (실존 → 폐지 연혁 → 미발견 순). */
export async function verifyAdminRuleCitation(
  apiClient: LawApiClient,
  candidates: string[],
  label: string,
  rawName: string,
  apiKey?: string
): Promise<string> {
  try {
    const hit = await tryVerifyAdminRuleCitation(apiClient, candidates, label, apiKey)
    if (hit) return hit

    // 현행에 없으면 폐지·제명변경 연혁 확인 (환각과 폐지 규칙을 구분)
    for (const cand of candidates) {
      const note = await detectAbolishedAdminRule(apiClient, cand, apiKey)
      if (note) {
        const firstLine = note.split("\n").find(line => line.trim()) || note
        return `⌛ ${label} — 폐지·개정 연혁의 행정규칙으로 추정. ${firstLine.trim()}`
      }
    }

    if (SOFT_ADMIN_SUFFIX.test(rawName.trim()) && !STRICT_ADMIN_SUFFIX.test(rawName.trim())) {
      return `⚠ ${label} — 행정규칙 DB에서 확인 실패 ('${rawName}'이(가) 규칙명이 아닐 수 있음. 정식 명칭 재확인 필요)`
    }
    return `✗ ${label} — [NOT_FOUND] 행정규칙 DB에 해당 규칙 없음 (규칙명 오탈자 또는 존재하지 않는 규칙)`
  } catch (e) {
    return `⚠ ${label} — 행정규칙 검색 실패: ${e instanceof Error ? e.message : String(e)}`
  }
}
