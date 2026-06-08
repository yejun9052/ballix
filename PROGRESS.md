# Ballix 진행상황

풀스택 축구 경기 예측 앱. 데이터는 전부 FotMob에서 수집.
최종 업데이트: 2026-06-09

> 아키텍처/명령어 상세는 `CLAUDE.md`, 프론트 연동 API는 `API_SPEC.md` 참고.

```
FotMob ──Playwright──> Python FastAPI(:8800) ──HTTP──> Spring Boot(:8080) ──> MySQL
                                                                          React(:5173)
```

---

## ✅ 완료

### 데이터 수집 (FotMob)
- [x] 일정·라인업·이벤트·평점·순위 자동 동기화 + 킥오프 주변 폴링
- [x] 리그 필터를 **leagueId 방식**으로(기본 `77`=월드컵, `114`=남자 친선) — 이름이 같은 여자/U21/클럽 파생 리그 정확히 배제
- [x] **DB-first lazy-cache** — 순위·경기상세 조회 시 비었으면 1회만 크롤+저장, 이후 DB
- [x] 크롤 부하 축소(`refresh-past-days`=2: 주기 재동기화는 과거 2일만)
- [x] 팀 엠블럼, KST 저장, 종료 시 순위 갱신

### 예측
- [x] 예측 저장/수정/조회 API (로그인 필요)
- [x] 검증 — `Winner` enum / 허용 리그(`prediction.allowed-leagues`) / 킥오프 지남 / 중복 수정
- [x] **예측 비율 %** (`/ratio`, 본인이 예측한 뒤에만 공개)
- [x] **자동 채점** — 경기 종료 시 `isCorrect` 기록 + 유저 전적(`matches_played`/`correct_count`) 갱신, 멱등

### 유저 / 랭킹
- [x] Google OAuth2 로그인 → JWT HTTP-only 쿠키, `@AuthenticationPrincipal Long userId`
- [x] `GET /api/user/me`(내 전적·적중률), `GET /api/user/leaderboard`(적중순 랭킹)

### 인프라 / 정리
- [x] 커스텀 예외 계층(`BusinessException`/BadRequest/NotFound/Unauthorized) + 전역 핸들러
- [x] 응답 DTO화(`PredictionView`/`UserView`/`RankView`) — User(email) 비노출
- [x] 패키지 정리: `matche → match` rename, `fotmob.{lineup,matchevent,league}` 하위 분리
- [x] lazy-proxy 직렬화 노이즈 제거(`BaseTimeEntity @JsonIgnoreProperties`)
- [x] 과거 잔재/중복 데이터 청소

### 프론트 (테스트 콘솔 `FotmobTester.jsx`)
- [x] 탭: 📅 일정 · 🏆 순위 · 🎯 예측 · 🏅 랭킹 · 🛠 도구
- [x] 예측 탭(로그인→경기→예측→비율), 랭킹 탭(내 전적+리더보드), 도구 탭 일수 입력

### 문서
- [x] `CLAUDE.md`(아키텍처/함정), `API_SPEC.md`(프론트 전달용 응답 스키마)

---

## 🔜 다음 / TODO

| 우선 | 항목 | 메모 |
|---|---|---|
| — | 관리자 엔드포인트 권한 | **의도적으로 미적용**(현재 `/api/**` permitAll) |
| 중 | 순위 stale 방지 | `LeagueStanding.createAt` 기준 TTL(예: 6h) 재크롤 |
| 중 | 5대리그 추가 | `leagues`에 `47`(PL)·`87`(라리가)·`42`(UCL) 추가 — **DB 변경 불필요**, 단 6월은 비시즌이라 경기 없음 |
| 낮 | OAuth 쿠키 `SameSite` | 로컬 OK, 다른 도메인 배포 시 `None; Secure` 필요 |
| 낮 | 테스트 코드 | `gradeMatch` 멱등·`predict` 가드·`getRatio`부터 |
| 낮 | `backend/boot.out.log` | 임시 로그가 git 추적 중 → `.gitignore` + `git rm --cached` |

---

## ⚙️ 실행 (4개 프로세스, 순서 중요)
1. MySQL (3306, DB `backend`)
2. Python: `fotmob_scraper/.venv\Scripts\python.exe -m uvicorn api:app --host 127.0.0.1 --port 8800`
3. 백엔드: `backend/.\gradlew.bat bootRun`
4. 프론트: `test-api/npm run dev`

> 설정 시크릿은 `backend/src/main/resources/application.yml`(gitignore). 템플릿은 `application.yml.example` 복사 후 채우기.
