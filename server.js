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
      params: { query, size: 10 }, headers,
    });
    if (res.data.documents.length === 0) {
      res = await axios.get("https://dapi.kakao.com/v2/local/search/address.json", {
        params: { query, size: 10 }, headers,
      });
    }
    return res.data.documents;
  } catch (e) {
    console.error("✘ Kakao API Error:", e.response?.status, e.response?.data || e.message);
    return [];
  }
}

async function getWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode,windspeed_10m,relativehumidity_2m&timezone=Asia%2FSeoul`;
  const res = await axios.get(url);
  return res.data.current;
}

function formatAddress(doc) {
  const addr = doc.road_address_name || doc.address_name || "";
  const parts = addr.split(" ");
  const gu = parts.find(p =>
    p.endsWith("구") || p.endsWith("군")
  ) || "";
  const dong = parts.find(p =>
    p.endsWith("동") || p.endsWith("읍") || p.endsWith("면") ||
    p.endsWith("로") || p.endsWith("길")
  ) || "";
  // 구/동 둘 다 있으면 "방이동 · 송파구", 아니면 앞 2~3단어
  if (dong && gu) return `${dong} · ${gu}`;
  if (gu) return parts.slice(1, 3).join(" ");
  return parts.slice(1, 3).join(" ");
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
  const userId = req.body.
