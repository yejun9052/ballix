package com.example.backend.football;

import com.example.backend.matche.MatchRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class FootballDataInitializer implements ApplicationRunner {

    private final FootballSyncService syncService;
    private final MatchRepository matchRepository;

    @Override
    public void run(ApplicationArguments args) {
        if (matchRepository.count() > 0) {
            log.info("경기 데이터 존재 - 초기화 스킵");
            return;
        }

        log.info("경기 데이터 없음 - API에서 불러오는 중...");
        try {
            syncService.sync("WC");
        } catch (Exception e) {
            log.error("데이터 초기화 실패: {}", e.getMessage());
        }
    }
}
