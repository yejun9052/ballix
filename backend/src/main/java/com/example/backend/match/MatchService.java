package com.example.backend.match;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class MatchService {

    private final MatchRepository matchRepository;



    // 대회 상관 X 대회 전부 찾기
    public List<Match> allMatch() {
        return matchRepository.findAll();
    }

    // 특정 대회 경기 전부 찾기
    public List<Match> findByCompId(Long compId) {
     return matchRepository.findByCompetitionId(compId).orElseThrow(
             ()-> new RuntimeException("대회에 맞는 매치를 찾을 수 없습니다.")
     );
    }

    // 날짜 대입 경기 찾기
    public List<Match> findByDate(LocalDate matchDay) {
     return matchRepository.findByMatchDate(matchDay).orElseThrow(
             () -> new RuntimeException("날자에 맞는 매치를 찾을 수 없습니다.")
     );
    }

}
