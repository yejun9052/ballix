// 날짜/페이지네이션 포맷 유틸 — 백엔드 KST 시간 문자열을 화면용으로 변환

export const KST_TIME_ZONE = "Asia/Seoul";

export function getPageContent(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.content)) {
    return data.content;
  }

  return [];
}

export function parseKstDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (!value) {
    return null;
  }
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
  const date = new Date(hasZone ? value : `${value}+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}


export function formatMatchDateTime(matchTime) {
  const date = parseKstDate(matchTime);
  if (!date) {
    return matchTime ? String(matchTime) : "일정 미정";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST_TIME_ZONE,
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}


export function formatDateInputValue(matchTime) {
  const date = parseKstDate(matchTime);
  if (!date) {
    return "";
  }

  // en-CA 로케일은 YYYY-MM-DD 형식을 준다. KST 기준으로 날짜를 뽑는다.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}


export function getGroupLabel(group) {
  const groupCode =
    group.match(/grp\.?\s*([A-L])/i)?.[1] ||
    group.match(/group\s*([A-L])/i)?.[1] ||
    group.match(/^([A-L])$/i)?.[1];

  return groupCode ? `${groupCode.toUpperCase()}조` : group;
}


export function getGroupSortValue(group) {
  const label = getGroupLabel(group);
  const groupCode = label.match(/^([A-L])조$/)?.[1];
  return groupCode || label;
}

// 목록 정렬: 진행 중(시간순) → 나머지 날짜순·시간순
