package com.example.backend.playercard;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlayerCardRepository extends JpaRepository<PlayerCard, Long> {

    // 특정 유저가 보유한 카드 전체 (최신순)
    List<PlayerCard> findByOwnerIdOrderByCreateAtDesc(Long ownerId);

    // 주간 오버롤 갱신 대상: fotmobPlayerId가 있는 카드 전체
    List<PlayerCard> findByFotmobPlayerIdIsNotNull();
}
