package com.example.backend.squad;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SquadRepository extends JpaRepository<Squad, Long> {

    Optional<Squad> findByOwnerId(Long ownerId);
}
