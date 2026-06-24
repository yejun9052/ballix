# 셀프호스트 배포 세션 기록 (2026-06-22)

> 이 PC(집 우분투)에서 Claude Code와 진행한 **셀프호스트 배포 작업 기록**이다.
> 터미널 세션이 닫히면 대화가 사라지므로, 다음에 이어서 하거나 다른 Claude Code 세션이 인계받을 수 있게 남긴다.
> **다음 할 일은 [TODO.md](TODO.md) 0번 섹션** 참고. 배포 방법 상세는 [LINUX_SELFHOST_DEPLOY.md](LINUX_SELFHOST_DEPLOY.md).

---

## 1. 사용자가 원한 것 (요구사항)

- Render 무료 플랜 백엔드는 한계(스핀다운·OOM·DB 지연) → **이 우분투 PC로 셀프호스트 이전.**
- **관리(서버 껐다/켜기·SSH)는 나만**, **백엔드 API(데이터 조회 등)는 누구나 접근** 가능해야.
- **항상 켜두고 자동 재시작.** 평소 Docker로 Python+Spring Boot 실행.
- 외부 어디서든 접속해 관리 → **Tailscale** 사용 희망.
- 프로젝트는 GitHub(`yejun9052/ballix`)에서 clone.

## 2. 내린 결정 (왜 이렇게 했나)

- **Docker Compose** (mysql + fotmob(Python) + backend(Spring)): 프로젝트에 이미 `docker-compose.yml`·배포가이드 완비. Java 미설치라 도커가 적합.
- **외부 공개 = Tailscale Funnel** (가이드의 Cloudflare Tunnel 대신): 도메인 불필요, Tailscale 하나로 통합. 공개주소 `*.ts.net` 고정.
- **관리 = Tailscale SSH** (`--ssh`): 나만, tailnet 경유. 공개 SSH는 안 엶.
- **시크릿 = gitignore된 `.env`로 분리**: `docker-compose.yml`이 git 추적 대상이라 평문 비번 커밋 방지. 런타임 env 주입이라 시크릿 바꿔도 재빌드 불필요.
- **NOPASSWD sudo**: 이 세션에서 sudo 비번 입력이 안 돼(터미널 비대화형), `/etc/sudoers.d/lee-nopasswd`로 임시 부여. **마무리 후 원복 권장.**

## 3. 완료한 작업 (2026-06-22)

1. 저장소 clone → `~/바탕화면/ballix`.
2. `docker.io` + `docker-compose-v2` 설치, 부팅 자동시작(enable), `lee`를 docker 그룹에 추가.
3. Tailscale 설치(apt 공식 저장소, resolute), `tailscale up --ssh`로 로그인.
   - 기기 `lee-h81m-ds2v`, IP `100.119.208.92`, 계정 `yejun9052@`, MagicDNS `taile904f8.ts.net`.
4. `docker-compose.yml` 보안 강화: mysql·fotmob 호스트포트 삭제, backend `127.0.0.1:8080`만, mysql healthcheck `start_period:180s`(첫 부팅 초기화 ~2분 대응) + 인증검증(SELECT)으로 교체.
5. `application.yml` 생성(`.example`에서) — DB비번·JWT 자동생성해 채움, 운영키(frontend-base-url·CORS·쿠키 None/Secure) 추가, 권한 600, gitignore 확인.
6. **전체 기동 성공**: 3컨테이너 healthy, 백엔드 `Started BackendApplication`, `curl localhost:8080/api/match/allMatch` → 200. (데이터는 빈 상태, 스케줄러+크롤로 채워짐)
7. 시크릿을 `.env`로 분리 + `docker-compose.yml`을 `${...}` 참조로 리팩터링(평문 0개), 루트 `.gitignore`에 `.env` 추가, `.env` 권한 600.
8. **추가 보안**: UFW 활성(default deny incoming / allow outgoing / `allow in on tailscale0`), `unattended-upgrades` 활성.

## 4. 현재 상태 (이 PC)

- 3컨테이너 실행 중(`restart: unless-stopped`), Docker·Tailscale·UFW·unattended-upgrades 부팅 자동시작.
- 백엔드 로컬 접속만 가능(`127.0.0.1:8080`). **외부 공개(Funnel)는 아직 안 함.**
- 로컬 개발 가능: `cd frontend && npm run dev` → `localhost:8080` 백엔드에 붙음.
- 재부팅/종료해도 그냥 다시 켜면 자동 복구(직접 `docker compose stop` 한 경우만 예외).

## 5. 막혔던 점 / 주의 (다음에 참고)

- **MySQL 첫 부팅이 ~2분** 걸려 healthcheck가 unhealthy로 오판 → backend가 중단됐었음. `start_period:180s` 추가로 해결.
- **`mysqladmin ping`은 인증 실패해도 통과** → healthcheck를 `mysql -e "SELECT 1"`로 바꿔 실제 인증 검증.
- **Claude Code 세션에선 `tailscale funnel`/`serve` 설정 명령이 차단**(즉시 종료, exit 144)됨. → **Funnel은 사용자가 직접 터미널에서 실행해야 함.**
- Docker Hub 익명 토큰 404는 일시 오류 → 재시도하면 됨.
- 로컬 MySQL은 빈 DB로 시작. 기존 TiDB 데이터는 미이전(필요하면 별도 마이그레이션).

## 6. 남은 일 → [TODO.md](TODO.md) 0번 섹션

①`.env` 시크릿 3개 채우기 → ②`tailscale funnel --bg 8080` → ③Google OAuth 리다이렉트 URI 등록 → ④Vercel `VITE_API_BASE_URL` 변경+재배포 → ⑤확인+관리자권한.
공개 예정 주소: **`https://lee-h81m-ds2v.taile904f8.ts.net`**

## 7. 핵심 값/위치 빠른참조

- 저장소: `~/바탕화면/ballix`
- 시크릿: `.env`(DB_PASSWORD 채움, GOOGLE_CLIENT_ID/SECRET·GEMINI_API_KEY는 `FILL_ME`) — Render 백엔드 Environment에서 복사
- 백엔드 설정: `backend/src/main/resources/application.yml`(gitignore, 600)
- 공개주소: `https://lee-h81m-ds2v.taile904f8.ts.net` / OAuth 콜백 `.../login/oauth2/code/google`
- 프론트(Vercel): `https://ballix-ochre.vercel.app`
- 관리: `cd ~/바탕화면/ballix && docker compose {ps|logs -f backend|stop|start|restart backend}`
- 원격: 다른 기기 Tailscale 로그인(`yejun9052@`) → `ssh lee@lee-h81m-ds2v`
- NOPASSWD sudo 원복: `sudo rm /etc/sudoers.d/lee-nopasswd`

---

# 2번째 세션 — 외부공개 완료 (2026-06-24)

## 1. 한 일

1. `git pull`(c931cdc→1f655e1, 7커밋): 선수카드 뽑기·선수 시즌스탯(득점왕/도움왕)·가상 AI 리더보드 유저·월드컵 브래킷·AI 승률 설명박스 등 신규 기능 합류.
2. **빌드 검증**: 프론트 `npm run build` ✅(PlayerCard/PlayerStats 청크 포함), 백엔드 도커 빌드 `BUILD SUCCESSFUL` ✅. `docker compose up -d --build`로 최신 코드 재배포(3컨테이너 healthy, `Started in 21.5s`).
3. **Funnel 외부공개**: 사용자가 직접 `tailscale funnel --bg 8080` 실행 → `https://lee-h81m-ds2v.taile904f8.ts.net` 공개. 외부경로 `/api/match/allMatch` 200·실데이터 확인.
4. **시크릿 3개 주입**: `.env`의 GOOGLE_CLIENT_ID/SECRET·GEMINI_API_KEY 채움 → `docker compose up -d backend`. OAuth 인가요청에 실 client_id 들어가는 것 확인.
5. **OAuth redirect_uri http→https 버그 수정**: Funnel이 TLS 종단 후 백엔드엔 http로 넘겨, Spring이 `redirect_uri=http://...ts.net/...`로 생성(구글 정확매칭 실패) → `docker-compose.yml` backend env에 **`SERVER_FORWARD_HEADERS_STRATEGY: framework`** 추가, 재기동 후 `https://...`로 교정 확인.
6. 사용자가 ④ Google OAuth 리다이렉트 URI 등록 + ⑤ Vercel `VITE_API_BASE_URL` 변경·재배포 → 프론트 로그인 성공.
7. **관리자 권한 부여**: `leey217423@gmail.com`(id=2) → `ADMIN_USER`. (id=1 `ai-bot@ballix.local`은 리더보드용 가상계정이라 그대로.)

## 2. 막혔던 점 / 알게 된 것

- **로그인이 깨지는 핵심 원인**=프록시 뒤 스킴. `tailscale funnel status`로 매핑 확인 + `curl -I .../oauth2/authorization/google`의 `Location`에서 `redirect_uri` 스킴을 직접 보면 진단 빠름. `SERVER_FORWARD_HEADERS_STRATEGY: framework`가 해결(Host는 Funnel이 이미 올바로 전달, scheme만 문제였음).
- **백엔드 CORS·쿠키는 이미 OK**였음(`application.yml`: `app.frontend-base-url`·`app.cors.allowed-origins`=Vercel, 쿠키 `SameSite=None;Secure`). OAuth 성공 후 복귀도 `frontend-base-url` 설정값 사용이라 프록시 무관.
- **"로컬 네트워크 액세스 허용?" 프롬프트**: Tailscale 켜진 본인 기기에서 ts.net이 tailnet IP(100.x)로 직접 붙어 뜨는 것. 허용=안전(본인 서버). 외부 일반 사용자(Tailscale 無)는 공개 Funnel 경로라 이 창 안 봄.
- **`no configuration file provided: not found`**: compose 명령을 프로젝트 폴더 밖에서 실행 시. `cd ~/바탕화면/ballix` 먼저, 또는 `docker logs ballix-backend`(컨테이너명 직접).

## 3. 현재 상태 (완료)

- **외부에서 데이터 조회 + Vercel 프론트 로그인·AI·선수카드 전부 동작.** 공개 `https://lee-h81m-ds2v.taile904f8.ts.net`, 프론트 `https://ballix-ochre.vercel.app`.
- 컨테이너 `restart: unless-stopped` + Docker/tailscaled 부팅 자동시작 + Funnel `--bg`(영속) → **SSH 끊김·재부팅에도 자동 복구**. 조건: PC 전원 ON + 인터넷 연결.
- 미반영 git 변경(워킹트리): `docker-compose.yml`(forward-headers 추가 등 셀프호스트 보안), `docs/TODO.md`, `.gitignore`, 이 로그 — 커밋은 사용자 요청 시.
