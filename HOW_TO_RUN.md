# Ballix 실행 가이드

축구 경기 예측 풀스택 앱. **이 문서는 "어떻게 띄우고 쓰는가"만** 다룬다. 아키텍처/도메인 설명은 `CLAUDE.md`, API 스키마는 `API_SPEC.md` 참고.

## 구성

| 하위 프로젝트 | 스택 | 루트 | 포트 |
|---|---|---|---|
| REST API (백엔드) | Java 21, Spring Boot 4, Gradle, MySQL | `backend/` | 8080 |
| 웹 UI (프론트) | React 18, Vite, axios | `frontend/` | 5173 |
| FotMob 스크래퍼 | Python 3.12, Playwright, FastAPI | `fotmob_scraper/` | 8800 |

```
FotMob ──Playwright──> Python FastAPI(:8800) ──HTTP──> Spring Boot(:8080) ──> MySQL
                                                                          React(:5173)
```

데이터 흐름은 한 방향. **백엔드는 FotMob을 직접 안 긁고 반드시 Python 서비스를 거친다.** 일정·DB·폴링은 전부 백엔드가 소유하므로, 데이터를 채우려면 **MySQL → Python → 백엔드 순서로** 떠 있어야 한다.

환경은 **Windows + PowerShell**. gradlew는 `.\gradlew.bat`로 호출한다.

---

## 사전 준비 (최초 1회)

- **Java 21**, **Node.js 18+**, **Python 3.12**, **Docker Desktop** 설치
- Python 전용 venv (시스템 Python 3.15 alpha는 pydantic 빌드가 깨짐):
  ```powershell
  cd C:\ballix\fotmob_scraper
  py -3.12 -m venv .venv
  .venv\Scripts\python.exe -m pip install -r requirements.txt
  .venv\Scripts\python.exe -m playwright install chromium
  ```
- 백엔드 시크릿/설정은 `backend/src/main/resources/application.yml` (MySQL `root/1234`, DB `backend`, Google OAuth, Gemini 키 등)

---

## 방법 A — 도커 한 방 (권장)

루트 `docker-compose.yml`이 **MySQL + Python 스크래퍼 + 백엔드**를 한 번에 올린다. 프론트만 따로 띄운다.

```powershell
cd C:\ballix
docker compose up -d --build        # 전부 빌드+기동 (DB·fotmob healthy 후 backend 시작)
docker compose logs -f backend      # 로그 보기
docker compose down                 # 한 번에 내림 (DB 볼륨 유지)
docker compose down -v              # DB 볼륨까지 삭제(완전 초기화)

# 프론트는 로컬에서
cd C:\ballix\frontend
npm install
npm run dev                         # http://localhost:5173
```

> ⚠️ 3306 포트를 이미 점유한 MySQL(로컬 설치본 또는 옛 `backend/docker-compose.yml` 컨테이너)이 있으면 충돌한다. 옛 mysql 컨테이너를 쓰던 경우 `docker stop backend` 후 위 명령을 사용. 도커 DB는 별도 볼륨(`ballix_mysql-data`)이라 기존 데이터는 안 넘어오지만, 부팅 시 일정 동기화 + lazy 크롤로 다시 채워진다.

---

## 방법 B — 개별 프로세스 (4개, 순서 중요)

백엔드 일정 동기화가 동작하려면 MySQL과 Python 서비스가 **먼저** 떠 있어야 한다. 터미널 4개를 띄운다.

```powershell
# 1. MySQL (DB만 도커로)
cd C:\ballix\backend
docker compose up -d

# 2. Python FotMob 서비스 (전용 venv — 시스템 python 아님!)
cd C:\ballix\fotmob_scraper
.venv\Scripts\python.exe -m uvicorn api:app --host 127.0.0.1 --port 8800

# 3. 백엔드
cd C:\ballix\backend
.\gradlew.bat bootRun

# 4. 프론트
cd C:\ballix\frontend
npm install
npm run dev
```

접속: 웹 UI **http://localhost:5173**, API **http://localhost:8080**, 스크래퍼 **http://127.0.0.1:8800**.

---

## 자주 쓰는 명령어

```powershell
# 백엔드 테스트 / 빌드
cd C:\ballix\backend
.\gradlew.bat test
.\gradlew.bat test --tests "com.example.backend.SomeTest"   # 단일 클래스
.\gradlew.bat compileJava                                    # 컴파일만 확인

# 프론트
cd C:\ballix\frontend
npm run build
npm run lint

# Python 스크래퍼 CLI (FastAPI와 별개, Excel 내보내기)
cd C:\ballix\fotmob_scraper
.venv\Scripts\python.exe main.py <matchId>                   # output/*.xlsx
.venv\Scripts\python.exe main.py search "Korea" "Czechia" --comp "World Cup"

# DB 직접 보기
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -uroot -p1234 backend
```

---

## 동작 방식 (쓰면서 알아둘 것)

- **데이터는 자동으로 채워진다.** 백엔드가 부팅 10초 뒤 + 30분마다 FotMob 일정을 동기화하고, 경기 상세/순위는 처음 조회될 때 즉석 크롤 후 DB에 캐시한다(DB-first lazy). 빈 DB로 시작해도 잠시 기다리면 채워진다.
- **로그인**은 Google OAuth. `예측`·`내 전적`·`댓글 작성` 등은 로그인이 필요하고, 경기/순위/공지 조회는 공개다.
- **관리자 기능**(AI 예측 생성, 공지 작성, 유저/권한 관리, 다시보기 등록)은 `role == ADMIN_USER` 계정에서만 UI가 보인다.
- **예측 가능 리그**는 기본 월드컵(leagueId `77`)만 (`application.yml`의 `prediction.allowed-leagues`).

---

## 자주 겪는 함정

- **백엔드 재부팅 전 8080 포트의 기존 프로세스를 반드시 종료.** 안 그러면 새 빌드가 포트 충돌로 안 뜨고 구버전이 응답해 "엔드포인트가 302/404로 사라진 것처럼" 보인다.
- **`api.py`를 수정하면 uvicorn을 재시작**해야 한다(코드 자동 리로드 없음).
- **Python은 반드시 `fotmob_scraper/.venv`의 3.12**를 쓴다. 시스템 Python 3.15(alpha)는 pydantic 빌드가 깨진다.
- **MySQL은 3306을 잡은 쪽에 붙는다** — 로컬 설치본과 도커가 충돌할 수 있다. 어느 쪽이든 접속정보는 동일(`root/1234`, DB `backend`).
- JPA `ddl-auto: update`라 엔티티 추가 시 컬럼/테이블이 자동 생성된다(마이그레이션 불필요).
