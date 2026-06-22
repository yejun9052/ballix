// 월드컵 조별 순위/진출 현황 계산
// 2026 포맷: 12개 조 × 상위 2팀(직접진출) + 3위 중 상위 8팀(와일드카드) = 32강

// 그룹명("Grp. A" / "Group A" / "A") → 알파벳 한 글자
export function groupLetter(name) {
  if (!name) return null;
  const m =
    name.match(/grp\.?\s*([A-L])/i) ||
    name.match(/group\s*([A-L])/i) ||
    name.match(/^([A-L])$/i);
  return m ? m[1].toUpperCase() : null;
}

// 순위 rows → { [letter]: sortedRows[] } (rankNo 오름차순)
export function buildStandingsByLetter(rows) {
  const map = {};
  for (const r of rows || []) {
    const letter = groupLetter(r.groupName);
    if (!letter) continue;
    (map[letter] ||= []).push(r);
  }
  for (const k of Object.keys(map)) {
    map[k].sort((a, b) => (a.rankNo ?? 99) - (b.rankNo ?? 99));
  }
  return map;
}

// 3위 와일드카드 순위 → [{ row, letter, rank, qualified }] (상위 8팀 진출)
// 경기를 한 번도 안 치른 조는 제외(킥오프 전 헛 표기 방지).
export function buildThirdPlaceRanking(standingsByLetter) {
  const thirds = [];
  for (const [letter, rows] of Object.entries(standingsByLetter || {})) {
    const started = rows.some((r) => (r.played ?? 0) > 0);
    if (!started) continue;
    if (rows[2]) thirds.push({ row: rows[2], letter });
  }
  thirds.sort(
    (a, b) =>
      (b.row.points ?? 0) - (a.row.points ?? 0) ||
      (b.row.goalDiff ?? 0) - (a.row.goalDiff ?? 0) ||
      (b.row.wins ?? 0) - (a.row.wins ?? 0),
  );
  return thirds.map((t, i) => ({ ...t, rank: i + 1, qualified: i < 8 }));
}

// 진출권 계산 → { direct:Set<teamId>, wildcard:Set<teamId> }
export function computeQualifiers(standingsByLetter) {
  const direct = new Set();
  for (const rows of Object.values(standingsByLetter || {})) {
    const started = rows.some((r) => (r.played ?? 0) > 0);
    if (!started) continue;
    rows.slice(0, 2).forEach((r) => direct.add(r.fotmobTeamId));
  }
  const wildcard = new Set(
    buildThirdPlaceRanking(standingsByLetter)
      .filter((t) => t.qualified)
      .map((t) => t.row.fotmobTeamId),
  );
  return { direct, wildcard };
}

// 한 팀의 진출 상태: "direct" | "wildcard" | null
export function qualStatus(row, quals) {
  if (!quals || !row) return null;
  if (quals.direct.has(row.fotmobTeamId)) return "direct";
  if (quals.wildcard.has(row.fotmobTeamId)) return "wildcard";
  return null;
}
