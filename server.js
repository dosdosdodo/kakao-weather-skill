const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

// [천재적 설정 1] Railway 환경 변수 및 포트 바인딩
const PORT = process.env.PORT || 3000;
const KAKAO_API_KEY = process.env.KAKAO_REST_API_KEY;

const WMO_CODE = {
  0: "맑음 ☀️", 1: "대체로 맑음 🌤", 2: "구름 조금 ⛅", 3: "흐림 ☁️",
  45: "안개 🌫", 48: "짙은 안개 🌫", 51: "가벼운 이슬비 🌦", 53: "이슬비 🌦",
  55: "강한 이슬비 🌧", 61: "약한 비 🌧", 63: "비 🌧", 65: "강한 비 🌧",
  71: "약한 눈 🌨", 73: "눈 🌨", 75: "강한 눈 ❄️", 80: "소나기 🌦",
  81: "강한 소나기 🌧", 82: "폭우 ⛈", 95: "뇌우 ⛈", 96: "우박 ⛈", 99: "강한 우박 ⛈",
};

const locationStore = new Map(); 
const tempSearchDB = new Map();

// [천재적 설정 2] 하이브리드 검색 (키워드 -> 주소 순)
async function searchLocation(query) {
  try {
    const headers = { Authorization: `KakaoAK ${KAKAO_API_KEY}` };
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

const createTextRes = (text, quickReplies = []) => ({
  version: "2.0",
  template: {
    outputs: [{ simpleText: { text } }],
    quickReplies: quickReplies.map(label => ({ label, action: "message", messageText: label }))
  }
});

// --- 라우팅 섹션 ---

/** [핵심] Railway Health Check용 GET 경로 */
// Railway는 이 경로에 신호를 보내 서버가 살아있는지 확인합니다.
app.get("/", (req, res) => {
  res.status(200).send("✅ 서버가 정상적으로 가동 중입니다.");
});

/** 카카오톡 스킬 엔드포인트 */
app.post("/skill", async (req, res) => {
  const utterance = req.body.userRequest?.utterance || "";
  const userId = req.body.userRequest?.user?.id || "anon";

  // 위치 설정 로직
  if (utterance.includes("위치") || /^\d+$/.test(utterance)) {
    const query = utterance.replace("위치", "").trim();
    if (!query && !/^\d+$/.test(utterance)) return res.json(createTextRes("🔎 지역명을 입력해주세요."));

    // 번호 선택 처리
    if (/^\d+$/.test(utterance) && tempSearchDB.has(userId)) {
        const list = tempSearchDB.get(userId);
        const sel = list[parseInt(utterance) - 1];
        if (sel) {
          locationStore.set(userId, { lat: sel.y, lon: sel.x, name: sel.place_name || sel.address_name });
          tempSearchDB.delete(userId);
          return res.json(createTextRes(`✅ 설정 완료: ${sel.place_name || sel.address_name}`, ["오늘 날씨"]));
        }
    }

    const results = await searchLocation(query);
    if (results.length === 0) return res.json(createTextRes("❌ 검색 결과가 없습니다."));
    if (results.length === 1) {
      const loc = results[0];
      locationStore.set(userId, { lat: loc.y, lon: loc.x, name: loc.place_name || loc.address_name });
      return res.json(createTextRes(`📍 ${loc.place_name || loc.address_name} 설정 완료!`, ["오늘 날씨"]));
    }
    
    tempSearchDB.set(userId, results);
    let msg = `🔎 여러 곳이 검색되었습니다. 번호를 입력하세요:\n\n`;
    results.forEach((l, i) => msg += `${i + 1}. ${l.place_name || l.address_name}\n`);
    return res.json(createTextRes(msg));
  }

  // 날씨 조회 로직 (기본 응답)
  return res.json(createTextRes("안녕하세요! '위치 서울' 처럼 지역을 먼저 설정해주세요.", ["위치 설정"]));
});

// [천재적 설정 3] 서버 소켓 관리 및 안정적 종료
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 서버 실행 중: 포트 ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM 신호 감지: 안전하게 서버를 종료합니다.');
  server.close(() => process.exit(0));
});
