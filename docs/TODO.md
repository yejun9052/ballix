# 내일 할 일 (2026-06-22)

> 2026-06-21 작업 이어서. 상세 로직은 [docs/logic/](logic/README.md), 배포 상태는 [SESSION_HANDOFF.md](SESSION_HANDOFF.md) 참고.

---

## 1. 배포 마무리 (확인) — ⭐ 먼저

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
