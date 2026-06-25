// 관리자 - 데이터 관리 탭 (일정/경기/순위 동기화, AI 생성, FotMob 검색, 폴링 주기)
import { useEffect, useState } from "react";
import {
  getPollInterval,
  setPollInterval,
  searchMatch,
  syncSchedule,
  syncScheduleByDate,
  syncMatch,
  syncStandings,
  backfillDetails,
} from "../../api/fotmobAdmin.js";
import { predictAi, getLiveAi, setLiveAi } from "../../api/admin.js";
import { setReplay, clearReplay, backfillHighlights } from "../../api/matchAdmin.js";
import { formatDateInputValue } from "../../utils/format.js";

export function AdminDataTab() {
  const [pollMin, setPollMin] = useState("");
  const [currentPoll, setCurrentPoll] = useState(null);
  const [liveAi, setLiveAiState] = useState(null);   // { enabled, intervalMinutes, liveTargets }
  const [pastDays, setPastDays] = useState("7");
  const [futureDays, setFutureDays] = useState("14");
  const [syncDate, setSyncDate] = useState("");
  const [singleMatchId, setSingleMatchId] = useState("");
  const [backfillSince, setBackfillSince] = useState("14");
  const [backfillLimit, setBackfillLimit] = useState("8");
  const [standingsCompId, setStandingsCompId] = useState("");
  const [aiMatchId, setAiMatchId] = useState("");
  const [aiForce, setAiForce] = useState(false);
  const [searchTeam1, setSearchTeam1] = useState("");
  const [searchTeam2, setSearchTeam2] = useState("");
  const [searchComp, setSearchComp] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [replayMatchId, setReplayMatchId] = useState("");
  const [replayYoutube, setReplayYoutube] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState("");

  useEffect(() => {
    getPollInterval()
      .then((d) => setCurrentPoll(typeof d === "number" ? d : d?.minutes ?? d))
      .catch(() => {});
    getLiveAi()
      .then((d) => setLiveAiState(d))
      .catch(() => {});
  }, []);

  async function toggleLiveAi(next) {
    await run(`실시간 AI 예측 ${next ? "켜기" : "끄기"}`, async () => {
      await setLiveAi(next);
      const d = await getLiveAi();
      setLiveAiState(d);
    });
  }

  async function run(label, fn) {
    setLoading(label);
    setMsg("");
    try {
      await fn();
      setMsg(`✅ ${label} 완료`);
    } catch (err) {
      setMsg(`❌ ${label} 실패: ${err.response?.data?.msg || err.message}`);
    } finally {
      setLoading("");
    }
  }

  function today() {
    // KST 기준 오늘 날짜(YYYYMMDD). toISOString은 UTC라 한국 새벽에 하루 어긋난다.
    return formatDateInputValue(new Date()).replace(/-/g, "");
  }

  async function handleBackfill() {
    setLoading("상세 일괄 보강");
    setMsg("");
    try {
      const n = await backfillDetails({
        sinceDays: Number(backfillSince),
        limit: Number(backfillLimit),
      });
      const count = typeof n === "number" ? n : (n?.data ?? n ?? 0);
      setMsg(`✅ 상세 ${count}경기 보강 완료 (남은 경기가 있으면 다시 눌러 이어서 처리)`);
    } catch (err) {
      setMsg(`❌ 상세 일괄 보강 실패: ${err.response?.data?.msg || err.message}`);
    } finally {
      setLoading("");
    }
  }

  async function handleBackfillHighlights() {
    setLoading("하이라이트 보강");
    setMsg("");
    try {
      const n = await backfillHighlights({ limit: 10, sinceDays: 7 });
      const count = typeof n === "number" ? n : (n?.data ?? n ?? 0);
      setMsg(`✅ 하이라이트 ${count}경기 보강 완료 (영상이 아직 안 올라온 경기는 자동으로 30분 뒤 재시도)`);
    } catch (err) {
      setMsg(`❌ 하이라이트 보강 실패: ${err.response?.data?.msg || err.message}`);
    } finally {
      setLoading("");
    }
  }

  async function handleSearch() {
    if (!searchTeam1 && !searchTeam2) {
      setMsg("❌ 팀명을 하나 이상 입력해주세요.");
      return;
    }
    setLoading("FotMob 검색");
    setMsg("");
    setSearchResult(null);
    try {
      const data = await searchMatch({
        team1: searchTeam1,
        team2: searchTeam2,
        competition: searchComp,
      });
      setSearchResult(data);
      if (!data || (Array.isArray(data) && data.length === 0)) {
        setMsg("검색 결과가 없습니다.");
      }
    } catch (err) {
      setMsg(`❌ FotMob 검색 실패: ${err.response?.data?.msg || err.message}`);
    } finally {
      setLoading("");
    }
  }

  return (
    <div className="admin-section admin-data-tab">
      {msg && <p className={`action-msg ${msg.startsWith("✅") ? "ok" : "err"}`}>{msg}</p>}

      {/* 일정 동기화 */}
      <div className="data-card">
        <h3 className="data-card-title">📅 일정 동기화</h3>
        <div className="data-row">
          <label>과거</label>
          <input
            type="number" min="1" max="30" value={pastDays}
            onChange={(e) => setPastDays(e.target.value)}
            className="data-input short"
          />
          <span>일 / 미래</span>
          <input
            type="number" min="1" max="30" value={futureDays}
            onChange={(e) => setFutureDays(e.target.value)}
            className="data-input short"
          />
          <span>일</span>
          <button
            type="button"
            className="data-btn"
            disabled={Boolean(loading)}
            onClick={() => run("범위 동기화", () =>
              syncSchedule({
                pastDays: Number(pastDays),
                futureDays: Number(futureDays),
              })
            )}
          >
            {loading === "범위 동기화" ? "진행 중…" : "동기화"}
          </button>
        </div>
        <div className="data-row">
          <label>특정 날짜</label>
          <input
            type="date"
            value={syncDate ? `${syncDate.slice(0,4)}-${syncDate.slice(4,6)}-${syncDate.slice(6,8)}` : ""}
            onChange={(e) => setSyncDate(e.target.value.replace(/-/g, ""))}
            className="data-input"
          />
          <button
            type="button"
            className="data-btn"
            disabled={Boolean(loading) || !syncDate}
            onClick={() => run(`${syncDate} 동기화`, () => syncScheduleByDate(syncDate))}
          >
            {loading === `${syncDate} 동기화` ? "진행 중…" : "동기화"}
          </button>
          <button
            type="button"
            className="data-btn secondary"
            disabled={Boolean(loading)}
            onClick={() => { setSyncDate(today()); }}
          >
            오늘
          </button>
        </div>
      </div>

      {/* 단일 경기 동기화 */}
      <div className="data-card">
        <h3 className="data-card-title">🔁 단일 경기 동기화</h3>
        <p className="data-hint">DB 경기 ID로 라인업·이벤트·스코어를 즉시 갱신합니다.</p>
        <div className="data-row">
          <label>경기 ID</label>
          <input
            type="number" min="1" value={singleMatchId}
            onChange={(e) => setSingleMatchId(e.target.value)}
            placeholder="Match DB ID"
            className="data-input"
          />
          <button
            type="button"
            className="data-btn"
            disabled={Boolean(loading) || !singleMatchId}
            onClick={() => run(`경기 ${singleMatchId} 동기화`, () =>
              syncMatch(Number(singleMatchId))
            )}
          >
            {loading === `경기 ${singleMatchId} 동기화` ? "진행 중…" : "동기화"}
          </button>
        </div>
      </div>

      {/* 상세(라인업·이벤트) 일괄 보강 */}
      <div className="data-card">
        <h3 className="data-card-title">🩹 상세 누락 일괄 보강</h3>
        <p className="data-hint">
          시작된(진행 중/종료) 경기 중 라인업·이벤트가 비어 있는 경기를 최근순으로 다시 크롤합니다.
          크롤은 하나씩 순차 처리되어 시간이 걸립니다 — 건수를 나눠 여러 번 누르세요.
        </p>
        <div className="data-row">
          <label>최근</label>
          <input
            type="number" min="1" max="60" value={backfillSince}
            onChange={(e) => setBackfillSince(e.target.value)}
            className="data-input short"
          />
          <span>일 / 최대</span>
          <input
            type="number" min="1" max="50" value={backfillLimit}
            onChange={(e) => setBackfillLimit(e.target.value)}
            className="data-input short"
          />
          <span>경기</span>
          <button
            type="button"
            className="data-btn"
            disabled={Boolean(loading) || !backfillSince || !backfillLimit}
            onClick={handleBackfill}
          >
            {loading === "상세 일괄 보강" ? "보강 중…" : "보강"}
          </button>
        </div>
      </div>

      {/* 순위 갱신 */}
      <div className="data-card">
        <h3 className="data-card-title">📊 순위 강제 갱신</h3>
        <p className="data-hint">Competition 내부 ID로 리그 순위를 즉시 갱신합니다. (월드컵 = 6)</p>
        <div className="data-row">
          <label>Competition ID</label>
          <input
            type="number" min="1" value={standingsCompId}
            onChange={(e) => setStandingsCompId(e.target.value)}
            placeholder="Competition DB ID"
            className="data-input"
          />
          <button
            type="button"
            className="data-btn"
            disabled={Boolean(loading) || !standingsCompId}
            onClick={() => run(`순위 갱신(${standingsCompId})`, () =>
              syncStandings(Number(standingsCompId))
            )}
          >
            {loading === `순위 갱신(${standingsCompId})` ? "진행 중…" : "갱신"}
          </button>
        </div>
      </div>

      {/* AI 승률 예측 */}
      <div className="data-card">
        <h3 className="data-card-title">🤖 AI 승률 예측 생성</h3>
        <p className="data-hint">선택한 경기의 AI 승률을 Gemini로 생성합니다. 종료·취소 경기는 거절됩니다.</p>
        <div className="data-row">
          <label>경기 ID</label>
          <input
            type="number" min="1" value={aiMatchId}
            onChange={(e) => setAiMatchId(e.target.value)}
            placeholder="Match DB ID"
            className="data-input"
          />
          <label className="data-check-label">
            <input
              type="checkbox"
              checked={aiForce}
              onChange={(e) => setAiForce(e.target.checked)}
            />
            강제 재생성
          </label>
          <button
            type="button"
            className="data-btn"
            disabled={Boolean(loading) || !aiMatchId}
            onClick={() => run(`AI 예측(${aiMatchId})`, () =>
              predictAi(Number(aiMatchId), { force: aiForce })
            )}
          >
            {loading === `AI 예측(${aiMatchId})` ? "생성 중…" : "생성"}
          </button>
        </div>
      </div>

      {/* FotMob 검색 */}
      <div className="data-card">
        <h3 className="data-card-title">🔍 FotMob 경기 검색</h3>
        <p className="data-hint">팀명/대회명으로 FotMob matchId 후보를 검색합니다.</p>
        <div className="data-row">
          <label>팀 1</label>
          <input
            type="text" value={searchTeam1}
            onChange={(e) => setSearchTeam1(e.target.value)}
            placeholder="예: Korea"
            className="data-input"
          />
          <label>팀 2</label>
          <input
            type="text" value={searchTeam2}
            onChange={(e) => setSearchTeam2(e.target.value)}
            placeholder="예: Japan"
            className="data-input"
          />
        </div>
        <div className="data-row">
          <label>대회</label>
          <input
            type="text" value={searchComp}
            onChange={(e) => setSearchComp(e.target.value)}
            placeholder="예: World Cup (선택)"
            className="data-input"
          />
          <button
            type="button"
            className="data-btn"
            disabled={loading === "FotMob 검색"}
            onClick={handleSearch}
          >
            {loading === "FotMob 검색" ? "검색 중…" : "검색"}
          </button>
        </div>
        {searchResult && (
          <div className="data-result">
            <pre>{JSON.stringify(searchResult, null, 2)}</pre>
          </div>
        )}
      </div>

      {/* 다시보기(유튜브) 등록/해제 */}
      <div className="data-card">
        <h3 className="data-card-title">🎬 다시보기 등록</h3>
        <p className="data-hint">종료된 경기에 유튜브 다시보기 영상을 등록합니다. (링크 또는 영상 ID)</p>
        <div className="data-row">
          <label>경기 ID</label>
          <input
            type="number" min="1" value={replayMatchId}
            onChange={(e) => setReplayMatchId(e.target.value)}
            placeholder="Match DB ID"
            className="data-input short"
          />
          <input
            type="text" value={replayYoutube}
            onChange={(e) => setReplayYoutube(e.target.value)}
            placeholder="유튜브 링크 또는 영상 ID"
            className="data-input"
          />
          <button
            type="button"
            className="data-btn"
            disabled={Boolean(loading) || !replayMatchId || !replayYoutube}
            onClick={() => run(`다시보기 등록(${replayMatchId})`, () =>
              setReplay(Number(replayMatchId), replayYoutube.trim())
            )}
          >
            {loading === `다시보기 등록(${replayMatchId})` ? "등록 중…" : "등록"}
          </button>
          <button
            type="button"
            className="data-btn secondary"
            disabled={Boolean(loading) || !replayMatchId}
            onClick={() => run(`다시보기 해제(${replayMatchId})`, () =>
              clearReplay(Number(replayMatchId))
            )}
          >
            해제
          </button>
        </div>
      </div>

      {/* 하이라이트 자동검색 일괄 보강 */}
      <div className="data-card">
        <h3 className="data-card-title">🎞 하이라이트 일괄 보강</h3>
        <p className="data-hint">
          종료됐는데 다시보기 영상이 없는 최근 경기를 즉시 유튜브에서 재검색합니다(한국 방송사 + 양 팀 매칭).
          평소엔 30분마다 자동으로 돌지만, 지금 바로 채우고 싶을 때 누르세요. 이미 등록된(수동 포함) 영상은 건드리지 않습니다.
        </p>
        <div className="data-row">
          <button
            type="button"
            className="data-btn"
            disabled={Boolean(loading)}
            onClick={handleBackfillHighlights}
          >
            {loading === "하이라이트 보강" ? "보강 중…" : "지금 보강"}
          </button>
        </div>
      </div>

      {/* 폴링 주기 */}
      <div className="data-card">
        <h3 className="data-card-title">⏱ 폴링 주기</h3>
        {currentPoll !== null && (
          <p className="data-hint">현재: {currentPoll}분마다 갱신</p>
        )}
        <div className="data-row">
          <label>새 주기</label>
          <input
            type="number" min="1" max="60" value={pollMin}
            onChange={(e) => setPollMin(e.target.value)}
            placeholder="분"
            className="data-input short"
          />
          <span>분</span>
          <button
            type="button"
            className="data-btn"
            disabled={Boolean(loading) || !pollMin}
            onClick={() => run("폴링 주기 변경", async () => {
              await setPollInterval(Number(pollMin));
              setCurrentPoll(Number(pollMin));
            })}
          >
            {loading === "폴링 주기 변경" ? "적용 중…" : "적용"}
          </button>
        </div>
        <p className="data-hint">※ 재시작 시 application.yml 값으로 초기화됩니다.</p>
      </div>

      {/* 실시간 AI 승률 갱신 토글 */}
      <div className="data-card">
        <h3 className="data-card-title">🤖 실시간 AI 승률 갱신</h3>
        {liveAi && (
          <p className="data-hint">
            현재: <b>{liveAi.enabled ? "🟢 켜짐(ON)" : "⚪ 꺼짐(OFF)"}</b>
            {" · "}{liveAi.intervalMinutes}분 간격 · 지금 대상 경기 {liveAi.liveTargets}개
          </p>
        )}
        <div className="data-row">
          <button
            type="button"
            className="data-btn"
            disabled={Boolean(loading) || liveAi?.enabled === true}
            onClick={() => toggleLiveAi(true)}
          >
            {loading === "실시간 AI 예측 켜기" ? "적용 중…" : "켜기"}
          </button>
          <button
            type="button"
            className="data-btn"
            disabled={Boolean(loading) || liveAi?.enabled === false}
            onClick={() => toggleLiveAi(false)}
          >
            {loading === "실시간 AI 예측 끄기" ? "적용 중…" : "끄기"}
          </button>
        </div>
        <p className="data-hint">
          진행 중(IN_PLAY) + 예측 켜진 경기를 경과 15·30·45·60·75·90분에 라이브 재예측합니다(HT 제외).
          ※ 재시작 시 application.yml 값으로 초기화됩니다.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// 월드컵 화면
// ─────────────────────────────────────────

