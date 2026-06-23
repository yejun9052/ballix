package com.example.backend.playercard;

// 카드 응답 DTO — User 엔티티 직접 노출 방지
public record PlayerCardView(
        Long id,
        String playerName,
        String nationality,
        Integer overall,
        String position,
        String team,
        String imageUrl,
        String grade
) {
    public static PlayerCardView from(PlayerCard c) {
        return new PlayerCardView(
                c.getId(),
                c.getPlayerName(),
                c.getNationality(),
                c.getOverall(),
                c.getPosition(),
                c.getTeam(),
                c.getImageUrl(),
                c.getGrade()
        );
    }
}
