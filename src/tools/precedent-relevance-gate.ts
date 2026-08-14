// N2 자체 패치 #2 — 무관 판례 전문 자동첨부 게이트 (docs/N2-PATCHES.md)
//
// 배경: chain(full_research·dispute_prep·document_review)과 search_decisions(precedent,
// includeText)가 검색 상위 판례의 전문을 관련성 확인 없이 자동 첨부한다. 최초 시도가
// hit>0이면 validateResult가 아예 호출되지 않아(requiresResultValidation 미설정),
// 무관 판결문 전문이 통째로 붙어 토큰을 낭비하고 컨텍스트를 오염시킨다.
//
// 동작: 상세 본문을 hit을 찾아낸 검색어(sourceQuery·semanticAnchor)와 대조해,
// 모든 핵심 토큰이 본문에 없으면 전문 대신 안내 문구만 남긴다 (보수적 AND 대조 —
// 확실할 때만 전문을 첨부한다는 원칙). 대조 기준을 만들 수 없으면 게이트를 적용하지
// 않는다 (기존 동작 유지).
//
// 적용 범위: PrecedentEvidenceOptions.relevanceGate === true 인 호출만 (opt-in).
// validatePrecedentSearchResult의 검증용 1건 조회는 원본 본문이 필요하므로 제외.
import type { PrecedentHit, StructuredPrecedentSearchResult } from "./precedent-search-core.js"
import { buildCompactLegalQueries } from "./compact-query-planner.js"

// precedent-evidence.ts의 정규화·대조 로직과 동일 기준 (순환 import 회피용 사본)
function normalizeRelevanceText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
}

function containsAnyTerm(text: string, terms: string[]): boolean {
  const haystack = normalizeRelevanceText(text)
  return terms.some(term => haystack.includes(normalizeRelevanceText(term)))
}

function containsEveryTermGroup(text: string, groups: string[][]): boolean {
  return groups.every(group => containsAnyTerm(text, group))
}

// 의문·구어체 토큰 제외 (Opus 검토 차단 2): "되나요"·"어떻게" 같은 어미가 AND 조건이
// 되면 판결문 본문에 존재할 수 없어 정답 판례까지 전량 차단된다. 제외는 요구 토큰을
// 줄이는 방향이라 오차단을 만들지 않는다 (제외 후 토큰이 없으면 게이트 미적용).
const STOP_TOKENS = new Set([
  "어떻게", "무엇", "뭐", "누구", "언제", "어디", "왜", "얼마", "얼마나",
  "알려줘", "알려주세요", "해줘", "해주세요", "궁금해요", "궁금합니다", "여부",
])
const STOP_ENDINGS = /(되나요|하나요|인가요|한가요|할까요|될까요|입니까|합니까|됩니까|는지|한지|인지|주세요|해줘)$/

function isStopToken(token: string): boolean {
  return STOP_TOKENS.has(token) || STOP_ENDINGS.test(token)
}

function collectTokens(source: string | undefined, into: Set<string>): void {
  if (typeof source !== "string") return
  for (const token of source.split(/\s+/)) {
    if (isStopToken(token)) continue
    if (normalizeRelevanceText(token).length >= 2) into.add(token)
  }
}

/**
 * 원 질의(originalArgs.query) 기준 변별 토큰.
 * 폴백이 검색어를 일반어("세금계산서" 등)로 완화해 hit을 찾은 경우, hit 기준 대조만으로는
 * 무관 판례가 통과한다(실측: 판매후리스 질문에 가공세금계산서 판결문 첨부). 원 질의의
 * 핵심 토큰을 추가 요구해 이를 막는다. 짧은 질의(3어절 이하)는 원문 토큰 그대로,
 * 긴 자연어 질문은 조사·의문사가 섞이므로 planner의 핵심 키워드 후보로만 추출한다.
 */
function originalQueryTermGroups(searchResult: StructuredPrecedentSearchResult): string[][] {
  const original = searchResult.originalArgs?.query
  if (typeof original !== "string" || !original.trim()) return []
  const tokens = new Set<string>()
  if (original.trim().split(/\s+/).length <= 3) {
    collectTokens(original, tokens)
  } else {
    try {
      const keyword = buildCompactLegalQueries({ originalQuery: original, includeOriginal: true })
        .find(candidate => candidate.source === "original_keyword")
      collectTokens(keyword?.query, tokens)
    } catch {
      // 후보 생성 실패 시 원 질의 기준 대조는 생략 (hit 기준 대조만 적용)
    }
  }
  return Array.from(tokens).map(token => [token])
}

/**
 * hit 단위 대조 기준 생성 (모든 그룹 AND, 그룹 내 OR).
 * 1) 폴백 시도에 명시된 validationTermGroups (그 시도가 이 hit의 검색어와 일치할 때),
 *    없으면 hit을 찾아낸 검색어(sourceQuery)와 앵커(semanticAnchor)의 토큰
 * 2) + 원 질의의 변별 토큰 (완화된 폴백 검색어로 잡힌 무관 hit 차단)
 */
export function gateTermGroupsForHit(
  hit: PrecedentHit,
  searchResult: StructuredPrecedentSearchResult
): string[][] {
  const attempt = searchResult.successfulAttempt
  // 사건번호 지정 조회(검색어 없는 검색)로 찾은 hit은 사용자가 특정한 판례다 —
  // 원 질의 토큰만으로 대조하면 지정 판례의 전문이 사라진다 (Opus 검토 권고 4). 게이트 미적용.
  if (!hit.sourceQuery && !attempt?.query) return []

  const groups: string[][] = []
  const seen = new Set<string>()
  const push = (group: string[]) => {
    const key = group.map(normalizeRelevanceText).sort().join("|")
    if (key && !seen.has(key)) {
      seen.add(key)
      groups.push(group)
    }
  }

  const explicit =
    attempt?.validationTermGroups?.length && (!hit.sourceQuery || hit.sourceQuery === attempt.query)
      ? attempt.validationTermGroups
          .map(group => Array.from(new Set(group.filter(term => normalizeRelevanceText(term).length >= 2))))
          .filter(group => group.length > 0)
      : []
  if (explicit.length > 0) {
    explicit.forEach(push)
  } else {
    const tokens = new Set<string>()
    collectTokens(hit.semanticAnchor, tokens)
    collectTokens(hit.sourceQuery ?? attempt?.query, tokens)
    for (const token of tokens) push([token])
  }

  originalQueryTermGroups(searchResult).forEach(push)
  return groups
}

/** 본문이 대조 기준을 충족하면 true. 기준이 없으면 게이트 미적용(true). */
export function passesRelevanceGate(
  bodyText: string,
  hit: PrecedentHit,
  searchResult: StructuredPrecedentSearchResult
): boolean {
  const groups = gateTermGroupsForHit(hit, searchResult)
  if (groups.length === 0) return true
  return containsEveryTermGroup(bodyText, groups)
}
