package com.example.backend.user;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);

    // 닉네임 중복 검사(본인 제외)
    boolean existsByNameAndIdNot(String name, Long id);

    // 관리자 유저 관리: 이름 부분일치 검색(대소문자 무시)
    Page<User> findByNameContainingIgnoreCase(String name, Pageable pageable);

    // 리더보드: 누적 포인트 내림차순, 동률이면 적중수↓ → 적은 경기수↑ 순 (페이지네이션)
    @Query("SELECT u FROM User u ORDER BY u.score DESC, u.correct_count DESC, u.matches_played ASC")
    Page<User> findLeaderboard(Pageable pageable);
}
