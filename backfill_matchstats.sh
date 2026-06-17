#!/usr/bin/env bash
# 기존 종료 경기에 경기별 선수 스탯(matchStats)을 일괄 백필.
# 방식: 대상 경기의 lineup_synced=0 으로 되돌린 뒤 공개 GET 으로 lazy 재동기화를 유발
#       → 백엔드가 재크롤하며 lineup_player.match_stats_json 을 채운다(관리자 인증 불필요).
set -u

MYSQL="/c/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe"
DB_ARGS="-h127.0.0.1 -P3307 -uroot -p1234 backend"
API="http://localhost:8080"

# 대상 = 종료 경기 중 라인업에 스탯이 단 한 건도 없는 경기(아직 한 번도 백필 안 됨).
# (출전 안 한 벤치 선수는 원래 match_stats_json=null 이라 'ANY null'로 잡으면 안 됨.)
echo "[backfill] 대상 경기 조회..."
IDS=$("$MYSQL" $DB_ARGS -N -e "
  SELECT m.id
  FROM matches m JOIN lineup_player lp ON lp.match_id=m.id
  WHERE m.fotmob_match_id IS NOT NULL
    AND (m.status='FINISHED' OR m.fotmob_finalized=1)
  GROUP BY m.id
  HAVING COUNT(lp.match_stats_json)=0
  ORDER BY m.id;" 2>/dev/null)

if [ -z "$IDS" ]; then echo "[backfill] 대상 없음. 종료."; exit 0; fi
TOTAL=$(echo "$IDS" | wc -l | tr -d ' ')
echo "[backfill] 대상 $TOTAL 경기."

# 1) lineup_synced=0 으로 일괄 리셋 (lazy 재동기화 유발 조건)
CSV=$(echo "$IDS" | paste -sd, -)
"$MYSQL" $DB_ARGS -e "UPDATE matches SET lineup_synced=0 WHERE id IN ($CSV);" 2>/dev/null

# 2) 경기별 GET 으로 재동기화 (백엔드가 크롤→matchStats 저장). 크롤 간격은 Python throttle 이 강제.
i=0
for id in $IDS; do
  i=$((i+1))
  code=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/match/$id/fotmob")
  echo "  [$i/$TOTAL] match $id -> HTTP $code"
done

# 3) 결과 확인 — 스탯이 0건인(아직 백필 안 된) 종료 경기 수
echo "[backfill] 완료. 남은 미백필 경기 수:"
"$MYSQL" $DB_ARGS -N -e "
  SELECT COUNT(*) FROM (
    SELECT m.id FROM matches m JOIN lineup_player lp ON lp.match_id=m.id
    WHERE m.fotmob_match_id IS NOT NULL AND (m.status='FINISHED' OR m.fotmob_finalized=1)
    GROUP BY m.id HAVING COUNT(lp.match_stats_json)=0
  ) t;" 2>/dev/null
