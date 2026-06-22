# 리눅스(우분투) 셀프호스트 배포 가이드

집 우분투 PC에 **백엔드(Spring) + 스크래퍼(Python) + MySQL**을 docker-compose로 올리고,
**Cloudflare Tunnel**로 외부에 HTTPS 공개하는 방법. 프론트는 Vercel 유지(또는 같은 PC).

> 이 문서는 집 PC에서 그대로 따라 하거나, 그 PC의 Claude Code에게 "이 문서대로 배포해줘"라고 시키는 용도다.
> 함께 읽을 것: 루트 `CLAUDE.md`(아키텍처·함정), `docs/SESSION_HANDOFF.md`(현 배포 상태).

---

## 0. 왜 셀프호스트 (요약)

- **스크래퍼 OOM 근본 해결**: Render 무료 512MB에서 Chromium이 죽던 문제 → RAM 넉넉한 집 PC면 사라짐.
- **DB 지연 해결**: MySQL도 같은 PC에 두면 백엔드↔DB ~1ms(크로스리전 ~200ms 제거).
- **무료 플랜 스핀다운 없음**: 항상 켜두면 콜드스타트 없음.
- 트레이드오프: **24/7 가동 + 터널 운영 + 보안 관리**를 직접 져야 함(아래 체크리스트).

아키텍처:
```
[브라우저] ──HTTPS──> Vercel(프론트, 정적)
                          │  API 호출 (https://api.<도메인>)
                          ▼
        Cloudflare ──Tunnel(아웃바운드)──> 집 우분투 PC
                                              docker-compose:
                                                backend(8080) ─ mysql(3306) ─ fotmob(8800)
```

---

## 1. 사전 준비 (집 우분투)

```bash
# Docker + compose 플러그인
sudo apt update
sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER          # 로그아웃/로그인 후 sudo 없이 docker 사용
# (Node는 프론트를 이 PC에서 띄울 때만 필요 — Vercel 쓰면 불필요)
```

(선택) Claude Code로 시킬 거면: Node 18+ 설치 후 `npm i -g @anthropic-ai/claude-code` → `claude` 로그인.

---

## 2. 레포 클론

```bash
git clone https://github.com/yejun9052/ballix.git
cd ballix
```

모노레포라 한 번에 `backend/`(Spring)·`fotmob_scraper/`(Python)·`frontend/`(React) 전부 받아진다.

---

## 3. ⚠️ 시크릿 세팅 — **가장 중요. 이거 안 하면 백엔드가 안 뜬다**

`backend/src/main/resources/application.yml`은 **.gitignore라 클론에 없다.** 직접 만들어야 한다.

```bash
cp backend/src/main/resources/application.yml.example \
   backend/src/main/resources/application.yml
chmod 600 backend/src/main/resources/application.yml     # 권한 잠금(소유자만 읽기)
```

그다음 `application.yml`을 열어 아래 플레이스홀더를 **실제 값**으로 채운다.

| 위치(yml 키) | 무엇 | 어디서 구하나 / 주의 |
|---|---|---|
| `spring.security.oauth2.client.registration.google.client-id` | Google OAuth 클라이언트 ID | Google Cloud Console → API/서비스 → 사용자 인증 정보 |
| `…google.client-secret` | Google OAuth 시크릿 | 〃 (노출됐으면 **재발급**) |
| `spring.datasource.password` | DB 비밀번호 | 아래 6장 compose와 **반드시 동일**하게 |
| `jwt.secret` | JWT 서명 키(HS256, **32자 이상**) | `openssl rand -base64 48` 로 생성 |
| `ai.gemini.api-key` | Gemini API 키 | Google AI Studio (노출됐으면 **재발급**) |

> **도커로 빌드하므로 `application.yml`이 파일로 존재해야 한다** — Dockerfile이 빌드 시 소스를 복사해 jar에 넣는다.
> 클론만 하고 이 파일을 안 만들면 jar에 설정이 없어 부팅 실패한다.

### 운영 전용 키도 함께 추가 (외부 공개용)

같은 `application.yml` 맨 아래에 **운영(HTTPS·크로스도메인)용 키**를 추가한다. 도메인은 7장에서 정한다.

```yaml
app:
  # 프론트(Vercel) 도메인. OAuth 로그인 성공 후 여기로 리다이렉트
  frontend-base-url: https://ballix.vercel.app
  cors:
    # 프론트 도메인만 허용(쉼표구분). 와일드카드(*) 금지 — 쿠키 인증과 같이 쓰면 위험
    allowed-origins: https://ballix.vercel.app
  cookie:
    # 프론트와 백엔드가 다른 도메인(크로스사이트)이면 None+Secure 여야 쿠키가 전송됨
    same-site: None
    secure: true
```

> **같은 도메인**으로 묶을 거면(7-B) `same-site: Lax`, `cors.allowed-origins`도 그 도메인 하나면 된다(더 안전).

---

## 4. 노출된 키 재발급 (이전에 채팅/공개 경로에 노출된 적 있으면 필수)

노출된 키는 인터넷 어딘가에 남았다고 가정한다. 옮기기 전에 전부 새로 발급:

- **DB 비밀번호**: 6장 compose `MYSQL_ROOT_PASSWORD` + `SPRING_DATASOURCE_PASSWORD` + yml `spring.datasource.password` 동시 변경.
- **Google client-secret**: Cloud Console → 사용자 인증 정보 → 해당 OAuth 클라이언트 → "비밀 재설정".
- **Gemini api-key**: AI Studio에서 키 삭제 후 새로 발급.
- **jwt.secret**: `openssl rand -base64 48` 로 새로 생성(바꾸면 기존 로그인 세션 전부 만료 → 재로그인하면 됨).

---

## 5. (보안) 내부 서비스는 외부에 노출하지 않기 — compose 포트 조이기

기본 `docker-compose.yml`은 mysql(3307)·fotmob(8800)·backend(8080)를 **호스트 0.0.0.0**에 공개한다.
셀프호스트에선 **백엔드만** 터널에 연결하고, **MySQL·스크래퍼는 외부는 물론 LAN에도 안 보이게** 한다.

`docker-compose.yml`에서 mysql·fotmob의 `ports:`를 다음 중 하나로 바꾼다.

- **방법 A (권장)**: 호스트 공개를 아예 **삭제**한다. backend는 컨테이너 네트워크 이름(`mysql:3306`, `fotmob:8800`)으로 붙으므로 호스트 포트가 필요 없다.
  ```yaml
  mysql:
    # ports: 줄 삭제
  fotmob:
    # ports: 줄 삭제
  ```
  (DB를 호스트 툴로 볼 일이 있으면 그때만 `docker exec ballix-mysql mysql ...` 사용)

- **방법 B**: localhost에만 바인딩 → `"127.0.0.1:3307:3306"`, `"127.0.0.1:8800:8800"`.

backend(8080)도 터널이 localhost로 붙으니 **`"127.0.0.1:8080:8080"`** 로 바꾸면 LAN 노출까지 막아 더 안전하다.

> MySQL 기본 비번 `1234`는 약하다. 내부 전용이라도 4장에서 강한 값으로 바꿔둘 것.

---

## 6. compose 환경값 맞추기 + 기동

`docker-compose.yml`의 `backend.environment`에서 DB 비밀번호를 4장에서 정한 값으로 맞춘다(yml과 동일해야 함).
`TZ: Asia/Seoul`·`FOTMOB_API_BASE_URL: http://fotmob:8800`는 그대로 둔다.

```yaml
  backend:
    environment:
      TZ: Asia/Seoul
      SPRING_DATASOURCE_URL: jdbc:mysql://mysql:3306/backend?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Seoul&characterEncoding=UTF-8
      SPRING_DATASOURCE_USERNAME: root
      SPRING_DATASOURCE_PASSWORD: <4장에서 정한 값>
      FOTMOB_API_BASE_URL: http://fotmob:8800
      NTFY_ENABLED: "false"
```

기동:

```bash
docker compose up -d --build          # mysql·fotmob healthy 후 backend 시작
docker compose logs -f backend        # 부팅 로그 확인 (Started …Application 뜨면 OK)
```

`restart: unless-stopped`가 걸려 있어 재부팅/크래시 시 자동 복구된다.
부팅 후 일정 동기화 + lazy 크롤로 데이터가 다시 채워진다(빈 DB여도 됨).

---

## 7. 외부 공개 — Cloudflare Tunnel (포트포워딩 불필요)

터널은 집 PC → Cloudflare로 **아웃바운드** 연결이라 **공유기에 인바운드 포트를 안 연다**(집 IP도 안 드러남).

전제: Cloudflare에 등록된 도메인 하나(예: `example.com`). 없으면 7-C 참고.

```bash
# cloudflared 설치
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

cloudflared tunnel login                 # 브라우저로 Cloudflare 로그인(본인이 직접)
cloudflared tunnel create ballix         # 터널 생성 → 자격증명 json 저장됨
cloudflared tunnel route dns ballix api.example.com   # api.example.com → 이 터널
```

`~/.cloudflared/config.yml`:
```yaml
tunnel: ballix
credentials-file: /home/<user>/.cloudflared/<터널ID>.json
ingress:
  - hostname: api.example.com
    service: http://localhost:8080
  - service: http_status:404
```

상시 실행(systemd 서비스로):
```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

→ 이제 `https://api.example.com` 이 집 PC의 백엔드(8080)로 HTTPS 연결된다. TLS·기본 DDoS 방어는 Cloudflare가 제공.

### 7-A. 프론트(Vercel) 설정 변경
- Vercel 프로젝트 환경변수 `VITE_API_BASE_URL = https://api.example.com` → **재배포(no cache)**. (Vite는 빌드 시 값을 굽기 때문에 재배포 필수)

### 7-B. (대안, 더 안전) 프론트도 같은 도메인
프론트를 Cloudflare Pages로 `https://ballix.example.com`에 올리고 백엔드를 `https://ballix.example.com/api/*`로 라우팅하면 **동일 도메인(first-party)** 이라 쿠키가 `SameSite=Lax`로 충분 → 3장에서 `same-site: Lax`로. 크로스사이트 이슈가 사라져 가장 안전.

### 7-C. 도메인이 없으면 — Tailscale Funnel
도메인 구매가 싫으면 Tailscale Funnel이 고정 `*.ts.net` HTTPS 호스트네임을 무료로 준다. 그 호스트네임을 아래 OAuth/CORS/`VITE_API_BASE_URL`에 그대로 쓰면 된다. (quick tunnel `trycloudflare.com`은 URL이 매번 바뀌어 OAuth에 부적합 → 비권장)

---

## 8. Google OAuth 리다이렉트 도메인 등록

Google Cloud Console → 사용자 인증 정보 → 해당 OAuth 2.0 클라이언트:

- **승인된 리디렉션 URI**에 추가:
  `https://api.example.com/login/oauth2/code/google`
  (Spring 기본 콜백 경로. 터널 도메인 기준. 로컬 `http://localhost:8080/login/oauth2/code/google`도 같이 둬도 됨)

그리고 3장 `app.frontend-base-url`이 **프론트 도메인**(로그인 성공 후 돌아갈 곳)인지 확인. 두 도메인을 헷갈리지 말 것:
- 리다이렉트 URI = **백엔드** 콜백(`api.example.com/...`)
- `frontend-base-url` = **프론트**(`ballix.vercel.app` 또는 `ballix.example.com`)

변경 후 백엔드 재기동: `docker compose up -d --build backend`.

---

## 9. 보안 체크리스트 (요약 — 반드시 확인)

- [ ] `application.yml` 권한 `chmod 600`, git에 **안 올라감**(`.gitignore` 확인). 절대 커밋 금지.
- [ ] 노출됐던 키(DB·Google secret·Gemini·JWT) **전부 재발급**(4장).
- [ ] MySQL·스크래퍼 **호스트 포트 비공개**(5장). 터널엔 백엔드만.
- [ ] MySQL root 비번 강한 값으로 변경(기본 `1234` 금지).
- [ ] CORS `allowed-origins`는 **실제 프론트 도메인만**(와일드카드 `*` 금지).
- [ ] 크로스도메인이면 쿠키 `same-site: None` + `secure: true`(HTTPS 필수).
- [ ] **공유기에 인바운드 포트포워딩 하지 않기**(터널이 아웃바운드라 불필요).
- [ ] **SSH/VNC/RDP를 인터넷에 직접 열지 않기** — 원격 접속은 Tailscale 경유.
- [ ] UFW 인바운드 기본 차단: `sudo ufw default deny incoming; sudo ufw enable` (터널·로컬은 영향 없음).
- [ ] 자동 보안 업데이트: `sudo apt install unattended-upgrades`. 도커 이미지도 가끔 갱신.
- [ ] (선택) Cloudflare Access를 `/api/admin/*` 앞에 걸어 엣지에서 관리자 인증 한 겹 추가.
- [ ] (데이터 보호) MySQL 주기적 덤프 백업(아래 11장).

> 관리자 권한은 앱 안에서 `role == ADMIN_USER`로만 판별된다. 본인 계정을 관리자로 올리려면 DB에서 직접:
> `docker exec ballix-mysql mysql -uroot -p<비번> backend -e "UPDATE users SET role='ADMIN_USER' WHERE email='본인지메일';"`

---

## 10. 동작 확인

```bash
# 백엔드 기동 확인 (로컬에서)
curl -i http://localhost:8080/api/match/allMatch        # 200 + JSON 이면 OK

# 보호 엔드포인트는 비로그인 시 403/리다이렉트가 정상
curl -i -X POST "http://localhost:8080/api/fotmob/details/backfill?sinceDays=14&limit=1"

# 외부(터널) 확인
curl -i https://api.example.com/api/match/allMatch
```

프론트에서 Google 로그인 → 정상 복귀 → 관리자 데이터 탭 "상세 누락 일괄 보강" 동작까지 확인.

---

## 11. 운영/유지보수

```bash
# 업데이트 배포 (git에 새 커밋 푸시된 후)
cd ~/ballix && git pull && docker compose up -d --build

# 로그
docker compose logs -f backend
docker compose logs -f fotmob

# MySQL 백업(덤프) — cron으로 매일 권장
docker exec ballix-mysql mysqldump -uroot -p<비번> backend | gzip > ~/ballix-backup-$(date +%F).sql.gz

# 완전 초기화(주의: DB 볼륨 삭제)
docker compose down -v
```

스크래퍼(`api.py`) 수정 시엔 컨테이너 재빌드 필요(코드 자동 리로드 없음): `docker compose up -d --build fotmob`.

---

## 12. 자주 막히는 곳 (이 프로젝트 특유)

- **백엔드 부팅 실패 / DB 연결 안 됨**: `application.yml`이 없거나 비번이 compose env와 불일치. 3·6장 재확인.
- **로그인 후 403 / 쿠키 안 붙음**: 크로스도메인인데 `same-site`가 `None`이 아니거나 `secure:false`. HTTPS인지, CORS에 프론트 도메인이 있는지 확인.
- **OAuth가 엉뚱한 곳으로 리다이렉트 / `/error`**: 콜백 URI 미등록(8장) 또는 `frontend-base-url` 오설정.
- **라이브 시계/공지/알림 시각이 9시간 어긋남**: 컨테이너 `TZ: Asia/Seoul` 누락. compose에 반드시 유지(앱은 KST 벽시계 기준).
- **CSRF/POST가 302로 샘**: `CLAUDE.md` 참고 — Spring Security 7 CSRF는 `AbstractHttpConfigurer::disable` 메서드 레퍼런스로만 적용됨.
- **스크래퍼가 느리거나 가끔 죽음**: 리소스 차단·세마포어 직렬화가 적용돼 있음. RAM 여유 있으면 거의 안 죽지만, 동시 크롤은 1개로 직렬화됨(설계).
