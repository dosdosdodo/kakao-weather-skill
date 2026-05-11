const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

// 환경변수 및 상수 설정
const PORT = process.env.PORT || 3000;
const KAKAO_API_KEY = process.env.KAKAO_REST_API_KEY;

const WMO_CODE = {
  0: "맑음 ☀️", 1: "대체로 맑음 🌤", 2: "구름 조금 ⛅", 3: "흐림 ☁️",
  45: "안개 🌫", 48: "짙은 안개 🌫", 51: "가벼운 이슬비 🌦", 53: "이슬비 🌦",
  55: "강한 이슬비 🌧", 61: "약한 비 🌧", 63: "비 🌧", 65: "강한 비 🌧",
  71: "약한 눈 🌨", 73: "눈 🌨", 75: "강한 눈 ❄️", 80: "소나기 🌦",
  81: "강한 소나기 🌧", 82: "폭우 ⛈", 95: "뇌우 ⛈", 96: "우박 ⛈", 99: "강한 우박 ⛈",
};

// 데이터 저장소 (실제 서비스 시 Redis나 DB 권장)
const locationStore = new Map(); 
const tempSearchDB = new Map();

/** [천재적 포인트 1] 하이브리드 지역 검색 시스템 */
async function searchLocation(query) {
  try {
    const headers = { Authorization: `KakaoAK ${KAKAO_API_KEY}` };
    
    // 1단계: 키워드 검색 시도 (맛집, 역 이름, 랜드마크 등 대응)
    let res = await axios.get('https://dapi.kakao.com/v2/local/search/keyword.json', {
      params: { query, size: 5 }, headers
    });

    // 2단계: 키워드 결과 없으면 정식 주소 검색 시도
    if (res.data.documents.length === 0) {
      res = await axios.get('https://dapi.kakao.com/v2/local/search/address.json', {
        params: { query, size: 5 }, headers
      });
    }

    return res.data.documents;
  } catch (e) {
    console.error("✘ Kakao API 호출 실패:", e.response?.data || e.message);
    return [];
  }
}

/** 날씨 페칭 (Open-Meteo) */
async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&timezone=Asia%2FSeoul&forecast_days=8`;
  const res = await axios.get(url);
  return res.data.daily;
}

const dayName = (date) => ["일", "월", "화", "수", "목", "금", "토"][new Date(date).getDay()] + "요일";

// --- 응답 빌더 ---
const createTextRes = (text, quickReplies = []) => ({
  version: "2.0",
  template: {
    outputs: [{ simpleText: { text } }],
    quickReplies: quickReplies.map(label => ({ label, action: "message", messageText: label }))
  }
});

// --- 핸들러 로직 ---

async function handleLocation(req, res) {
  const userId = req.body.userRequest.user.id;
  const utterance = req.body.userRequest.utterance.trim();

  // 번호 선택 모드
  if (/^\d+$/.test(utterance) && tempSearchDB.has(userId)) {
    const list = tempSearchDB.get(userId);
    const sel = list[parseInt(utterance) - 1];
    if (sel) {
      locationStore.set(userId, { lat: sel.y, lon: sel.x, name: sel.place_name || sel.address_name });
      tempSearchDB.delete(userId);
      return res.json(createTextRes(`✅ 설정 완료!\n📍 ${sel.place_name || sel.address_name}\n이제 날씨를 물어보세요!`, ["오늘 날씨", "이번주 날씨"]));
    }
  }

  // 검색 모드
  const query = utterance.replace("위치", "").trim();
  if (!query) return res.json(createTextRes("🔎 찾으실 지역명을 입력해주세요.\n(예: 위치 강남역, 위치 한남동)"));

  const results = await searchLocation(query);
  if (results.length === 0) return res.json(createTextRes("❌ 검색 결과가 없습니다. 다시 입력해주세요."));

  if (results.length === 1) {
    const loc = results[0];
    locationStore.set(userId, { lat: loc.y, lon: loc.x, name: loc.place_name || loc.address_name });
    return res.json(createTextRes(`📍 "${loc.place_name || loc.address_name}"(으)로 설정되었습니다!`, ["오늘 날씨", "내일 날씨"]));
  }

  // 다중 결과 처리
  tempSearchDB.set(userId, results);
  let msg = `🔎 여러 곳이 검색되었습니다.\n번호를 입력해주세요:\n\n`;
  results.forEach((l, i) => msg += `${i + 1}. ${l.place_name || l.address_name}\n`);
  return res.json(createTextRes(msg));
}

async function handleWeather(req, res, dayIndex) {
  const userId = req.body.userRequest.user.id;
  const loc = locationStore.get(userId);
  if (!loc) return res.json(createTextRes("📍 먼저 위치 설정을 해주세요!", ["위치 설정"]));

  try {
    const d = await fetchWeather(loc.lat, loc.lon);
    const i = dayIndex;
    const title = i === 0 ? "오늘" : "내일";
    const text = `📍 ${loc.name} ${title} 날씨\n📅 ${d.time[i]} (${dayName(d.time[i])})\n\n🌤 상태: ${WMO_CODE[d.weathercode[i]] ?? "정보 없음"}\n🌡 온도: ${d.temperature_2m_min[i]}° ~ ${d.temperature_2m_max[i]}°C\n🌧 강수: ${d.precipitation_sum[i]}mm\n💨 풍속: ${d.windspeed_10m_max[i]}km/h`;
    return res.json(createTextRes(text, ["오늘 날씨", "내일 날씨", "이번주 날씨", "위치 변경"]));
  } catch (e) {
    return res.json(createTextRes("⚠️ 날씨 데이터를 가져오는데 실패했습니다."));
  }
}

// --- 서버 메인 ---

app.post("/skill", async (req, res) => {
  const utterance = req.body.userRequest.utterance;

  if (utterance.includes("위치") || /^\d+$/.test(utterance)) return await handleLocation(req, res);
  if (utterance.includes("오늘")) return await handleWeather(req, res, 0);
  if (utterance.includes("내일")) return await handleWeather(req, res, 1);
  
  return res.json(createTextRes("반가워요! 날씨 챗봇입니다. 🌤\n\n'위치 강남역' 처럼 지역을 먼저 설정하고 날씨를 물어봐주세요!", ["위치 설정"]));
});

// [천재적 포인트 2] 예기치 못한 에러로 서버가 죽는 것을 방지
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 무적 모드로 실행 중입니다.`);
});
