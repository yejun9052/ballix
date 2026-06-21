# AI 로직 — 프롬프트 + 예시 데이터 (Google Gemini)

AI 기능 4종의 **실제 프롬프트**와 **예시 입력(다이제스트)·출력**. 모델은 `ai.gemini.model`(기본 `gemini-3.1-flash-lite`),
`GeminiClient`가 `generateContent` REST 호출(429/503 재시도). 관련: `com.example.backend.ai`.

> 다이제스트(=프롬프트에 넣는 입력 요약)는 **전부 DB에 있는 데이터**로 만든다(추가 크롤 최소화).
> 선수 시장가치·스탯만 `PlayerService` DB-first lazy-cache로 채운다(없으면 1회 크롤, TTL 내 재사용).

---

## 1. 승률 예측 + 예상 스코어 (`AiPredictionService`)

`POST /api/admin/ai/predict?matchId=&force=` (관리자만 생성, 결과 조회는 공개).
입력 = **FIFA랭킹(보조) + 리그 순위 + 최근 폼 + 선발 라인업 분석(시장가치·시즌폼)**.

### 프롬프트 (`buildPrompt`)

```
당신은 축구 경기 결과를 예측하는 분석가입니다. 아래 정보를 바탕으로 결과 확률과 예상 스코어를 추정하세요.
홈팀 승(homeWin), 무승부(draw), 원정팀 승(awayWin)을 정수 퍼센트로 주고 세 값의 합은 반드시 100이어야 합니다.
추가로 가장 가능성 높은 최종 스코어를 홈팀 득점(homeScore)·원정팀 득점(awayScore) 정수로 주세요.

가중치 우선순위:
1) [선발 라인업 분석]이 주어지면(...팀 가치 합계·핵심 선수·선발 평균 시즌폼·평균 연령) 이를 가장 중요한 근거로 삼으세요...
2) 최근 폼·최근 전적과 순위표를 크게 반영하세요(주요 근거).
3) FIFA랭킹은 보조 참고 지표로만 약하게 반영하세요(숫자 작을수록 강팀).
최근 폼/전적이 FIFA랭킹과 상충하면 최근 폼/전적을 더 신뢰하고...
확률은 5나 10 단위로 반올림하지 말고 1퍼센트 단위로 세밀하게 추정하세요(예: 47, 28, 25)...

예상 스코어 규칙:
- 현실적인 점수로만(보통 한 팀당 0~4골, 합계 0~5골). 과장된 점수는 압도적 전력차일 때만.
- 예상 스코어의 승패 방향은 위 확률에서 가장 높은 결과와 일치해야 합니다...
JSON 외 다른 텍스트는 출력하지 마세요.

[경기 정보]
{digest}
```

### 예시 다이제스트 (`buildDigest`가 만든 `{digest}`)

```
대한민국 vs 가나 (월드컵)
FIFA랭킹 — 대한민국: 23위, 가나: 60위
순위(홈) 대한민국: 1위, 3경기 2승1무0패, 승점7, 득실+4
순위(원정) 가나: 3위, 3경기 1승1무1패, 승점4, 득실0
최근폼 대한민국: 승 2-0(우루과이), 무 1-1(포르투갈), 승 3-1(가나)
최근폼 가나: 패 0-2(브라질), 승 2-1(세르비아), 무 1-1(한국)
[선발 라인업 분석] (실제 발표된 선발 명단 기반 — 가장 신뢰도 높은 근거)
· 대한민국 선발: 팀가치 합계 €180M, 평균연령 27.4, 선발 평균 시즌평점 7.1, 선발 평균 시즌득점 4.2
  핵심선수(대한민국): 손흥민(€60M, 시즌 12골 7도움, 평점 7.6), 김민재(€50M, 평점 7.3), 이강인(€35M, 시즌 6골 9도움, 평점 7.2)
· 가나 선발: 팀가치 합계 €120M, 평균연령 25.1, 선발 평균 시즌평점 6.8, 선발 평균 시즌득점 3.1
  핵심선수(가나): ...
[라이브] 현재 스코어 대한민국 1-0 가나 (경과 67')     ← IN_PLAY일 때만 주입(아래 2절)
진행 중인 경기다. 현재 스코어와 남은 시간을 가장 크게 반영해 '최종 결과' 확률을 다시 추정하라(...).
```

### 출력 (structured JSON, `predictionConfig`)

`temperature=0.4`, `responseSchema`로 강제:

```json
{ "homeWin": 47, "draw": 28, "awayWin": 25, "homeScore": 2, "awayScore": 1 }
```

후처리(`parseAndNormalize`): 합 100으로 정규화(반올림 오차는 홈에 흡수), 스코어 0~9 클램프 +
**확률 최고 결과와 스코어 방향이 어긋나면 보정**. → `Match.aiHomePct/aiDrawPct/aiAwayPct` + `aiHomeScore/aiAwayScore` 저장.
멱등(`aiPredictedAt != null`이면 `force` 없이는 재호출 안 함).

---

## 2. 실시간 AI 승률 갱신 (`AiLivePredictionScheduler`)

`predictionEnabled && IN_PLAY` 경기를 **킥오프 기준 경과 `interval-minutes`(기본 15)분 경계**(15·30·45·60·75·90)를 넘을 때 1회 재예측.
- **하프타임 등 시계 정지 구간 제외**, 전·후반(시계 흐를 때)에만 — `Match.isClockRunning()`로 판별.
- 다이제스트에 위 예시의 `[라이브] 현재 스코어 ... (경과 67')` 줄이 주입돼 남은 결과 확률을 갱신, 기존 값 덮어씀.
- `ai.live-prediction.{enabled,interval-minutes,tick-ms}` config로만 on/off (런타임 토글 엔드포인트는 없음 — 설정 변경 후 재기동).

---

## 3. 골 요약 (`AiSummaryService`)

`GET /api/match/{id}/ai/summary?force=` (공개, **종료 경기만**). DB-first lazy(없으면 1회 생성 후 `Match.aiSummary` 캐시).
1순위로 **FotMob 라이브티커(ltc) 영문 골 해설**을 번역·요약, 없으면 저장된 `MatchEvent`로 폴백.
**생성 실패 시 5분 쿨다운**(재호출 폭주 방지).

### 3-A. 라이브티커 기반 (`buildCommentaryPrompt`)

```
아래는 끝난 축구 경기의 골 장면에 대한 영어 해설입니다.
이걸 한국어로 옮기되, 실제 축구 중계 캐스터처럼 생생하고 직관적인 해설 말투로 2~4문장으로 요약하세요.
골 넣은 선수와 시간, 슛 방식(왼발/오른발/헤더 등)과 위치, 어시스트를 자연스럽게 살리고 최종 스코어로 마무리하세요.
머리말이나 마크다운 없이 본문만 출력하세요.
{digest}
```

**예시 다이제스트:**
```
대한민국 2-1 가나
골 장면 해설(영문):
- 23' Son Heung-min slots it into the bottom corner with his left foot, assisted by Lee Kang-in.
- 67' Mohammed Kudus equalises with a powerful header from a corner.
- 84' Cho Gue-sung wins it late, tapping in from close range.
```
**예시 출력:** `23분 손흥민이 이강인의 패스를 받아 왼발로 골문 구석에 침착하게 꽂았습니다! 67분 쿠두스가 코너킥 상황에서 강력한 헤더로 동점을 만들었지만, 84분 조규성이 문전 혼전 속 마무리로 결승골을 터뜨렸습니다. 최종 2-1 대한민국의 승리.`

### 3-B. 이벤트 폴백 (`buildPrompt`)

```
아래는 끝난 축구 경기의 스코어와 골 기록입니다. 한국어로 2~3문장의 간결한 경기 요약을 작성하세요.
골을 넣은 선수와 시점을 자연스럽게 엮되 과장 없이 사실 위주로 쓰고, 머리말/마크다운 없이 본문만 출력하세요.

{digest}
```
**예시 다이제스트:**
```
대한민국 2-1 가나
골/주요이벤트:
- 23' 골 대한민국 손흥민 (assist by 이강인)
- 67' 골 가나 Mohammed Kudus
- 84' 골 대한민국 조규성
- 78' 퇴장 가나 Daniel Amartey
```

---

## 4. 나라/팀명 한국어 번역 (`TranslationService`)

일정 동기화 시 `Team.nameKo`가 빈 팀을 한 번에 모아 번역(배치, 호출당 최대 80팀). `GeminiClient`만 의존(bean 순환 없음).

### 프롬프트

```
다음은 축구 국가대표팀 또는 클럽의 영문 이름 목록입니다. 각 이름을 한국어로 번역하세요.
- 각 항목에 original(입력 원문 그대로)과 korean(한국어 번역)을 채우세요. original은 입력과 한 글자도 다르지 않게 그대로 두세요.
...
[번역할 이름]
{names}
```

**예시 입력:** `South Korea, Ghana, Uruguay, Portugal`
**예시 출력(structured):**
```json
{ "translations": [
  { "original": "South Korea", "korean": "대한민국" },
  { "original": "Ghana", "korean": "가나" },
  { "original": "Uruguay", "korean": "우루과이" },
  { "original": "Portugal", "korean": "포르투갈" }
]}
```
결과는 **정규화 키 → 번역** 맵으로 돌려주고 `Team.nameKo`에 채움. 번역 전=`Team.name`(영문)/번역 후=`Team.nameKo`(한국어) 둘 다 보관. `ai.translation.enabled`로 on/off.

---

## 5. 공통 함정

- **`String.formatted()` 프롬프트에 리터럴 `%` 금지** — 포맷 지정자로 해석돼 예외. "1%"는 "1퍼센트"로 쓰거나 `%%`.
- **Spring Boot 4는 Jackson 3** — 외부 JSON은 `.body(Map.class)`로 받아 탐색(Jackson2 `JsonNode`로 받으면 깨짐).
- **FIFA랭킹**은 `resources/fifa-rankings.json`(팀명→순위 근사 스냅샷)을 부팅 시 로드, 팀명은 FotMob 표기와 매칭.
