// 사이트 푸터

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-brand">
        <span className="brand-pill">BALLIX</span>
        <p>축구 일정과 예측 데이터를 더 쉽게 읽기 위한 실험적인 스포츠 플랫폼입니다.</p>
      </div>
      <div className="site-footer-links" aria-label="푸터 링크">
        <div>
          <strong>서비스</strong>
          <span>경기 일정</span>
          <span>AI 승률</span>
          <span>승부예측</span>
        </div>
        <div>
          <strong>안내</strong>
          <span>공지사항</span>
          <span>이용 가이드</span>
          <span>문의하기</span>
        </div>
        <div>
          <strong>정책</strong>
          <span>이용약관</span>
          <span>개인정보 처리방침</span>
          <span>운영정책</span>
        </div>
      </div>
      <div className="site-footer-bottom">
        <span>© 2026 Ballix. All rights reserved.</span>
        <span>Data powered by public football sources.</span>
      </div>
    </footer>
  );
}

