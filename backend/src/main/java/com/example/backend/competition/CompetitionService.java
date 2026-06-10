package com.example.backend.competition;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CompetitionService {

    private final CompetitionRepository competitionRepository;

    // 대회 목록 전부 조회 (페이지네이션)
    public Page<Competition> allComp(Pageable pageable) {
        return competitionRepository.findAll(pageable);
    }
}
