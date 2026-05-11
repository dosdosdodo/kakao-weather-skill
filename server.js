const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

// [천재적 포인트 1] Railway 환경 변수 우선순위 설정
// Railway는 내부적으로 PORT 환경 변수를 주입합니다.
const PORT = process.env.PORT || 3000;
const KAKAO_API_KEY = process.env.KAKAO_REST_API_KEY;

// --- 날씨 관련 설정 및 헬퍼 ---
const WMO_CODE = {
  0: "맑음 ☀️", 1: "대체로 맑음 🌤", 2: "구름 조금 ⛅", 3: "흐림 ☁️",
  45: "안개 🌫", 48: "짙은 안개 🌫", 51: "가벼운 이슬비 🌦", 53: "이슬비 🌦",
  55: "강한 이슬비 🌧", 61: "약한 비 🌧", 63: "비 🌧", 65: "강한 비 🌧",
  71: "약한 눈 🌨", 73: "눈 🌨", 75: "강한 눈 ❄️", 80: "소나기 🌦",
  81: "강한 소나기 🌧", 82: "폭우 ⛈", 95: "뇌우 ⛈", 96: "우박 ⛈", 99: "강한 우박 ⛈",
};

const locationStore = new Map(); 
const tempSearchDB = new Map();

// [천재적 포인트 2] 하이브리드 지역 검색 (정확도 대폭 향상)
async function searchLocation(query) {
  try {
    const headers = { Authorization: `KakaoAK ${KAKAO_API_KEY}` };
    // 키워드 검색을 먼저 해서 '랜드마크' 대응력을 높입니다.
    let res = await axios.get('https://dapi.kakao.com/v2/local/search/keyword.json', {
      params: { query, size: 5 }, headers
    });
    if (res.data.documents.length === 0) {
      res = await axios.get('https://dapi.kakao.com/v2/local/search/address.json', {
        params: { query, size: 5 }, headers
      });
    }
    return res.data.documents;
  } catch (e) {
    console.error("✘ Kakao API Error:", e.message);
    return [];
  }
}

// --- 공통 응답 빌더 ---
const createTextRes = (text, quickReplies = []) => ({
  version: "2.0",
  template: {
    outputs: [{ simpleText: { text } }],
    quickReplies: quickReplies.map(label => ({ label, action: "message", messageText: label }))
  }
});

// --- 라우팅 ---

/** [천재적 포인트 3] Railway Health Check 응답 추가 */
// 이 경로가 없으면 Railway가 서버를 죽은 것으로 오해합니다.
app.get("/", (req, res) => {
  res.status(200).send("✅ Weather Bot is Active!");
});

app.post("/skill", async (req, res) => {
  const body = req.body;
  const userId = body.userRequest?.user?.id || "anonymous";
  const utterance = body.userRequest?.utterance?.trim() || "";

  // 1. 위치 설정 및 번호 선택 로직
  if (utterance.includes("위치") || /^\d+$/.test(utterance)) {
    // (이전 답변의 handleLocation 로직과 동일)
    // ... 중략 ...
  }

  // 2. 날씨 조회 로직
  // ... 중략 ...

  // 3. 기본 응답
  return res.json(createTextRes("안녕하세요! 위치를 먼저 설정해주세요.", ["위치 설정"]));
});

// [천재적 포인트 4] Graceful Shutdown (우아한 종료)
// SIGTERM 신호를 받으면 안전하게 서버를 닫습니다.
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ 서버 가동 완료: 포트 ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM 수신. 서버 종료 중...');
  server.close(() => {
    console.log('종료 완료.');
    process.exit(0);
  });
});
