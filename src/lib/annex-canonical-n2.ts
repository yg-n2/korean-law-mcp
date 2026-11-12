// N2 자체 패치 #7 — 별표 정본(현행 본문) 응답 구조 검증 (docs/N2-PATCHES.md)
//
// 정본 조회가 JSON 오류·오류 봉투·링크 필드 소실로 끝났는데 이를 "별표 0건"으로 읽으면
// get_annexes 가 "해당 별표 없음"을 단정한다. 그런 응답은 throw 해 호출부의 조회 실패
// (licbyl 폴백 + 경고, 미선택 시 [확인 불가]) 경로로 보낸다.
//
// 링크 없는 개별 항목(삭제 별표 등)·본번 0 코드(000000)는 결함이 아니다 — 상류
// lawAnnexUnitsFromJson 과 같은 기준으로 걸러질 뿐이다. 2026-11-12 검수 이전에는
// 걸러지기 전 개수와 비교해 이런 항목이 하나라도 있는 법령(여권법 시행령 등)의 정본 대조가
// 늘 실패했다.

const LINK_KEYS = ["별표서식파일링크", "별표서식PDF파일링크"] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** lawService(target=law/eflaw) JSON 본문을 파싱·검증해 돌려준다. 구조 결함이면 throw. */
export function parseCanonicalLawJson(text: string): Record<string, unknown> {
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
  if (annex == null) return body
  if (!isPlainObject(annex)) throw new Error("현행 본문 별표 구조 확인 불가")
  const raw = annex.별표단위
  if (raw == null) return body
  const units = Array.isArray(raw) ? raw : [raw]
  if (!units.every(isPlainObject)) throw new Error("현행 본문 별표단위 구조 확인 불가")
  // 항목은 있는데 어느 항목에도 링크 필드 자체가 없으면 응답 형식이 바뀐 것이다(값이 빈 항목은 정상)
  if (units.length > 0 && !units.some(u => LINK_KEYS.some(key => key in u))) {
    throw new Error("현행 본문 별표 파일 링크 필드 확인 불가")
  }
  return body
}
