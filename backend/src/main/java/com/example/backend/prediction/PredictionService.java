package com.example.backend.prediction;

import com.example.backend.global.exceptopn.BadRequestException;
import com.example.backend.global.exceptopn.NotFoundException;
import com.example.backend.global.exceptopn.UnauthorizedException;
import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import com.example.backend.notify.NtfyClient;
import com.example.backend.prediction.enums.Winner;
import com.example.backend.team.Team;
import com.example.backend.user.User;
import com.example.backend.user.UserRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PredictionService {

    private final PredictionRepository predictionRepository;
    private final UserRepository userRepository;
    private final MatchRepository matchRepository;
    private final NtfyClient ntfy;

    @Value("${prediction.allowed-leagues:77}")
    private String allowedLeaguesRaw;   // 예측 허용 리그 fotmobLeagueId (쉼표구분, 기본 77=월드컵)
    private Set<Long> allowedLeagues;

    @PostConstruct
    void initAllowedLeagues() {
        allowedLeagues = Arrays.stream(allowedLeaguesRaw.split(","))
                .map(String::trim).filter(s -> !s.isEmpty())
                .map(Long::valueOf).collect(Collectors.toSet());
    }


    // 예측하기 (이미 예측했으면 수정)
    @Transactional
    public PredictionView predict(Long userId, Long matchId, Winner predictedWinner) {
        notLogin(userId);

        User user = userRepository.findById(userId).orElseThrow(
                () -> new NotFoundException("유저를 찾을 수 없습니다.")
        );
        Match match = matchRepository.findById(matchId).orElseThrow(
                () -> new NotFoundException("경기를 찾을 수 없습니다.")
        );

        // 예측 허용 리그만 (기본: 월드컵)
        Long leagueId = match.getCompetition() == null ? null : match.getCompetition().getFotmobLeagueId();
        if (leagueId == null || !allowedLeagues.contains(leagueId)) {
            throw new BadRequestException("예측이 허용되지 않은 리그입니다.");
        }

        // 킥오프가 지난 경기는 예측 불가
        if (match.getMatchTime().isBefore(LocalDateTime.now())) {
            throw new BadRequestException("이미 시작된 경기는 예측할 수 없습니다.");
        }

        Prediction prediction = predictionRepository.findByUserIdAndMatchId(userId, matchId).orElse(null);
        if (prediction == null) {
            prediction = Prediction.create(user, match, predictedWinner); // 첫 예측
        } else {
            prediction.changeWinner(predictedWinner); // 재예측
        }
        return PredictionView.from(predictionRepository.save(prediction));
    }

    // 내 예측 전부 찾기 (페이지네이션, 최신순)
    @Transactional(readOnly = true)
    public Page<PredictionView> myPrediction(Long userId, Pageable pageable) {
        notLogin(userId);
        return predictionRepository.findByUserIdOrderByCreateAtDesc(userId, pageable)
                .map(PredictionView::from);
    }

    // 특정 경기에 대한 내 예측 찾기
    @Transactional(readOnly = true)
    public PredictionView findByMatch(Long userId, Long matchId) {
        notLogin(userId);
        Prediction prediction = predictionRepository.findByUserIdAndMatchId(userId, matchId).orElseThrow(
                () -> new NotFoundException("해당 경기에 대한 예측이 없습니다.")
        );
        return PredictionView.from(prediction);
    }

    // 예측 분포(%) — 본인이 예측한 경기만 조회 가능
    @Transactional(readOnly = true)
    public PredictionRatio getRatio(Long userId, Long matchId) {
        notLogin(userId);
        // 예측한 뒤에만 비율 공개
        predictionRepository.findByUserIdAndMatchId(userId, matchId).orElseThrow(
                () -> new BadRequestException("예측 후 비율을 볼 수 있습니다.")
        );

        List<Prediction> all = predictionRepository.findByMatchId(matchId).orElse(List.of());
        int total = all.size();
        long home = all.stream().filter(p -> p.getPredictedWinner() == Winner.HOME_TEAM).count();
        long draw = all.stream().filter(p -> p.getPredictedWinner() == Winner.DRAW).count();
        long away = all.stream().filter(p -> p.getPredictedWinner() == Winner.AWAY_TEAM).count();
        return new PredictionRatio(total, pct(home, total), pct(draw, total), pct(away, total), home, draw, away);
    }

    private int pct(long n, int total) {
        return total == 0 ? 0 : (int) Math.round(n * 100.0 / total);
    }

    // 경기 종료 시 해당 경기의 모든 예측 채점 (종료 폴링 + 일정 동기화에서 호출)
    @Transactional
    public void gradeMatch(Match match) {
        String actualWinner = match.getWinner();
        if (actualWinner == null) {
            return; // 승자 미확정이면 채점 보류
        }

        // 예측 행을 잠그고 읽어 동시 채점(폴링 vs 수동 동기화)으로 인한 전적 중복 집계를 방지.
        List<Prediction> predictions = predictionRepository.findByMatchIdForUpdate(match.getId());
        for (Prediction prediction : predictions) {
            if (prediction.isGraded()) {
                continue; // 이미 채점됨 (멱등)
            }
            boolean correct = prediction.getPredictedWinner().name().equals(actualWinner);
            int points = computePoints(match, prediction.getPredictedWinner(), correct);
            prediction.grade(correct, points);
            prediction.getUser().scorePrediction(correct, points); // 유저 전적·포인트 갱신
            ntfy.send(correct ? "Prediction WIN" : "Prediction LOSE",
                    String.format("%s — %s vs %s%n예측 %s%s",
                            prediction.getUser().getName(),
                            teamName(match.getHomeTeam()), teamName(match.getAwayTeam()),
                            correct ? "적중 ✅" : "실패 ❌",
                            correct ? " (+" + points + "점)" : ""),
                    correct ? "white_check_mark" : "x");
        }
        predictionRepository.saveAll(predictions);
    }

    /**
     * 역배 가중 포인트 계산. 맞췄을 때만 점수, AI 승률 순위로 차등:
     * 본명(최고확률)=1점 / 2위=2점 / 최대 역배(최저확률)=3점. 틀리면 0점.
     * AI 예측이 없는 경기는 역배 판정이 불가하므로 맞추면 일괄 1점.
     */
    private int computePoints(Match match, Winner pick, boolean correct) {
        if (!correct) {
            return 0;
        }
        if (!match.hasPrediction() || match.getAiHomePct() == null
                || match.getAiDrawPct() == null || match.getAiAwayPct() == null) {
            return 1; // AI 예측 없음 → 일괄 1점
        }
        int h = match.getAiHomePct(), d = match.getAiDrawPct(), a = match.getAiAwayPct();
        int picked = switch (pick) {
            case HOME_TEAM -> h;
            case DRAW -> d;
            case AWAY_TEAM -> a;
        };
        // 내가 고른 결과보다 AI 확률이 더 높은 결과의 개수 + 1 = 순위(1~3). 동률은 같은 순위로 묶임.
        int higher = (h > picked ? 1 : 0) + (d > picked ? 1 : 0) + (a > picked ? 1 : 0);
        return higher + 1;
    }


    // 로그인 필요 메시지
    private void notLogin(Long userId) {
        if (userId == null) {
            throw new UnauthorizedException("로그인이 필요합니다.");
        }
    }

    /** 알림 표시용 팀명(LAZY는 gradeMatch 트랜잭션 안에서 로드). */
    private String teamName(Team t) {
        return t == null || t.getName() == null ? "미정" : t.getName();
    }

}
