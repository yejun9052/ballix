package com.example.backend.team;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface TeamRepository extends JpaRepository<Team, Long> {
    Optional<Team> findByFotmobTeamId(Long fotmobTeamId);

    /** 아직 한국어 번역이 채워지지 않은 팀(번역 후 값 없음) — 크롤 후 일괄 번역 대상. */
    @Query("select t from Team t where (t.nameKo is null or t.nameKo = '') and t.name <> ''")
    List<Team> findUntranslated();

    /** 한국어 이름(nameKo) 부분일치로 팀 조회 — 한글 검색어를 영문명으로 변환할 때 사용. */
    @Query("select t from Team t where t.nameKo is not null and lower(t.nameKo) like lower(concat('%', :ko, '%'))")
    List<Team> findByNameKoLike(@Param("ko") String ko, Pageable pageable);
}
