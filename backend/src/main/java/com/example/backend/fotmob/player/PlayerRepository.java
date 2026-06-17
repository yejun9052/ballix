package com.example.backend.fotmob.player;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PlayerRepository extends JpaRepository<Player, Long> {

    Optional<Player> findByFotmobPlayerId(Long fotmobPlayerId);

    /** 라인업 동기화 시 여러 선수를 한 번에 조회(N+1 방지). */
    List<Player> findByFotmobPlayerIdIn(Collection<Long> fotmobPlayerIds);
}
