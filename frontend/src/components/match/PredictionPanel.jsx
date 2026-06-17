// 승부예측 패널 — 홈/무/원정 예측 저장·조회, 참여자 분포 표시
import { useEffect, useState } from "react";
import { predict, getPredictionByMatch, getPredictionRatio } from "../../api/prediction.js";
import { winnerLabels } from "../../utils/constants.js";
import { StateMessage } from "../common/StateMessage.jsx";

export function PredictionPanel({ isLoggedIn, match, onLogin }) {
  const [myPrediction, setMyPrediction] = useState(null);
  const [ratio, setRatio] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const kickoffPassed = new Date(match.matchTimeRaw).getTime() <= Date.now();
  const isOpen = match.statusRaw === "SCHEDULED" && !kickoffPassed;

  useEffect(() => {
    if (!isLoggedIn) {
      setMyPrediction(null);
      setRatio(null);
      setLoadError("");
      return undefined;
    }
    let mounted = true;
    setIsLoading(true);
    setLoadError("");

    // 예측 전이면 백엔드가 400/404로 응답(정상 흐름)이라 전역 토스트를 끈다.
    getPredictionByMatch(match.id, { skipErrorToast: true })
      .then((prediction) => {
        if (!mounted) {
          return;
        }
        setMyPrediction(prediction);
        return getPredictionRatio(match.id, { skipErrorToast: true }).then((data) => {
          if (mounted) {
            setRatio(data);
          }
        });
      })
      .catch((loadErr) => {
        if (!mounted) {
          return;
        }
        // 서버/세션 오류는 "예측 안 함"과 구분해서 사용자에게 알린다.
        // (예측 전이면 백엔드가 400/404로 응답 → 정상 흐름이라 메시지 없음)
        const status = loadErr.response?.status ?? 0;
        setMyPrediction(null);
        setRatio(null);
        if (status === 401) {
          setLoadError("로그인이 만료되었습니다. 다시 로그인해 주세요.");
        } else if (status === 0 || status >= 500) {
          setLoadError("예측 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        } else {
          setLoadError("");
        }
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [isLoggedIn, match.id]);

  async function handleVote(winner) {
    setIsSubmitting(true);
    setError("");
    try {
      const prediction = await predict(match.id, winner);
      setMyPrediction(prediction);
      const data = await getPredictionRatio(match.id);
      setRatio(data);
    } catch (voteError) {
      setError(voteError.response?.data?.msg || "예측을 저장하지 못했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const voteOptions = [
    { label: `${match.homeTeam} 승`, value: "HOME_TEAM" },
    { label: "무승부", value: "DRAW" },
    { label: `${match.awayTeam} 승`, value: "AWAY_TEAM" },
  ];

  if (!isLoggedIn) {
    return (
      <div className="vote-lock-wrap">
        <div className="login-overlay">
          <span className="login-overlay-kicker">예측 참여 잠금</span>
          <strong>로그인 후 승부예측에 참여할 수 있어요</strong>
          <p>경기 정보는 그대로 볼 수 있고, 로그인하면 선택 기록과 랭킹 점수가 저장됩니다.</p>
          <button type="button" onClick={onLogin}>Google 로그인</button>
        </div>
      </div>
    );
  }

  return (
    <div className="vote-active">
      {isLoading && <StateMessage text="내 예측을 확인하는 중" />}

      {!isLoading && (
        <>
          {loadError && <p className="action-error">{loadError}</p>}
          <div className="vote-choice-grid">
            {voteOptions.map((option) => {
              const isPicked = myPrediction?.predictedWinner === option.value;
              return (
                <button
                  type="button"
                  key={option.value}
                  className={isPicked ? "is-picked" : ""}
                  onClick={() => handleVote(option.value)}
                  disabled={isSubmitting || !isOpen}
                >
                  {option.label}
                  {isPicked && <em className="pick-tag">선택함</em>}
                </button>
              );
            })}
          </div>

          {!isOpen && (
            <p className="vote-hint">
              {kickoffPassed || match.statusRaw !== "SCHEDULED"
                ? "이미 시작됐거나 종료된 경기는 예측을 변경할 수 없습니다."
                : "예측을 받을 수 없는 경기입니다."}
            </p>
          )}

          {myPrediction && (
            <p className="vote-current">
              내 예측: <b>{winnerLabels[myPrediction.predictedWinner]}</b>
              {myPrediction.isCorrect === true && <span className="result-chip correct"> 적중</span>}
              {myPrediction.isCorrect === false && <span className="result-chip wrong"> 실패</span>}
            </p>
          )}

          {error && <p className="action-error">{error}</p>}

          {ratio && ratio.total > 0 && (
            <div className="ratio-block">
              <div className="ratio-head">
                <span>참여자 예측 분포</span>
                <b>{ratio.total}명</b>
              </div>
              <div className="probability-stack" aria-label="예측 분포">
                <span className="home" style={{ width: `${ratio.homePercent}%` }}>
                  {ratio.homePercent}%
                </span>
                <span className="draw" style={{ width: `${ratio.drawPercent}%` }}>
                  {ratio.drawPercent}%
                </span>
                <span className="away" style={{ width: `${ratio.awayPercent}%` }}>
                  {ratio.awayPercent}%
                </span>
              </div>
              <div className="probability-legend">
                <span><i className="home" />{match.homeTeam} {ratio.homePercent}%</span>
                <span><i className="draw" />무 {ratio.drawPercent}%</span>
                <span><i className="away" />{match.awayTeam} {ratio.awayPercent}%</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

