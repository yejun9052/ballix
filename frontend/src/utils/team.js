// 팀·국가명 한글화 유틸

export const countryNameKo = {
  Afghanistan: "아프가니스탄",
  Algeria: "알제리",
  Andorra: "안도라",
  Argentina: "아르헨티나",
  Australia: "호주",
  Austria: "오스트리아",
  Belgium: "벨기에",
  "Bosnia and Herzegovina": "보스니아 헤르체고비나",
  Brazil: "브라질",
  Bulgaria: "불가리아",
  Canada: "캐나다",
  "Cape Verde": "카보베르데",
  Colombia: "콜롬비아",
  Croatia: "크로아티아",
  Curacao: "퀴라소",
  Czechia: "체코",
  "DR Congo": "DR콩고",
  Ecuador: "에콰도르",
  Egypt: "이집트",
  England: "잉글랜드",
  Finland: "핀란드",
  France: "프랑스",
  Gambia: "감비아",
  Germany: "독일",
  Ghana: "가나",
  Haiti: "아이티",
  Iceland: "아이슬란드",
  India: "인도",
  Iran: "이란",
  Iraq: "이라크",
  "Ivory Coast": "코트디부아르",
  Jamaica: "자메이카",
  Japan: "일본",
  Jordan: "요르단",
  Kosovo: "코소보",
  Maldives: "몰디브",
  Malta: "몰타",
  Mexico: "멕시코",
  Mongolia: "몽골",
  Montenegro: "몬테네그로",
  Morocco: "모로코",
  Netherlands: "네덜란드",
  "New Zealand": "뉴질랜드",
  Nicaragua: "니카라과",
  Nigeria: "나이지리아",
  "North Macedonia": "북마케도니아",
  Norway: "노르웨이",
  Panama: "파나마",
  Paraguay: "파라과이",
  Poland: "폴란드",
  Portugal: "포르투갈",
  Qatar: "카타르",
  "Saudi Arabia": "사우디아라비아",
  Scotland: "스코틀랜드",
  Senegal: "세네갈",
  Serbia: "세르비아",
  Singapore: "싱가포르",
  Slovakia: "슬로바키아",
  "South Africa": "남아프리카공화국",
  "South Korea": "대한민국",
  Spain: "스페인",
  Sweden: "스웨덴",
  Switzerland: "스위스",
  Tunisia: "튀니지",
  Turkiye: "튀르키예",
  Ukraine: "우크라이나",
  Uruguay: "우루과이",
  USA: "미국",
  Uzbekistan: "우즈베키스탄",
  Zimbabwe: "짐바브웨",
};


// 국가 3글자 약자 (FIFA 코드) — FotMob tla가 비어있어 프론트에서 매핑
export const countryTla = {
  Afghanistan: "AFG", Algeria: "ALG", Andorra: "AND", Argentina: "ARG",
  Australia: "AUS", Austria: "AUT", Belgium: "BEL", "Bosnia and Herzegovina": "BIH",
  Brazil: "BRA", Bulgaria: "BUL", Canada: "CAN", "Cape Verde": "CPV",
  Colombia: "COL", Croatia: "CRO", Curacao: "CUW", Czechia: "CZE",
  "DR Congo": "COD", Ecuador: "ECU", Egypt: "EGY", England: "ENG",
  Finland: "FIN", France: "FRA", Gambia: "GAM", Germany: "GER",
  Ghana: "GHA", Haiti: "HAI", Iceland: "ISL", India: "IND",
  Iran: "IRN", Iraq: "IRQ", "Ivory Coast": "CIV", Jamaica: "JAM",
  Japan: "JPN", Jordan: "JOR", Kosovo: "KVX", Maldives: "MDV",
  Malta: "MLT", Mexico: "MEX", Mongolia: "MNG", Montenegro: "MNE",
  Morocco: "MAR", Netherlands: "NED", "New Zealand": "NZL", Nicaragua: "NCA",
  Nigeria: "NGA", "North Macedonia": "MKD", Norway: "NOR", Panama: "PAN",
  Paraguay: "PAR", Poland: "POL", Portugal: "POR", Qatar: "QAT",
  "Saudi Arabia": "KSA", Scotland: "SCO", Senegal: "SEN", Serbia: "SRB",
  Singapore: "SGP", Slovakia: "SVK", "South Africa": "RSA", "South Korea": "KOR",
  Spain: "ESP", Sweden: "SWE", Switzerland: "SUI", Tunisia: "TUN",
  Turkiye: "TUR", Ukraine: "UKR", Uruguay: "URU", USA: "USA",
  Uzbekistan: "UZB", Zimbabwe: "ZIM",
};

// 3글자 약자 반환 — 없으면 한글명, 그것도 없으면 원본
export function teamTla(originalName) {
  if (!originalName) return "TBD";
  return countryTla[originalName] || countryNameKo[originalName] || originalName;
}


export function getTeamName(team) {
  const originalName = team?.name || team?.shortName || "TBD";
  return countryNameKo[originalName] || countryNameKo[team?.shortName] || originalName;
}

export function getTeamNameByOriginal(originalName) {
  if (!originalName) {
    return "TBD";
  }
  return countryNameKo[originalName] || originalName;
}


export function teamKo(name) {
  return countryNameKo[name] || name;
}

