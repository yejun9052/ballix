# 승부예측 · 채점 · 역배 가중 포인트제

경기 결과 예측 저장/조회 + 자동 채점. 관련: `com.example.backend.prediction`.

---

## 1. 예측 저장/조회

- `POST /api/prediction/predict?matchId=&predictedWinner=`(저장/수정), `GET myPrediction`·`findByMatch`·`ratio` — **전부 로그인 필요**.
- 예측값 `Winner` enum(`HOME_TEAM`/`AWAY_TEAM`/`DRAW`) — `Match.winner`와 같은 어휘라 채점 시 `.name()`로 비교.
- **가드 순서**: 비로그인 → 없는 경기 → **예측 허용 리그 아님**(`prediction.allowed-leagues`, 기본 `77`=월드컵) → 킥오프 지남.
- `ratio`(분포 %)는 **본인이 예측한 경기만** 조회 가능(예측 전 거절) → 분포가 선택을 편향시키지 않게.

---

## 2. 자동 채점 (두 경로, 멱등)

둘 다 `PredictionService.gradeMatch()` 호출, `Prediction.isGraded()`로 중복 집계 방지:

1. `FotmobSyncService.applySyncResult()` — 폴링으로 **종료 감지 시 즉시 채점**.
2. `FotmobScheduleService.persistSchedule()` — 일정 동기화 중 **이미 FINISHED 된 경기 발견 시 채점**(폴링 창 밖 종료 커버).

이 때문에 `fotmob → prediction` 단방향 의존.

---

## 3. 역배 가중 포인트제 (`computePoints`)

채점 시 **그 경기의 AI 승률(`Match.aiHomePct/aiDrawPct/aiAwayPct`)** 순위로 차등 점수:

```
점수 = (유저가 고른 결과보다 AI 확률이 "높은" 결과 개수) + 1     (단, 적중 시에만; 틀리면 0)
```

| 유저 선택의 AI 확률 순위 | 의미 | 점수 |
|---|---|---|
| 1위(본명, 가장 유력) | 무난한 적중 | **1점** |
| 2위 | 약한 역배 | **2점** |
| 3위(최대 역배) | 큰 역배 적중 | **3점** |
| 틀림 | — | **0점** |

- **AI 예측 없는 경기**는 적중 시 일괄 **1점**.
- 획득 점수는 `Prediction.earnedPoints`에 기록, `User.scorePrediction(correct, points)`가 누적 `User.score`에 더함.
- 적중수/적중률(`correct_count`)도 함께 유지(같이 표시).
- → `prediction → ai 데이터(Match)` 참조.

### 예시

AI 승률이 `홈 47% / 무 28% / 원정 25%` 인 경기에서:
- 유저가 **홈** 선택 → 적중 시 1점(홈이 1위)
- 유저가 **무** 선택 → 적중 시 2점(무가 2위)
- 유저가 **원정** 선택 → 적중 시 **3점**(원정이 3위=최대 역배)

---

## 4. 리더보드

- `GET /api/user/leaderboard`(공개) — **누적 포인트 `score` 내림차순** 랭킹(`RankView` DTO).
- 집계 원천(`User.score`/`correct_count`/`matches_played`)은 위 채점이 갱신.
