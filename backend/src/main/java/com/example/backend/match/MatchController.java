package com.example.backend.match;

import com.example.backend.global.common.CommonResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/match")
public class MatchController {

    private final MatchRepository matchRepository;
    private final MatchService matchService;

    // 대회 상관 X 경기 조회
    @GetMapping("/allMatch")
    public ResponseEntity<CommonResponse<?>> allMatch() {
        return ResponseEntity
                .ok(CommonResponse.success("데이터 조회 성공", matchService.allMatch()));
    }
    // 특정 대회 경기 조회
    @GetMapping("/findByCompId")
    public ResponseEntity<CommonResponse<?>> findByCompId(@RequestParam Long id) {
        return ResponseEntity
                .ok(CommonResponse.success("데이터 조회 성공", matchService.findByCompId(id)));
    }
    // 특정 날짜 경기 조회
    @GetMapping("/MatchDay")
    public ResponseEntity<CommonResponse<?>> findByMatchDate(@RequestParam LocalDate date) {
        return ResponseEntity
                .ok(CommonResponse.success("데이터 조회 성공", matchService.findByDate(date)));
    }
    // 다가오는 경기 조회 (compId 옵션 — WC만 보려면 6)
    @GetMapping("/upcoming")
    public ResponseEntity<CommonResponse<?>> upcoming(@RequestParam(required = false) Long compId) {
        return ResponseEntity
                .ok(CommonResponse.success("데이터 조회 성공", matchService.upcoming(compId)));
    }

}
