const express = require("express");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ── 날씨 API 헬퍼 (Open-Meteo, 무료·키 불필요) ──────────────────────────
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

/** 사용자 세션에 위치 저장 */
const locationStore = new Map(); // userId → { lat, lon, name }

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

  const res = await fetch(url);
  if (!res.ok) throw new Error("날씨 API 오류");
  return res.json();
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

/** 위치 설정 */
async function handleSetLocation(req, res) {
  const body = req.body;
  const userId = body.userRequest?.user?.id ?? "anonymous";
  const params = body.action?.params ?? {};

  let locationParam = params.location;
  if (typeof locationParam === "string") {
    try {
      locationParam = JSON.parse(locationParam);
    } catch {
      locationParam = null;
    }
  }

  if (!locationParam || !locationParam.lat || !locationParam.lon) {
    return res.json(
      simpleTextWithQuickReplies(
        "📍 위치를 인식하지 못했어요.\n지역명을 다시 입력해 주세요.\n예) 서울, 부산, 제주",
        ["오늘 날씨", "내일 날씨", "도움말"]
      )
    );
  }

  const loc = {
    lat: locationParam.lat,
    lon: locationParam.lon,
    name: locationParam.name ?? "설정된 위치",
  };
  setUserLocation(userId, loc);

  return res.json(
    simpleTextWithQuickReplies(
      `📍 위치가 "${loc.name}"(으)로 설정됐어요!\n이제 날씨를 조회해 보세요 🌤`,
      ["오늘 날씨", "내일 날씨", "이번주 날씨", "도움말"]
    )
  );
}

/** 오늘 날씨 */
async function handleToday(req, res) {
  const userId = req.body.userRequest?.user?.id ?? "anonymous";
  const loc = getUserLocation(userId);
  if (!loc) {
    return res.json(simpleTextWithQuickReplies("📍 먼저 위치를 설정해 주세요!", ["위치 설정"]));
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
    return res.json(simpleText("날씨 정보를 가져오지 못했어요."));
  }
}

/** 내일 날씨 */
async function handleTomorrow(req, res) {
  const userId = req.body.userRequest?.user?.id ?? "anonymous";
  const loc = getUserLocation(userId);
  if (!loc) {
    return res.json(simpleTextWithQuickReplies("📍 먼저 위치를 설정해 주세요!", ["위치 설정"]));
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
    return res.json(simpleText("날씨 정보를 가져오지 못했어요."));
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
    return res.json(simpleText("날씨 정보를 가져오지 못했어요."));
  }
}

/** 도움말 */
function handleHelp(req, res) {
  const text = `🌤 날씨 챗봇 도움말\n\n📍 위치 설정\n오늘/내일/이번주 날씨 조회가 가능합니다.`;
  return res.json(simpleTextWithQuickReplies(text, ["위치 설정", "오늘 날씨", "내일 날씨", "이번주 날씨"]));
}

// ── 라우팅 ────────────────────────────────────────────────────────────────

app.post("/skill/set-location", handleSetLocation);
app.post("/skill/today", handleToday);
app.post("/skill/tomorrow", handleTomorrow);
app.post("/skill/week", handleWeek);
app.post("/skill/help", handleHelp);

// 단일 엔드포인트 통합 처리
app.post("/skill", (req, res) => {
  const utterance = (req.body.userRequest?.utterance ?? "").trim();
  if (utterance.includes("위치 설정")) return handleSetLocation(req, res);
  if (utterance.includes("오늘 날씨")) return handleToday(req, res);
  if (utterance.includes("내일 날씨")) return handleTomorrow(req, res);
  if (utterance.includes("이번주 날씨")) return handleWeek(req, res);
  return handleHelp(req, res);
});

app.listen(PORT, () => console.log(`✅ 서버 실행 중: 포트 ${PORT}`));
