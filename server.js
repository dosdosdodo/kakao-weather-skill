const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const KAKAO_API_KEY = process.env.KAKAO_REST_API_KEY; // Railway Variables 필수

// ── 날씨 API 헬퍼 (WMO 코드 유지) ──────────────────────────────────────────
const WMO_CODE = {
  0: "맑음 ☀️", 1: "대체로 맑음 🌤", 2: "구름 조금 ⛅", 3: "흐림 ☁️",
  45: "안개 🌫", 48: "짙은 안개 🌫",
  51: "가벼운 이슬비 🌦", 53: "이슬비 🌦", 55: "강한 이슬비 🌧",
  61: "약한 비 🌧", 63: "비 🌧", 65: "강한 비 🌧",
  71: "약한 눈 🌨", 73: "눈 🌨", 75: "강한 눈 ❄️",
  80: "소나기 🌦", 81: "강한 소나기 🌧", 82: "폭우 ⛈",
  95: "뇌우 ⛈", 96: "우박 동반 뇌우 ⛈", 99: "강한 우박 ⛈",
};

function wmo(code) {
  return WMO_CODE[code] ?? "알 수 없음";
}

/** 사용자 데이터 저장소 */
const locationStore = new Map(); // userId → { lat, lon, name }
const tempSearchDB = new Map(); // 중복 지역 대기용 { userId: [검색결과리스트] }

function getUserLocation(userId) {
  return locationStore.get(userId) ?? null;
}
function setUserLocation(userId, loc) {
  locationStore.set(userId, loc);
}

/** Open-Meteo로 날씨 조회 */
async function fetchWeather(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max` +
    `&timezone=Asia%2FSeoul&forecast_days=8`;

  const res = await axios.get(url);
  return res.data;
}

/** 카카오 주소 검색 API */
async function searchAddress(query) {
  try {
    const res = await axios.get('https://dapi.kakao.com/v2/local/search/address.json', {
      params: { query },
      headers: { Authorization: `KakaoAK ${KAKAO_API_KEY}` }
    });
    return res.data.documents;
  } catch (e) {
    console.error("주소 검색 오류:", e);
    return [];
  }
}

/** 날짜 → 요일 */
function dayName(dateStr) {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return days[new Date(dateStr).getDay()] + "요일";
}

// ── 카카오 응답 빌더 ───────────────────────────────────────────────────────

function simpleText(text) {
  return {
    version: "2.0",
    template: { outputs: [{ simpleText: { text } }] },
  };
}

function simpleTextWithQuickReplies(text, replies) {
  return {
    version: "2.0",
    template: {
      outputs: [{ simpleText: { text } }],
      quickReplies: replies.map((r) => ({
        label: r,
        action: "message",
        messageText: r,
      })),
    },
  };
}

// ── 핸들러 ────────────────────────────────────────────────────────────────

/** 위치 설정 (번호 선택 로직 포함) */
async function handleSetLocation(req, res) {
  const body = req.body;
  const userId = body.userRequest?.user?.id ?? "anonymous";
  const utterance = (body.userRequest?.utterance ?? "").trim();
  const params = body.action?.params ?? {};

  // 1. 번호 선택 처리
  if (/^\d+$/.test(utterance) && tempSearchDB.has(userId)) {
    const list = tempSearchDB.get(userId);
    const index = parseInt(utterance) - 1;

    if (list[index]) {
      const sel = list[index];
      setUserLocation(userId, {
        lat: sel.y,
        lon: sel.x,
        name: sel.address_name,
      });
      tempSearchDB.delete(userId);
      return res.json(
        simpleTextWithQuickReplies(
          `✅ [${index + 1}번] 선택 완료!\n📍 위치가 "${sel.address_name}"(으)로 설정됐어요!\n이제 날씨를 조회해 보세요 🌤`,
          ["오늘 날씨", "내일 날씨", "이번주 날씨", "도움말"]
        )
      );
    }
  }

  // 2. 검색 처리
  const query = utterance.replace("위치", "").trim();
  if (!query || query === "설정") {
    return res.json(simpleText("검색할 지역명을 입력해주세요.\n예) 위치 중앙동, 위치 역삼동"));
  }

  const results = await searchAddress(query);

  if (results.length === 0) {
    return res.json(simpleText("검색 결과가 없습니다. 정확한 구나 동 이름을 입력해주세요."));
  }

  if (results.length > 1) {
    tempSearchDB.set(userId, results);
    let msg = `📖검색 결과가 ${results.length}개 있습니다.\n원하시는 지역의 번호를 입력해주세요:\n\n`;
    results.forEach((loc, i) => {
      const addr = loc.address || loc.road_address;
      const region = `${addr.region_1depth_name} ${addr.region_2depth_name}`;
      msg += `${i + 1}. ${loc.address_name} (${region})\n`;
    });
    return res.json(simpleText(msg));
  }

  // 단일 결과
  const loc = results[0];
  setUserLocation(userId, { lat: loc.y, lon: loc.x, name: loc.address_name });
  return res.json(
    simpleTextWithQuickReplies(
      `✔️위치가 "${loc.address_name}"(으)로 설정됐어요!`,
      ["오늘 날씨", "내일 날씨", "이번주 날씨"]
    )
  );
}

/** 오늘 날씨 */
async function handleToday(req, res) {
  const userId = req.body.userRequest?.user?.id ?? "anonymous";
  const loc = getUserLocation(userId);
  if (!loc) {
    return res.json(simpleTextWithQuickReplies("❕먼저 위치를 설정해 주세요!", ["위치 설정"]));
  }

  try {
    const data = await fetchWeather(loc.lat, loc.lon);
    const d = data.daily;
    const i = 0;
    const text =
      `📍 ${loc.name} 오늘 날씨\n` +
      `📅 ${d.time[i]} (${dayName(d.time[i])})\n\n` +
      `🌤 날씨: ${wmo(d.weathercode[i])}\n` +
      `🌡 최고 ${d.temperature_2m_max[i]}°C / 최저 ${d.temperature_2m_min[i]}°C\n` +
      `🌧 강수량: ${d.precipitation_sum[i]}mm\n` +
      `💨 최대 풍속: ${d.windspeed_10m_max[i]}km/h`;

    return res.json(simpleTextWithQuickReplies(text, ["내일 날씨", "이번주 날씨", "위치 설정"]));
  } catch (e) {
    return res.json(simpleText("✖️날씨 정보를 가져오지 못했어요."));
  }
}

/** 내일 날씨 */
async function handleTomorrow(req, res) {
  const userId = req.body.userRequest?.user?.id ?? "anonymous";
  const loc = getUserLocation(userId);
  if (!loc) {
    return res.json(simpleTextWithQuickReplies("❕먼저 위치를 설정해 주세요!", ["위치 설정"]));
  }

  try {
    const data = await fetchWeather(loc.lat, loc.lon);
    const d = data.daily;
    const i = 1;
    const text =
      `📍 ${loc.name} 내일 날씨\n` +
      `📅 ${d.time[i]} (${dayName(d.time[i])})\n\n` +
      `🌤 날씨: ${wmo(d.weathercode[i])}\n` +
      `🌡 최고 ${d.temperature_2m_max[i]}°C / 최저 ${d.temperature_2m_min[i]}°C\n` +
      `🌧 강수량: ${d.precipitation_sum[i]}mm\n` +
      `💨 최대 풍속: ${d.windspeed_10m_max[i]}km/h`;

    return res.json(simpleTextWithQuickReplies(text, ["오늘 날씨", "이번주 날씨", "위치 설정"]));
  } catch (e) {
    return res.json(simpleText("✖️날씨 정보를 가져오지 못했어요."));
  }
}

/** 이번 주 날씨 */
async function handleWeek(req, res) {
  const userId = req.body.userRequest?.user?.id ?? "anonymous";
  const loc = getUserLocation(userId);
  if (!loc) {
    return res.json(simpleTextWithQuickReplies("📍 먼저 위치를 설정해 주세요!", ["위치 설정"]));
  }

  try {
    const data = await fetchWeather(loc.lat, loc.lon);
    const d = data.daily;
    const items = d.time.slice(0, 7).map((date, i) => ({
      title: `${date} (${dayName(date)})`,
      description: `${wmo(d.weathercode[i])}\n🌡 ${d.temperature_2m_min[i]}°C ~ ${d.temperature_2m_max[i]}°C\n🌧 강수 ${d.precipitation_sum[i]}mm`,
    }));

    return res.json({
      version: "2.0",
      template: {
        outputs: [{ carousel: { type: "basicCard", items } }],
        quickReplies: [
          { label: "오늘 날씨", action: "message", messageText: "오늘 날씨" },
          { label: "내일 날씨", action: "message", messageText: "내일 날씨" },
          { label: "위치 설정", action: "message", messageText: "위치 설정" },
        ],
      },
    });
  } catch (e) {
    return res.json(simpleText("✖️날씨 정보를 가져오지 못했어요."));
  }
}

/** 도움말 */
function handleHelp(req, res) {
  const text = `☁️ 날씨 챗봇 도움말\n\n 위치 설정: '위치 동이름' 입력\n예) 위치 중앙동\n번호가 나오면 숫자를 입력해 선택하세요!`;
  return res.json(simpleTextWithQuickReplies(text, ["위치 설정", "오늘 날씨", "내일 날씨", "이번주 날씨"]));
}

// ── 라우팅 및 단일 엔드포인트 통합 ─────────────────────────────────────────

app.post("/skill", async (req, res) => {
  const utterance = (req.body.userRequest?.utterance ?? "").trim();
  
  // 위치 설정(번호 입력 포함) 우선 처리
  if (utterance.startsWith("위치") || /^\d+$/.test(utterance) || utterance === "위치 설정") {
    return await handleSetLocation(req, res);
  }
  
  if (utterance.includes("오늘 날씨")) return await handleToday(req, res);
  if (utterance.includes("내일 날씨")) return await handleTomorrow(req, res);
  if (utterance.includes("이번주 날씨")) return await handleWeek(req, res);
  
  return handleHelp(req, res);
});

app.listen(PORT, () => console.log(`✔️ 서버 실행 중: 포트 ${PORT}`));
