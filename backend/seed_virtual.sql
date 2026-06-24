-- 가상 경기 시드 — 전체 스택 검증용(로컬 ballix_test). 멱등: 기존 가상 데이터 제거 후 재삽입.
SET @now = NOW(6);
DELETE FROM ai_prediction_snapshot WHERE match_id IN (901,902);
DELETE FROM predictions WHERE match_id IN (901,902);
DELETE FROM matches WHERE id IN (901,902);
DELETE FROM teams WHERE id IN (801,802,803,804);
DELETE FROM competitions WHERE id = 701;
DELETE FROM notices WHERE id = 601;
DELETE FROM users WHERE id IN (501,502,503,504);

-- 대회: 월드컵(fotmob 77)
INSERT INTO competitions (id, create_at, code, emblem, fotmob_league_id, name, type)
VALUES (701, @now, 'WC', '', 77, 'World Cup', 'CUP');

-- 팀
INSERT INTO teams (id, create_at, crest, fotmob_team_id, name, name_ko, short_name, tla) VALUES
 (801, @now, '', 6601, 'South Korea', '대한민국', 'Korea', 'KOR'),
 (802, @now, '', 8256, 'Brazil',      '브라질',   'Brazil','BRA'),
 (803, @now, '', 6716, 'Japan',       '일본',     'Japan', 'JPN'),
 (804, @now, '', 10243,'Germany',     '독일',     'Germany','GER');

-- 종료 경기: 대한민국 2-1 브라질 (역배 — AI는 브라질 우세로 봤으나 한국 승)
INSERT INTO matches
 (id, create_at, status, winner, home_score, away_score, match_time, fotmob_match_id,
  competition_id, home_team_id, away_team_id, prediction_enabled, lineup_synced, fotmob_finalized,
  ai_home_pct, ai_draw_pct, ai_away_pct, ai_home_score, ai_away_score,
  ai_initial_home_pct, ai_initial_draw_pct, ai_initial_away_pct, ai_initial_home_score, ai_initial_away_score,
  ai_initial_predicted_at, ai_predicted_at, stage, venue)
VALUES
 (901, @now, 'FINISHED', 'HOME_TEAM', 2, 1, DATE_SUB(@now, INTERVAL 2 HOUR), 4500901,
  701, 801, 802, 1, 1, 1,
  55, 22, 23, 2, 1,
  18, 24, 58, 0, 2,
  DATE_SUB(@now, INTERVAL 3 HOUR), DATE_SUB(@now, INTERVAL 10 MINUTE), 'Final', 'Lusail Stadium');

-- 진행 경기: 일본 vs 독일 (라이브 — 후반 60분경 앵커, 1-1)
INSERT INTO matches
 (id, create_at, status, home_score, away_score, match_time, fotmob_match_id,
  competition_id, home_team_id, away_team_id, prediction_enabled, lineup_synced, fotmob_finalized,
  ai_home_pct, ai_draw_pct, ai_away_pct, live_time, live_started_at, live_base_period, stage, venue)
VALUES
 (902, @now, 'IN_PLAY', 1, 1, DATE_SUB(@now, INTERVAL 70 MINUTE), 4500902,
  701, 803, 804, 1, 1, 0,
  33, 30, 37, '62''', DATE_SUB(@now, INTERVAL 3720 SECOND), 90, 'Semi-final', 'Allianz Arena');

-- AI 승률 히스토리(901): 경기 전 브라질 우세 → 한국 역전골로 반전
INSERT INTO ai_prediction_snapshot (create_at, match_id, phase_minute, home_pct, draw_pct, away_pct, home_score, away_score, reason) VALUES
 (DATE_SUB(@now,INTERVAL 180 MINUTE), 901, 0,  18, 24, 58, 0, 0, ''),
 (DATE_SUB(@now,INTERVAL 150 MINUTE), 901, 15, 20, 26, 54, 0, 0, '초반 양 팀 탐색전, 큰 변화 없음'),
 (DATE_SUB(@now,INTERVAL 135 MINUTE), 901, 30, 38, 24, 38, 1, 0, '전반 27분 손흥민 선제골로 한국 승률 약 18%p 상승'),
 (DATE_SUB(@now,INTERVAL 120 MINUTE), 901, 45, 34, 26, 40, 1, 1, '전반 종료 직전 브라질 동점골, 균형 회복'),
 (DATE_SUB(@now,INTERVAL 95 MINUTE),  901, 60, 30, 28, 42, 1, 1, '후반 브라질이 점유율 우위, 원정 승률 소폭 상승'),
 (DATE_SUB(@now,INTERVAL 80 MINUTE),  901, 75, 64, 20, 16, 2, 1, '후반 72분 한국 추가골 — 승률 역전(홈 64%)'),
 (DATE_SUB(@now,INTERVAL 70 MINUTE),  901, 90, 78, 14, 8,  2, 1, '후반 추가시간 한국 리드 유지, 승리 확정적');

-- 유저(리더보드)
INSERT INTO users (id, create_at, email, name, role, score, correct_count, matches_played, is_active, point_balance) VALUES
 (501, @now, 'admin@ballix.dev', '관리자',   'ADMIN_USER', 7600, 9, 12, 1, 12000),
 (502, @now, 'pro@ballix.dev',   '예측왕철수', 'COMMON_USER',     9200, 11, 14, 1, 8000),
 (503, @now, 'mid@ballix.dev',   '축구러버',  'COMMON_USER',      3100, 5, 12, 1, 5000),
 (504, @now, 'new@ballix.dev',   '뉴비',     'COMMON_USER',       500, 1, 3,  1, 1000);

-- 예측(901, 채점 완료된 형태) — 철수: 역배 한국승 적중 2000점 / 축구러버: 브라질 오답 0점
INSERT INTO predictions (create_at, match_id, user_id, predicted_winner, is_correct, earned_points) VALUES
 (@now, 901, 502, 'HOME_TEAM', 1, 2000),
 (@now, 901, 503, 'AWAY_TEAM', 0, 0),
 (@now, 901, 504, 'HOME_TEAM', 1, 2000);

-- 공지(게시중)
INSERT INTO notices (id, create_at, title, content, author_id, author_name, publish_at, expire_at) VALUES
 (601, @now, '월드컵 예측 이벤트 오픈!', '결승전 예측에 참여하고 역배 포인트를 노려보세요. 최대 2000점!', 501, '관리자',
  DATE_SUB(@now, INTERVAL 1 DAY), NULL);

SELECT 'seed done' AS status,
 (SELECT COUNT(*) FROM matches WHERE id IN (901,902)) AS matches,
 (SELECT COUNT(*) FROM ai_prediction_snapshot WHERE match_id=901) AS snapshots,
 (SELECT COUNT(*) FROM users WHERE id BETWEEN 501 AND 504) AS users;
