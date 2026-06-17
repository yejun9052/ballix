// 로그인 화면 — Google OAuth 진입, 서비스 소개
import { createElement } from "react";
import { BarChart3, Chrome, ShieldCheck, Trophy, UsersRound } from "lucide-react";

export const loginBenefits = [
  {
    icon: BarChart3,
    title: "AI 승률 근거",
    text: "FIFA 랭킹, 라인업, 최근 폼을 합산한 예측 설명을 확인합니다.",
  },
  {
    icon: Trophy,
    title: "승부예측 참여",
    text: "크롤링된 실제 경기에서 홈 승, 무승부, 원정 승 중 하나를 선택합니다.",
  },
  {
    icon: UsersRound,
    title: "랭킹과 커뮤니티",
    text: "정답률 기반 랭킹을 확인하고 예측별 결과로 의견을 나눕니다.",
  },
];

export function LoginScreen({ onBack, onPreview, onGoogleLogin }) {
  return (
    <main className="login-shell">
      <section className="login-screen">
        <div className="login-visual" aria-hidden="true">
          <div className="prediction-preview">
            <div className="preview-top">
              <span>2026 FIFA 월드컵</span>
              <strong>77% YES</strong>
            </div>
            <h2>대한민국 vs 체코</h2>
            <div className="preview-buttons">
              <span>대한민국 승</span>
              <span>무승부</span>
              <span>체코 승</span>
            </div>
          </div>
          <div className="floating-card">
            <ShieldCheck size={22} />
            <span>Google 로그인으로 역할 확인</span>
          </div>
        </div>

        <section className="login-panel">
          <span className="brand-pill">BALLIX</span>
          <h1>축구 예측의 다른 재미를 시작하세요</h1>
          <p>
            AI와 알고리즘이 정리한 승무패 근거를 보고, 내 예측을 남기고,
            랭킹에서 결과를 함께 확인합니다.
          </p>

          <button className="google-login" type="button" onClick={onGoogleLogin}>
            <Chrome size={22} />
            Google로 계속하기
          </button>

          <button className="demo-login" type="button" onClick={onPreview}>
            메인 화면으로 돌아가기
          </button>

          <button className="back-link" type="button" onClick={onBack}>
            로그인 없이 경기 일정 보기
          </button>

          <div className="role-note">
            <strong>권한 안내</strong>
            <span>관리자 계정은 경기마다 AI 승률 예측을 켤 수 있고, 일반 계정은 승부예측에 참여합니다.</span>
          </div>
        </section>

        <section className="benefit-list" aria-label="주요 기능">
          {loginBenefits.map(({ icon: Icon, title, text }) => (
            <article className="benefit-card" key={title}>
              {createElement(Icon, { size: 24 })}
              <div>
                <h2>{title}</h2>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}

