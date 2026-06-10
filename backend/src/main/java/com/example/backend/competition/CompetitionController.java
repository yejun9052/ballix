package com.example.backend.competition;

import com.example.backend.global.common.CommonResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/comp")
public class CompetitionController {

    private final CompetitionRepository competitionRepository;
    private final CompetitionService competitionService;

    // 대회 전체 조회 (페이지당 8개)
    @GetMapping("/allComp")
    public ResponseEntity<CommonResponse<?>> allComp(@PageableDefault(size = 8) Pageable pageable) {
        return ResponseEntity
                .ok(CommonResponse.success("데이터 조회 성공", competitionService.allComp(pageable)));
    }
}
