# 어드민 수동 조작 API

모든 엔드포인트는 `ROLE_ADMIN_USER` 권한이 필요합니다 (`@PreAuthorize("hasRole('ADMIN_USER')")`).

## 경기 데이터 동기화

| 엔드포인트 | 설명 |
|---|---|
| `POST /api/match/{matchId}/fotmob/sync` | 경기 1건 즉시 동기화 (라인업·이벤트·스코어·포메이션) |
| `POST /api/fotmob/schedule/sync?pastDays=&futureDays=` | 날짜 범위 일정 동기화 + 시즌 전체 일정(월드컵 결승 대진 포함), 각 최대 30일 |
| `POST /api/fotmob/schedule/sync/{YYYYMMDD}` | 특정 날짜 일정만 동기화 |
| `POST /api/fotmob/standings/{competitionId}/sync` | 리그 순위 강제 갱신 (competitionId = 내부 Competition PK) |

## AI

| 엔드포인트 | 설명 |
|---|---|
| `POST /api/admin/ai/predict?matchId=&force=` | AI 승률 예측 생성. `force=true`면 이미 예측된 경기도 재생성. 종료/취소 경기는 거절. |

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
| `POST /api/admin/notice` | 공지 등록. Body: `{"title": "", "content": ""}` |
| `PUT /api/admin/notice/{id}` | 공지 수정. Body: `{"title": "", "content": ""}` |
| `DELETE /api/admin/notice/{id}` | 공지 삭제 |
| `GET /api/admin/users?page=&size=` | 전체 유저 목록 (기본 8건). email·권한·계정상태 포함. |
| `PUT /api/admin/users/{id}/role?role=` | 유저 권한 변경. `role=ADMIN_USER` 또는 `COMMON_USER`. 본인 변경 불가. |
| `PUT /api/admin/users/{id}/status?active=` | 유저 계정 활성(`true`) / 정지(`false`). 본인 변경 불가. |
