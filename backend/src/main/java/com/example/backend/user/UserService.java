package com.example.backend.user;

import com.example.backend.global.exceptopn.NotFoundException;
import com.example.backend.global.exceptopn.UnauthorizedException;
import com.example.backend.user.dto.RankView;
import com.example.backend.user.dto.UserView;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;

    // 내 정보 + 전적
    public UserView me(Long userId) {
        if (userId == null) {
            throw new UnauthorizedException("로그인이 필요합니다.");
        }
        User user = userRepository.findById(userId).orElseThrow(
                () -> new NotFoundException("유저를 찾을 수 없습니다.")
        );
        return UserView.from(user);
    }

    // 리더보드 (적중수 내림차순, 순위 부여)
    public List<RankView> leaderboard() {
        List<User> users = userRepository.findLeaderboard();
        List<RankView> rows = new ArrayList<>();
        int rank = 1;
        for (User u : users) {
            rows.add(RankView.of(rank++, u));
        }
        return rows;
    }
}
