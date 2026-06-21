# DEV_NOTES.md
> 코드 읽다가 헷갈리는 구조·로직·주의사항 정리. 아키텍처 개요는 CLAUDE.md 참고.

---

## 1. 라이브 시계 (진행 분 표시)

### 저장 구조
`Match` 엔티티에 두 컬럼이 있다:

| 컬럼 | 타입 | 내용 |
|---|---|---|
| `liveTime` | `String` | FotMob 표시 라벨 (`"67'"`, `"45+2'"`, `"HT"`) |
| `liveStartedAt` | `LocalDateTime` | 앵커 시각 = `지금 - liveSeconds` |

앵커 방식의 핵심: **`liveStartedAt`은 고정값**이라 이후 어느 시점이든 `현재시각 - liveStartedAt = 경과초`가 된다.
서버 부하 없이 프론트가 `setInterval` 1초 틱으로 혼자 시계를 흘린다.

### 백엔드 갱신 2트랙

```
3분 폴링 (syncMatch → updateLiveIfAbsent)
  └─ 앵커가 null일 때만 1회 설정, 이미 있으면 스킵
  └─ 이유: 잦은 재앵커가 FotMob SSR 지연으로 시계를 뒤로 튀게 만들기 때문

11분 시계폴링 (refreshLiveClock → updateLive)
  └─ 항상 최신 앵커로 덮어씀
  └─ FotMob SSR도 ~10분 주기 갱신이라 11분이 맞다
```

### 프론트 계산 (FotmobTester.jsx)

```js
// 1초마다 now 갱신
setInterval(() => setNow(Date.now()), 1000);

// 매 렌더: (now - liveStartedAt)으로 경과초 계산
const sec = Math.floor((now - new Date(m.liveStartedAt).getTime()) / 1000);

// 60초마다 MatchDay API 재호출 → 최신 liveStartedAt 흡수
```

### HT(하프타임) 처리
`liveTime`이 `"HT"`처럼 숫자가 없는 라벨이면 시계를 멈추고 그대로 표시한다.
`liveClock()` 함수에서 숫자 regex 체크가 `liveStartedAt` 계산보다 먼저 오므로 정상 동작.

### 알려진 버그: `updateLiveIfAbsent` liveTime 라벨 미갱신

`FotmobSyncService.applySyncResult` → `updateLiveIfAbsent` 에서 앵커가 이미 있으면 `liveTime` 라벨도 바꾸지 않는다:

```java
// Match.java 현재 코드
if (this.liveStartedAt == null && liveSeconds != null) {
    this.liveTime = liveTime;       // 앵커 없을 때만 라벨도 같이 설정
    this.liveStartedAt = ...;
}
```

결과: `"45'"` → `"45+2'"` 추가시간 진입 시 3분 폴링에서 반영 안 되고, 11분 시계폴링까지 기다려야 한다.
추가시간 `+N` 표시가 최대 11분 늦게 뜰 수 있다.

수정안:
```java
if (liveTime != null) this.liveTime = liveTime;  // 라벨은 항상 업데이트
if (this.liveStartedAt == null && liveSeconds != null) {
    this.liveStartedAt = LocalDateTime.now().minusSeconds(liveSeconds);
}
```

---

## 2. 타임존 주의사항

### liveStartedAt — 배포 시 9시간 오차 위험

`liveStartedAt`은 `LocalDateTime` (timezone 없음)으로 저장·직렬화된다.
JSON 응답: `"2026-06-11T09:33:51"` (timezone 없음)

브라우저에서 `new Date("2026-06-11T09:33:51")`는 **로컬 시간대로 해석**한다.

| 환경 | 결과 |
|---|---|
| 로컬 개발 (서버·클라이언트 모두 KST) | 정상 |
| UTC 서버 배포 + KST 브라우저 | **9시간 오차 발생** |

배포 시 수정 방법: `liveStartedAt`을 `Instant` 또는 `ZonedDateTime`으로 바꾸거나, JSON 직렬화 시 `+09:00` suffix 붙이기.

### matchTime — KST 저장 일관성

`Match.matchTime`은 KST(UTC+9)로 저장한다. `FotmobScheduleService.toKst()`에서 `OffsetDateTime.parse(utcTime).plusHours(9)` 처리.
DB에 저장된 값과 FotMob UTC 원본 사이에 변환이 끼어 있으니 날짜 계산 시 혼동 주의.

---

## 3. FotMob 데이터 특성

### SSR 스냅샷 지연
FotMob은 `/api/matchDetails` 직접호출이 차단되어 `__NEXT_DATA__` SSR 스냅샷만 읽을 수 있다.
이 값은 실제 경기 시각보다 **수 분 지연**된다.

영향:
- `liveSeconds`가 실제보다 낮게 들어옴 → 앵커가 약간 늦게 설정됨
- 이건 버그가 아니라 소스 한계. 11분 재앵커로 오차를 주기적으로 보정.

### 평점 없는 경기
소규모 친선 경기 등은 FotMob이 스탯을 커버하지 않아 전 선수 `rating=null`로 내려온다.
`LineupPlayer.rating`이 null인 것은 정상이다.

### leagueId vs 이름 필터
수집 리그는 `fotmob.schedule.leagues` 설정으로 필터한다.
- **숫자** → `leagueId` 정확 매칭 (권장)
- **문자열** → `leagueName` 부분 매칭 (위험: 여자/U21/클럽 파생 리그가 같은 이름을 씀)

기본값 `77,114` = FIFA 월드컵 + 남자 A매치 친선.

---

## 4. HTTP-in-transaction 방지 패턴 (self-proxy)

**문제**: `@Transactional` 메서드 안에서 HTTP 크롤을 하면, 네트워크 I/O 동안 DB 커넥션을 점유한다.
커넥션 풀 고갈 → 데드락 위험.

**해결**: `@Lazy @Autowired self`로 자기 프록시를 주입해 HTTP와 트랜잭션을 분리.

```java
// FotmobSyncService.java 패턴
@Lazy @Autowired
private FotmobSyncService self;

// HTTP 크롤 — @Transactional 없음
public void syncMatch(Match match) {
    FotmobMatchResponse resp = fotmobClient.getMatch(...);  // 네트워크 I/O
    self.applySyncResult(match.getId(), resp);              // 프록시 경유 → @Transactional 정상 작동
}

// DB 저장만 — @Transactional
@Transactional
public void applySyncResult(Long matchId, FotmobMatchResponse resp) { ... }
```

`FotmobScheduleService`, `FotmobSyncService` 둘 다 이 패턴을 쓴다.
새 sync 서비스 만들 때 반드시 따라야 한다. self-invocation(`this.xxx()`)은 프록시를 우회해 `@Transactional`이 무시된다.

---

## 5. 엔티티 직접 직렬화 vs DTO

| 응답 | 방식 | 이유 |
|---|---|---|
| 경기 목록/상세 | 엔티티 직접 | 필드가 많고 그대로 내려도 무방 |
| 예측 응답 | `PredictionView` DTO | `User` 연관(email 등) 노출 차단 |
| 유저/리더보드 | `UserView`/`RankView` DTO | email, password 등 민감 정보 차단 |

`BaseTimeEntity`의 `@JsonIgnoreProperties({"hibernateLazyInitializer","handler"})`가 LAZY 연관 직렬화 시 프록시 노이즈를 제거한다.
`spring.jpa.open-in-view=true`(기본)라 컨트롤러 직렬화 시점까지 LAZY 연관이 로드된다.

---

## 6. 예측 채점 두 경로

채점은 항상 `PredictionService.gradeMatch()`를 호출하며 `Prediction.isGraded()`로 중복 방지(멱등).

```
경로 1: FotmobSyncService.applySyncResult()
  └─ 폴링 중 resp.finished() 감지 → 즉시 채점
  └─ 커버: 폴링 창(킥오프 ±12h) 안에서 끝난 경기

경로 2: FotmobScheduleService.persistSchedule()
  └─ 일정 동기화 중 기존 경기가 FINISHED로 바뀌었으면 채점
  └─ 커버: 폴링 창 밖(오래된 경기 재동기화 등)에서 끝난 경기
```

두 경로 모두 없으면 폴링 창 밖에서 종료된 경기가 채점 안 된다.

---

## 7. 보안

### 인증 필요 API → 401 JSON 응답

`SecurityConfig.java`에서 `/api/` 경로는 미인증 시 OAuth 리다이렉트(302) 대신 401 JSON을 반환한다:
```json
{"success": false, "msg": "로그인이 필요합니다.", "data": null}
```
`/api/`가 아닌 경로(브라우저 직접 접근)는 기존 OAuth 리다이렉트 유지.

### JWT 쿠키 설정
- `HttpOnly`: JS 접근 불가 (XSS 방어)
- `SameSite`: `app.cookie.same-site` 설정값(로컬 기본 `Lax`, 운영은 `None`+`Secure` — 프론트(Vercel)·백엔드(Render) 크로스도메인 쿠키용). `app.cookie.secure`도 함께 주입.
- `MaxAge=3600`: JWT 만료(1h)와 일치

### Spring Security 7 CSRF 비활성화 주의
`.csrf(AbstractHttpConfigurer::disable)` — 메서드 레퍼런스 형태만 동작.
`.csrf(c -> c.disable())` 람다형은 조용히 무시되어 모든 POST가 302로 튄다.

---

## 8. Spring Boot 4 / Jackson 3 주의

Spring Boot 4는 Jackson 3(`tools.jackson.databind`)을 사용한다.
`RestClient`의 메시지 컨버터도 Jackson 3이라 외부 응답을 Jackson 2 타입(`com.fasterxml.jackson.databind.JsonNode`)으로 받으면 `Type definition error`가 난다.

```java
// 틀림 — Jackson 2 JsonNode로 받기
SomeResponse resp = restClient.get().uri(...).retrieve().body(JsonNode.class);

// 맞음 — Map으로 받아 직접 탐색
Map<String, Object> resp = restClient.get().uri(...).retrieve().body(Map.class);
```

모델 출력 파싱 등 Spring 컨버터와 무관한 용도로 Jackson 2 `ObjectMapper.readTree()`를 독립 사용하는 것은 문제없다.

---

## 9. 개발 환경 체크리스트

```
백엔드 재부팅 전: 8080 포트 기존 프로세스 종료 필수
  → 안 하면 구버전이 응답해 "엔드포인트가 사라진 것처럼" 보임

Python 수정 후: uvicorn 수동 재시작 필수 (자동 리로드 없음)

MySQL: 로컬 8.0이 3306 점유 중 → docker compose up 시 포트 충돌 가능
  → 어느 쪽이든 접속정보 동일 (root/1234, DB `backend`)

Python venv: fotmob_scraper/.venv (Python 3.12 전용)
  → 시스템 Python 3.15 alpha는 pydantic 빌드 깨짐
```
