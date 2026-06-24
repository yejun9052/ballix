# Ballix 백로그 (TODO)

> 현재 살아있는 작업만. 배포 상태/이력은 [SELFHOST_DEPLOY_LOG.md](SELFHOST_DEPLOY_LOG.md), 로직 상세는 [logic/](logic/README.md), 규약은 루트 `CLAUDE.md`.

## 배포 — ✅ 완료
집 우분투(`lee-h81m-ds2v`) 셀프호스트 + Tailscale Funnel로 외부 공개 완료. 공개 백엔드 `https://lee-h81m-ds2v.taile904f8.ts.net`, 프론트 `https://ballix-ochre.vercel.app`. (Render는 폐기) — 상세: [SELFHOST_DEPLOY_LOG.md](SELFHOST_DEPLOY_LOG.md).

---

## 라이브 시계 / HT 검증 (실경기 필요)
> `api.py` 수정분이라 **스크래퍼 재기동** 후 라이브 경기에서 확인 (자동 리로드 없음).

- [ ] **"55분" 신선도** — 라이브 경기 때 스크래퍼 로그 `source=LIVE-FETCH`/`XHR-CAPTURE`(신선) vs `SSR-FALLBACK`(지연) 확인.
- [ ] **A 검증** — 전반에서 `부여 추가시간 + 30초` 지나면 자동 `HT`로 멈추는지.
- [ ] **B 검증 (연장/승부차기)** — 16강~ 연장 경기에서 연장 시계(90:00/105:00)·연장 HT·승부차기 `Pen.` 동작. ⚠️ **`status.halfs` 연장/승부차기 필드명**(`firstExtraHalfStarted`·`penaltyShootoutStarted` 등은 추정값)을 실제 raw로 확인해 다르면 `api.py` 후보 키 교체. (틀려도 크래시 없이 SSR 폴백)

## 프론트
- [ ] **메인 경기일정 "우측 치우침"** — 사용자 제보. 로그아웃 5개 폭(360~1920)에선 재현 안 됨 → 로그인 상태/특정 폭 의심. 스크린샷 확보 후 `main.css` `.main-screen` 2단 그리드(≥1000px) 점검.
- [ ] **월드컵 모바일 진입 불가** — 월드컵 nav가 데스크톱 전용(`display:none`)이라 모바일 햄버거 메뉴에 없음. 메뉴에 추가.
- [ ] 번들 크기 — `react-three-fiber`(3D) 808KB. 동적 import로 코드 스플릿 검토.

## 백엔드 백로그
- [ ] AI 골요약: `@Transactional` 안에서 Gemini HTTP 호출 → 커넥션 풀 압박 가능. 트랜잭션 밖으로 분리 검토.
- [ ] `allMatch` 페이징 없음 — 경기 많아지면 손보기.
- [ ] 로드밸런싱: 다중 인스턴스 시 세션/스트라이프락이 인스턴스-로컬 → 라이브 폴링 중복. 트래픽 생기면.

## 위생 (선택)
- [ ] 노출된 키 재발급: DB 비번 / Google client secret / Gemini API key / JWT.
- [ ] 배포 편의로 켠 NOPASSWD sudo 원복: `sudo rm /etc/sudoers.d/lee-nopasswd`.
