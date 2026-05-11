const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

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

async function searchLocation(query) {
  try {
    const headers = { Authorization: `KakaoAK ${KAKAO_API_KEY}` };
    let res = await axios.get("https://dapi.kakao.com/v2/local/search/keyword.json", {
      params: { query, size: 5 }, headers,
    });
    if (res.data.documents.length === 0) {
      res = await axios.get("https://dapi.kakao.com/v2/local/search/address.json", {
        params: { query, size: 5 }, headers,
      });
    }
    return res.data.documents;
  } catch (e) {
    console.error("✘ Kakao API Error:", e.message);
    return [];
  }
}

async function getWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode,windspeed_10m,relativehumidity_2m&timezone=Asia%2FSeoul`;
  const res = await axios.get(url);
  return res.data.current;
}

const createTextRes = (text, quickReplies = []) => ({
  version: "2.0",
  template: {
    outputs: [{ simpleText: { text } }],
    quickReplies: quickReplies.map((label) => ({
      label, action: "message", messageText: label,
    })),
  },
});

app.get("/", (req, res) => {
  res.status(200).send("✅ 서버가 정상적으로 가동 중입니다.");
});

app.post("/skill", async (req, res) => {
  const utterance = (req.body.userRequest?.utterance || "").trim();
  const userId = req.body.userRequest?.user?.id || "anon";

  // ✅ 핵심 수정: 번호 선택을 가장 먼저 처리
  if (/^\d+$/.test(utterance) && tempSearchDB.has(userId)) {
    const list = tempSearchDB.get(userId);
    const sel = list[parseInt(utterance) - 1];
    if (sel) {
      locationStore.set(userId, {
        lat: sel.y, lon: sel.x,
        name: sel.place_name || sel.address_name,
      });
      tempSearchDB.delete(userId);
      return res.json(
        createTextRes(`✅ 설정 완료: ${sel.place_name || sel.address_name}`, ["오늘 날씨"])
      );
    } else {
      return res.json(createTextRes("❌ 올바른 번호를 입력해주세요."));
    }
  }

  // 위치 설정
  if (utterance.startsWith("위치")) {
    const query = utterance.replace("위치", "").trim();
    if (!query) return res.json(createTextRes("🔎 지역명을 입력해주세요.\n예) 위치 강남구"));

    const results = await searchLocation(query);
    if (results.length === 0) return res.json(createTextRes("❌ 검색 결과가 없습니다."));

    if (results.length === 1) {
      const loc = results[0];
      locationStore.set(userId, {
        lat: loc.y, lon: loc.x,
        name: loc.place_name || loc.address_name,
      });
      return res.json(
        createTextRes(`📍 ${loc.place_name || loc.address_name} 설정 완료!`, ["오늘 날씨"])
      );
    }

    tempSearchDB.set(userId, results);
    let msg = `🔎 여러 곳이 검색되었습니다. 번호를 입력하세요:\n\n`;
    results.forEach((l, i) => {
      msg += `${i + 1}. ${l.place_name || l.address_name}\n`;
    });
    return res.json(createTextRes(msg));
  }

  // 날씨 조회
  if (utterance.includes("날씨")) {
    const loc = locationStore.get(userId);
    if (!loc) {
      return res.json(
        createTextRes("📍 먼저 위치를 설정해주세요!\n예) 위치 강남구", ["위치 설정"])
      );
    }
    try {
      const weather = await getWeather(loc.lat, loc.lon);
      const code = weather.weathercode;
      const condition = WMO_CODE[code] || "알 수 없음";
      const msg =
        `📍 ${loc.name}\n` +
        `🌡 기온: ${weather.temperature_2m}°C\n` +
        `🌤 날씨: ${condition}\n` +
        `💧 습도: ${weather.relativehumidity_2m}%\n` +
        `💨 풍속: ${weather.windspeed_10m} km/h`;
      return res.json(createTextRes(msg, ["오늘 날씨", "위치 변경"]));
    } catch (e) {
      console.error("날씨 API 오류:", e.message);
      return res.json(createTextRes("❌ 날씨 정보를 가져오지 못했습니다."));
    }
  }

  // 기본 안내
  return res.json(
    createTextRes(
      "안녕하세요! 날씨 봇입니다 🌤\n\n'위치 서울' 처럼 지역을 먼저 설정해주세요.",
      ["위치 설정"]
    )
  );
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 서버 실행 중: 포트 ${PORT}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
async function searchLocation(query) {
  try {
    const headers = { Authorization: `KakaoAK ${KAKAO_API_KEY}` };
    
    // API 키 확인용 로그
    console.log("🔑 API Key:", KAKAO_API_KEY ? `설정됨 (${KAKAO_API_KEY.slice(0,4)}...)` : "❌ 없음!");
    
    let res = await axios.get("https://dapi.kakao.com/v2/local/search/keyword.json", {
      params: { query, size: 5 }, headers,
    });
    return res.data.documents;
  } catch (e) {
    // 상세 에러 출력
    console.error("✘ Kakao API Error:", e.response?.status, e.response?.data || e.message);
    return [];
  }
}
