# Ballix 로직 문서 (`docs/logic`)

이 폴더는 Ballix의 **핵심 도메인 로직**을 코드와 별개로 한곳에 정리한 참고 문서다.
"왜 이렇게 동작하는지"와 "어디를 만지면 무엇이 바뀌는지"를 예시와 함께 적어, 코드를 직접 안 봐도
흐름을 검토할 수 있게 한다. (실제 동작 규약·실행법은 루트 `CLAUDE.md` 참고)

| 문서 | 내용 |
|---|---|
| [live-clock-and-halftime.md](live-clock-and-halftime.md) | 라이브 진행시계(앵커)·**하프타임(HT) 판정**·추가시간(+N) 계산·폴링 주기. "HT가 55분에야 뜨는" 증상 진단 포함 |
| [crawling.md](crawling.md) | FotMob 크롤 구조(Python 스크래퍼)·**`/api/data/matchDetails` 신선 데이터**·throttle·엔드포인트별 역할 |
| [ai-prompts.md](ai-prompts.md) | AI 4종(승률예측·라이브 재예측·골요약·번역)의 **실제 프롬프트 + 예시 입력/출력 데이터** |
| [prediction-scoring.md](prediction-scoring.md) | 승부예측 채점·**역배 가중 포인트제** 계산 |
| [comments.md](comments.md) | 경기별 댓글 도메인(권한·삭제 규칙) |

## 데이터 한 방향 흐름 (요약)

```
FotMob ──Playwright──▶ Python FastAPI(:8800) ──HTTP──▶ Spring Boot(:8080) ──▶ MySQL
        (stateless 수집)      /api/data/matchDetails       (스케줄·폴링·DB 소유)      │
                              로 라이브 신선값 추출                                React(:5173)
```

- 백엔드는 FotMob을 직접 안 긁고 **반드시 Python 스크래퍼를 HTTP 호출**한다.
- 식별 키는 전부 **FotMob ID**(`fotmobMatchId`/`fotmobTeamId`/`fotmobLeagueId`).
- 시각은 전부 **KST(UTC+9)** 로 저장·비교.
