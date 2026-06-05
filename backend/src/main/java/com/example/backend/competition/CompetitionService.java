package com.example.backend.competition;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class CompetitionService {

    private final CompetitionRepository competitionRepository;

    // 대회 목록 전부 조회
    public List<Competition> allComp() {
        return competitionRepository.findAll();
    }
}
