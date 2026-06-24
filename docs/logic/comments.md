# 경기별 댓글 로직

관련: `com.example.backend.comment`(`CommentController` — `GET·POST /api/match/{matchId}/comments`, `DELETE /api/comments/{commentId}`), 프론트 `DetailScreen`의 `CommentSection` + `api/comment.js`.

---

## 1. 엔티티 / DTO

- `Comment`: `user`·`match` LAZY ManyToOne + `content`(≤500자).
- `CommentView` DTO: User 비노출 + **`mine`**(현재 유저가 작성자인지) 플래그 포함.

---

## 2. 엔드포인트 / 권한

| 메서드 | 경로 | 권한 |
|---|---|---|
| GET | `/api/match/{matchId}/comments` (최신순, 기본 10) | **공개** |
| POST | `/api/match/{matchId}/comments` (본문 `{content}`) | **로그인 필요** |
| DELETE | `/api/comments/{commentId}` | **본인 또는 관리자** |

- 권한 방식은 `PredictionService`와 동일하게 **`@AuthenticationPrincipal Long userId`** 를 받아
  서비스에서 `notLogin` 검증 (`@PreAuthorize` 아님).
- **삭제 판정**(서비스에서): `comment.user.id == userId || user.role == ADMIN_USER`.
- `comment → user/match` 단방향 의존.

---

## 3. 흐름

```
프론트 CommentSection ──GET──▶ 목록(공개, mine 플래그로 '삭제' 버튼 노출 판단)
                     ──POST─▶ 작성(로그인 쿠키 필요)
                     ──DELETE▶ 삭제(본인/관리자만, 서비스가 거절)
```

> 작성/삭제 실패(비로그인 등)는 `BusinessException` 계층(`UnauthorizedException`/`BadRequestException`)으로 던져
> `GlobalExceptionHandler`가 `CommonResponse.fail(msg)` + 상태코드로 변환 → 프론트가 토스트 표시.
