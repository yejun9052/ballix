# 내일 할 일 (2026-06-22)

> 2026-06-21 작업 이어서. 상세 로직은 [docs/logic/](logic/README.md), 배포 상태는 [SESSION_HANDOFF.md](SESSION_HANDOFF.md) 참고.

---

## 0. ✅ 셀프호스트 외부공개 — 완료 (2026-06-24)

> **2026-06-24 전체 완료.** 외부에서 데이터 조회 + Vercel 프론트 로그인·AI·선수카드까지 동작 확인.
> 공개 주소: **`https://lee-h81m-ds2v.taile904f8.ts.net`** / 프론트: `https://ballix-ochre.vercel.app`
> 아래 ①~⑤ 모두 완료(체크박스 참고). 상세는 [SELFHOST_DEPLOY_LOG.md](SELFHOST_DEPLOY_LOG.md) 2번째 세션.

> Render(무료) → **집 우분투 PC(`lee-h81m-ds2v`) 셀프호스트로 이전 중.** 2026-06-22에 로컬 기동까지 완료.
> 가이드: [LINUX_SELFHOST_DEPLOY.md](LINUX_SELFHOST_DEPLOY.md) (단, Cloudflare Tunnel 대신 **Tailscale Funnel** 사용).
> 작업 위치: `~/바탕화면/ballix`.

**이미 완료된 것 (이 PC):**
- Docker + Tailscale 설치(부팅 자동시작), Tailscale 로그인(`yejun9052@`, IP `100.119.208.92`) + SSH(`--ssh`).
- docker-compose로 mysql+fotmob+backend 3컨테이너 기동(`restart: unless-stopped`), 로컬 데이터 API 200 확인.
- 보안: MySQL·fotmob 호스트포트 미노출, backend `127.0.0.1:8080`만, UFW(공개 인바운드 차단·tailnet 허용), 자동보안업데이트, 시크릿 `.env` 분리(git 제외·600).

**남은 작업 (순서대로):**

- [x] **① `.env` 시크릿 3개 채우기.** `~/바탕화면/ballix/.env`의 `FILL_ME` 3개를 Render 백엔드 Environment 값으로:
  - `GOOGLE_CLIENT_ID` ← Render `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET` ← Render `...GOOGLE_CLIENT_SECRET`
  - `GEMINI_API_KEY` ← Render `AI_GEMINI_API_KEY`
  - 적용: `cd ~/바탕화면/ballix && docker compose up -d backend` (재빌드 불필요, env만 재주입)
- [x] **② Tailscale Funnel로 외부 공개.** root 터미널에서 `tailscale funnel --bg 8080`.
  - "Funnel 켜라"는 URL 뜨면 브라우저로 활성화 후 재실행. (HTTPS 인증서도 admin 콘솔 DNS탭에서 enable 필요할 수 있음)
  - 성공 시 공개 주소: **`https://lee-h81m-ds2v.taile904f8.ts.net`**
  - ⚠️ Claude Code 세션에선 funnel/serve 설정 명령이 차단되므로 **반드시 직접 실행.**
- [x] **③ Google OAuth 리다이렉트 URI 등록.** Cloud Console → 사용자 인증 정보 → OAuth 클라이언트 → 승인된 리디렉션 URI 추가:
  `https://lee-h81m-ds2v.taile904f8.ts.net/login/oauth2/code/google`
- [x] **④ Vercel 프론트 연결 변경.** `VITE_API_BASE_URL = https://lee-h81m-ds2v.taile904f8.ts.net` → 저장 후 **재배포(no cache)**. (프론트: `https://ballix-ochre.vercel.app`)
- [x] **⑤ 확인.** `curl https://lee-h81m-ds2v.taile904f8.ts.net/api/match/allMatch` 200 → 프론트에서 구글 로그인 → 관리자 권한 부여 완료(`leey217423@gmail.com` → ADMIN_USER).
  - ⚠️ **추가 수정(2026-06-24)**: Funnel(프록시) 뒤라 OAuth `redirect_uri`가 `http://`로 생성돼 로그인 깨짐 → `docker-compose.yml` backend env에 **`SERVER_FORWARD_HEADERS_STRATEGY: framework`** 추가해 `https://`로 교정. (X-Forwarded-Proto 반영)

**관리 명령** (`cd ~/바탕화면/ballix`): `docker compose ps` / `logs -f backend` / `stop` / `start` / `restart backend` / 업데이트 `git pull && docker compose up -d --build`.
**원격 관리**: 다른 기기에 Tailscale 설치+같은 계정 로그인 → `ssh lee@lee-h81m-ds2v`.

> 참고: PC가 켜져 있고 인터넷 연결돼야 외부 접속됨. 배포 편의로 켠 NOPASSWD sudo는 마무리 후 `sudo rm /etc/sudoers.d/lee-nopasswd`로 원복 권장. 로컬 DB는 빈 상태로 시작(스케줄러+크롤로 채워짐, TiDB 기존데이터 미이전).

---

## 1. (구) Render 배포 마무리 — 셀프호스트로 대체됨, 참고용

- [ ] **Render 백엔드 부팅 확인.** DB username 오타(`43i**t**q…` → `43i**1**q…`, 알파벳 t가 아니라 숫자 1)를 고친 뒤 재배포해서 `Access denied` 없이 뜨는지. (어제 로컬 DB 연결·`gradlew test` 통과 = 코드/자격증명은 OK. Render env의 `SPRING_DATASOURCE_USERNAME`만 맞으면 됨.)
- [ ] **CORS 끝슬래시 제거.** Render env `APP_CORS_ALLOWED_ORIGINS` = `https://ballix-ochre.vercel.app/` → 끝 `/` 빼서 `https://ballix-ochre.vercel.app`. 안 하면 로그인 시 CORS 막힘.
- [ ] 배포 후 구글 로그인 → 관리자 권한 부여: TiDB SQL Editor에서 `UPDATE test.users SET role='ADMIN_USER' WHERE email='leey217423@gmail.com';`

## 2. 라이브 시계 / HT 검증 (어제 추가한 A·B 동작 확인)

> api.py를 고쳤으니 **스크래퍼 재배포(또는 로컬 uvicorn 재시작) 필요** — 자동 리로드 없음.

- [ ] **"55분" 원인 가리기.** 라이브 경기 때 Render 스크래퍼 로그에서 `source=LIVE-FETCH`/`XHR-CAPTURE`(신선) vs `SSR-FALLBACK`(지연) 확인.
- [ ] **A 검증** — 전반 추가시간이 끝났는데도 시계가 흐르면, `부여 추가시간 + 30초` 지나고 자동으로 `HT`로 멈추는지.
- [ ] **B 검증 (연장/승부차기)** — 연장 가능한 경기(16강~)에서:
  - 연장 시계가 90:00 / 105:00 기준으로 맞게 흐르는지
  - 연장 하프타임에 `HT`, 승부차기에 `Pen.`로 시계가 멈추는지
  - ⚠️ **연장/승부차기 FotMob 필드명 실제 확인.** 어제는 추정+후보다중(`firstExtraHalfStarted`·`penaltyShootoutStarted` 등)으로 넣음. 실제 토너먼트 경기의 `status.halfs` 원본을 찍어보고 이름이 다르면 `api.py`의 후보 키 교체. (이름이 틀려도 크래시는 없고 SSR로 폴백됨)

## 3. 백로그 (여유되면)

- [ ] AI 골요약: `@Transactional` 안에서 Gemini HTTP 호출 → 커넥션 풀 압박 가능. 트랜잭션 밖으로 분리 검토.
- [ ] `allMatch` 페이징 없음 — 경기 많아지면 손보기.
- [ ] 로드밸런싱: 다중 인스턴스 시 세션/스트라이프락이 인스턴스-로컬이라 라이브 폴링 중복 — 트래픽 생기면.
- [ ] (선택) 노출된 키 재발급: DB 비번 / Google client secret / Gemini API key / JWT.

---

## 어제(2026-06-21) 한 것 (참고)

- **버그/성능**: 경기 상세 N+1 제거(`LineupPlayerRepository` LEFT JOIN FETCH), 동시 첫조회 중복 크롤 방지(single-flight), 라이브 HT 로직 A(전반 추가시간+30초→HT)·B(연장 시계·연장HT·승부차기) 추가 — 합성 데이터 단위검증 통과.
- **검증**: JDK 21 설치 → 백엔드 `compileJava`·`test`(컨텍스트+TiDB 연결) 통과, 프론트 `build`·`lint`(에러0), 스크래퍼 `py_compile` OK.
- **문서 정정**: competitionId 6(2/77 오기), comments.md·ai-prompts.md 유령기능 표시, CODE_REVIEW 보안 해결 배너, 쿠키/baseURL 최신화.
- **위생**: 커밋된 `boot*.log` untrack.
- **인프라**: DB username 오타(t→1) 발견·수정으로 배포 막던 `Access denied` 해결.
