package com.example.backend.fotmob.lineup;

import com.example.backend.fotmob.player.Player;
import com.example.backend.global.common.BaseTimeEntity;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * FotMob 라인업의 선수 1명. 선발/후보 + 평점 + 교체 시각 등 <b>경기별</b> 정보를 담는다.
 * 폴링 시 matchId 기준으로 일괄 삭제 후 재삽입하므로 Match와 연관관계를 두지 않고
 * 외래키 컬럼(matchId)만 보관한다.
 * <p>
 * 선수 식별·소속·상세는 {@link Player} 테이블이 정본이며, 여기서는 player_id FK로만 참조한다.
 * 이름/선수ID는 응답 호환을 위해 getter가 Player에서 위임해 평탄 필드로 내려준다.
 */
@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Table(name = "lineup_player", indexes = @Index(name = "idx_lineup_match", columnList = "match_id"))
public class LineupPlayer extends BaseTimeEntity {

    /** ballix 내부 Match PK. */
    @Column(name = "match_id", nullable = false)
    private Long matchId;

    /** 선수(식별·소속·상세의 정본). 직렬화는 평탄 getter로 대체하므로 중첩 노출은 막는다. */
    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "player_id")
    private Player player;

    @Column(nullable = true)
    private Integer shirtNumber;

    @Column(nullable = true)
    private Integer positionId;

    /** 파생 세부 포지션 라벨(GK·LB·CB·RB·CM·CAM·LW·RW·ST 등). positionId+좌표에서 계산({@link PositionResolver}). */
    @Column(nullable = true)
    private String position;

    /** 피치 좌표(0~1). posX=깊이(0=GK쪽,1=공격), posY=좌우. 포메이션 배치도용. */
    @Column(name = "pos_x", nullable = true)
    private Double posX;

    @Column(name = "pos_y", nullable = true)
    private Double posY;

    /** true=홈팀, false=원정팀. */
    @Column(nullable = false)
    private boolean home;

    /** true=선발, false=후보. */
    @Column(nullable = false)
    private boolean starter;

    /** FotMob 평점. 경기 전/직후엔 null일 수 있음. */
    @Column(nullable = true)
    private Double rating;

    /** 교체 투입 시각(분). 선발이면 null. */
    @Column(nullable = true)
    private Integer subInMinute;

    /** 교체 아웃 시각(분). 끝까지 뛰면 null. */
    @Column(nullable = true)
    private Integer subOutMinute;

    /** 경기별 상세 스탯(슈팅·기회 창출·터치 등) JSON — [{title,value}]. 매 폴링 갱신. 진행/종료 시에만 채워짐. */
    @JsonIgnore
    @Column(name = "match_stats_json", columnDefinition = "TEXT")
    private String matchStatsJson;

    /** 응답 호환: 선수 이름을 Player에서 위임해 평탄 필드로 내려준다(기존 스키마 유지). */
    @JsonProperty("name")
    public String getName() {
        return player != null ? player.getName() : null;
    }

    /** 응답 호환: 선수 FotMob ID(프론트 사진/모달·이벤트 매칭에 사용). */
    @JsonProperty("fotmobPlayerId")
    public Long getFotmobPlayerId() {
        return player != null ? player.getFotmobPlayerId() : null;
    }

    private static final ObjectMapper MS_MAPPER = new ObjectMapper();

    /** 경기별 상세 스탯을 [{title,value}] 리스트로 내려준다(없으면 빈 리스트). */
    @JsonProperty("matchStats")
    public List<Map<String, Object>> getMatchStats() {
        if (matchStatsJson == null || matchStatsJson.isBlank()) return List.of();
        try {
            return MS_MAPPER.readValue(matchStatsJson, new TypeReference<List<Map<String, Object>>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }
}
