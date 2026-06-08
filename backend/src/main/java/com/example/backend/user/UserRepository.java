package com.example.backend.user;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);

    // 리더보드: 적중수 내림차순, 동률이면 적은 경기수(효율) 우선
    @Query("SELECT u FROM User u ORDER BY u.correct_count DESC, u.matches_played ASC")
    List<User> findLeaderboard();
}
