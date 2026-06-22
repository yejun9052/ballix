# 어드민 수동 조작 API

모든 엔드포인트는 `ROLE_ADMIN_USER` 권한이 필요합니다 (`@PreAuthorize("hasRole('ADMIN_USER')")`).

## 경기 데이터 동기화

| 엔드포인트 | 설명 |
|---|---|
| `GET /api/match/search?q=&status=` | **팀 이름으로 경기 검색** (matchId 대신 팀명으로 찾기). `q`=팀명 일부, `status`=선택(예 `FINISHED`). 최신순 페이지. |
| `POST /api/match/{matchId}/fotmob/sync` | 경기 1건 즉시 동기화 (라인업·이벤트·스코어·포메이션) |
| `POST /api/fotmob/schedule/sync?pastDays=&futureDays=` | 날짜 범위 일정 동기화 + 시즌 전체 일정(월드컵 결승 대진 포함), 각 최대 30일 |
| `POST /api/fotmob/schedule/sync/{YYYYMMDD}` | 특정 날짜 일정만 동기화 |
| `POST /api/fotmob/standings/{competitionId}/sync` | 리그 순위 강제 갱신 (competitionId = 내부 Competition PK) |
| `POST /api/fotmob/teams/translate` | 팀(나라) 이름 전체 재번역. `nameKo`가 비어있는 팀만 골라 Gemini로 한국어 번역. 응답 `data`=번역된 팀 수. '전체 재번역' 버튼용. |
| `POST /api/fotmob/details/backfill?sinceDays=&limit=` | 상세(라인업·이벤트) 누락 경기 일괄 보강. 최근 `sinceDays`(기본 14)일 내 시작된 경기 중 `lineupSynced=false`(크롤 실패 등)인 것을 최신순 `limit`(기본 8)건까지 다시 크롤. 스크래퍼가 직렬화/throttle. 건수가 많으면 `limit`를 나눠 여러 번 눌러 이어서 처리. 응답 `data`=보강된 경기 수. (스케줄러 prewarm과 대상 쿼리 `findDetailBackfillTargets` 공유.) |

## AI

| 엔드포인트 | 설명 |
|---|---|
| `POST /api/admin/ai/predict?matchId=&force=` | AI 승률 예측 생성. `force=true`면 이미 예측된 경기도 재생성. 종료/취소 경기는 거절. |

## 경기 다시보기 (유튜브)

| 엔드포인트 | 설명 |
|---|---|
| `PUT /api/admin/match/{id}/replay?youtube=` | 다시보기 등록(교체 포함). `youtube`= videoId(11자) 또는 유튜브 URL 그대로(watch/youtu.be/shorts/live/embed 지원). **종료 경기만.** |
| `DELETE /api/admin/match/{id}/replay` | 다시보기 해제 |

등록된 `replayYoutubeId`는 일반 경기 조회 응답에 포함됨 → 프론트는 `https://www.youtube.com/embed/{replayYoutubeId}` 로 iframe 임베드.

## 폴링 설정

| 엔드포인트 | 설명 |
|---|---|
| `GET /api/fotmob/poll-interval` | 현재 폴링 주기(분) 조회 (공개) |
| `POST /api/fotmob/poll-interval?minutes=` | 폴링 주기 런타임 변경. 재부팅 시 `application.yml` 값으로 초기화됨. |

## 조회/확인 (크롤 유발, DB 저장 없음)

| 엔드포인트 | 설명 |
|---|---|
| `GET /api/fotmob/preview/{fotmobId}` | fotmobMatchId로 라인업·이벤트 미리보기. DB에 저장하지 않음. |
| `GET /api/fotmob/search?team1=&team2=&competition=` | 팀명/대회로 FotMob matchId 후보 검색. |

## 공지·유저 관리

| 엔드포인트 | 설명 |
|---|---|
| `GET /api/admin/notice?page=&size=` | 전체 공지 목록 (게시 전 `SCHEDULED`/내려간 `EXPIRED` 포함, `status` 필드로 구분) |
| `POST /api/admin/notice` | 공지 등록. Body: `{"title": "", "content": "", "publishAt": "2026-06-15T09:00:00", "expireAt": "2026-06-16T00:00:00"}` — `publishAt` null=즉시 게시, `expireAt` null=무기한 |
| `PUT /api/admin/notice/{id}` | 공지 수정. `publishAt`/`expireAt`는 보낸 값으로 교체(null=즉시/무기한). `expireAt`을 현재 시각으로 보내면 즉시 내림. |
| `DELETE /api/admin/notice/{id}` | 공지 삭제 |

공개 목록(`GET /api/notice`)은 게시창(publishAt~expireAt) 안의 공지만 노출 — 배치 없이 조회 시점에 자동 게시/내림.
| `GET /api/admin/users?q=&page=&size=` | 전체 유저 목록 (기본 8건). `q`=이름 부분일치 검색(선택, 비면 전체). email·권한·계정상태 포함. |
| `PUT /api/admin/users/{id}/role?role=` | 유저 권한 변경. `role=ADMIN_USER` 또는 `COMMON_USER`. 본인 변경 불가. |
| `PUT /api/admin/users/{id}/status?active=&message=` | 유저 계정 활성(`true`) / 정지(`false`). 본인 변경 불가. `message`=정지 안내문(정지 시 선택) → 정지된 유저가 로그인하면 `/home?error=banned&msg=`로 전달, 정지 해제 시 함께 정리됨. |
