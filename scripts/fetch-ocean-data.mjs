import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const serviceKey = process.env.KHOA_SERVICE_KEY;
if (!serviceKey) {
  throw new Error("KHOA_SERVICE_KEY가 설정되지 않았습니다.");
}

const stationDefinitions = {
  TW_0062: "해운대해수욕장 관측부이",
  TW_0090: "송정해수욕장 관측부이",
  TW_0092: "임랑해수욕장 관측부이",
  TW_0088: "감천항 관측부이"
};

const beachStations = [
  { name: "해운대해수욕장", stationCode: "TW_0062", stationName: "해운대해수욕장 관측부이", ripCode: "HAE", latitude: 35.1587, longitude: 129.1604 },
  { name: "송정해수욕장", stationCode: "TW_0090", stationName: "송정해수욕장 관측부이", ripCode: "SONGJUNG", latitude: 35.1785, longitude: 129.1997 },
  { name: "광안리해수욕장", stationCode: "TW_0062", stationName: "인근 해운대 관측부이", ripCode: null, latitude: 35.1532, longitude: 129.1187 },
  { name: "다대포해수욕장", stationCode: "TW_0088", stationName: "인근 감천항 관측부이", ripCode: null, latitude: 35.0462, longitude: 128.9667 },
  { name: "송도해수욕장", stationCode: "TW_0088", stationName: "인근 감천항 관측부이", ripCode: null, latitude: 35.075, longitude: 129.0178 },
  { name: "일광해수욕장", stationCode: "TW_0092", stationName: "인근 임랑해수욕장 관측부이", ripCode: null, latitude: 35.2594, longitude: 129.2339 },
  { name: "임랑해수욕장", stationCode: "TW_0092", stationName: "임랑해수욕장 관측부이", ripCode: "IMRANG", latitude: 35.3185, longitude: 129.2643 }
];

const numberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const directionLabel = (degrees) => {
  const value = numberOrNull(degrees);
  if (value === null) return null;
  const labels = ["북풍", "북동풍", "동풍", "남동풍", "남풍", "남서풍", "서풍", "북서풍"];
  return labels[Math.round(((value % 360) + 360) % 360 / 45) % 8];
};

const weatherLabel = (code) => {
  const value = numberOrNull(code);
  if (value === 0) return "맑음";
  if ([1, 2].includes(value)) return "구름 조금";
  if (value === 3) return "흐림";
  if ([45, 48].includes(value)) return "안개";
  if ([51, 53, 55, 56, 57].includes(value)) return "이슬비";
  if ([61, 63, 65, 66, 67].includes(value)) return "비";
  if ([71, 73, 75, 77].includes(value)) return "눈";
  if ([80, 81, 82].includes(value)) return "소나기";
  if ([85, 86].includes(value)) return "눈 소나기";
  if ([95, 96, 99].includes(value)) return "뇌우";
  return "날씨 확인 중";
};

async function fetchWeather(beach) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(beach.latitude));
  url.searchParams.set("longitude", String(beach.longitude));
  url.searchParams.set("current", "temperature_2m,apparent_temperature,precipitation,weather_code");
  url.searchParams.set("timezone", "Asia/Seoul");

  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${beach.name} 날씨 요청 실패: HTTP ${response.status}`);
  const payload = await response.json();
  const current = payload.current;
  if (!current) throw new Error(`${beach.name} 현재 날씨가 없습니다.`);

  const weatherCode = numberOrNull(current.weather_code);
  return {
    observedAt: current.time ?? null,
    condition: weatherLabel(weatherCode),
    weatherCode,
    airTemp: numberOrNull(current.temperature_2m),
    feelsLike: numberOrNull(current.apparent_temperature),
    precipitation: numberOrNull(current.precipitation)
  };
}

async function fetchStation(stationCode) {
  const url = new URL("https://apis.data.go.kr/1192136/twRecent/GetTWRecentApiService");
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "20");
  url.searchParams.set("type", "json");
  url.searchParams.set("obsCode", stationCode);
  url.searchParams.set("min", "60");

  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    throw new Error(`${stationCode} 관측 요청 실패: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const root = payload.response ?? payload;
  const resultCode = String(root.header?.resultCode ?? "");
  if (!["0", "00", "0000"].includes(resultCode)) {
    throw new Error(`${stationCode} 관측 요청 실패: ${root.header?.resultMsg ?? resultCode}`);
  }

  const rawItems = root.body?.items?.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  if (!items.length) {
    throw new Error(`${stationCode}의 최신 관측값이 없습니다.`);
  }

  return items
    .filter(Boolean)
    .sort((a, b) => String(b.obsrvnDt ?? "").localeCompare(String(a.obsrvnDt ?? "")))[0];
}

const requestDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date()).replaceAll("-", "");

async function fetchRipCurrent(beachCode) {
  const url = new URL("https://apis.data.go.kr/1192136/ripCurrent/GetRipCurrentApiService");
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "300");
  url.searchParams.set("type", "json");
  url.searchParams.set("beachCode", beachCode);
  url.searchParams.set("reqDate", requestDate);

  const response = await fetch(url, { signal: AbortSignal.timeout(40000) });
  if (!response.ok) {
    throw new Error(`${beachCode} 이안류 요청 실패: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const root = payload.response ?? payload;
  const resultCode = String(root.header?.resultCode ?? "");
  if (!["0", "00", "0000"].includes(resultCode)) {
    throw new Error(`${beachCode} 이안류 요청 실패: ${root.header?.resultMsg ?? resultCode}`);
  }

  const rawItems = root.body?.items?.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  if (!items.length) {
    throw new Error(`${beachCode}의 오늘 이안류 지수가 없습니다.`);
  }

  return items
    .filter(Boolean)
    .sort((a, b) => String(b.obsrvnDt ?? "").localeCompare(String(a.obsrvnDt ?? "")))[0];
}

const stationResults = {};
const ripResults = {};
const weatherResults = {};
const failures = [];

await Promise.all(
  [
    ...Object.keys(stationDefinitions).map(async (stationCode) => {
      try {
        stationResults[stationCode] = await fetchStation(stationCode);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }),
    ...beachStations.filter((beach) => beach.ripCode).map(async (beach) => {
      try {
        ripResults[beach.ripCode] = await fetchRipCurrent(beach.ripCode);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }),
    ...beachStations.map(async (beach) => {
      try {
        weatherResults[beach.name] = await fetchWeather(beach);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    })
  ]
);

if (!Object.keys(stationResults).length) {
  throw new Error(`실시간 관측값을 가져오지 못했습니다. ${failures.join(" / ")}`);
}

const beaches = beachStations.flatMap((beach) => {
  const observation = stationResults[beach.stationCode];
  if (!observation) return [];
  const ripObservation = beach.ripCode ? ripResults[beach.ripCode] : null;

  return [{
    ...beach,
    observedAt: observation.obsrvnDt ?? null,
    wave: numberOrNull(observation.wvhgt),
    wind: numberOrNull(observation.wspd),
    directionDegrees: numberOrNull(observation.wndrct),
    direction: directionLabel(observation.wndrct),
    temp: numberOrNull(observation.wtem),
    ripAvailable: Boolean(ripObservation),
    rip: ripObservation?.lastScrCn ?? "공식 미제공",
    ripScore: numberOrNull(ripObservation?.lastScr),
    ripObservedAt: ripObservation?.obsrvnDt ?? null,
    ripStationName: ripObservation?.obsvtrNm ?? null,
    weather: weatherResults[beach.name] ?? null
  }];
});

const output = {
  schemaVersion: 1,
  isLive: true,
  fetchedAt: new Date().toISOString(),
  source: {
    name: "국립해양조사원 해양관측부이 최신 관측데이터",
    url: "https://www.data.go.kr/data/15155516/openapi.do"
  },
  ripSource: {
    name: "국립해양조사원 이안류 지수 조회",
    url: "https://www.data.go.kr/data/15156028/openapi.do",
    supportedBeaches: ["해운대해수욕장", "송정해수욕장", "임랑해수욕장"]
  },
  weatherSource: {
    name: "Open-Meteo Weather Forecast API",
    url: "https://open-meteo.com/en/docs"
  },
  beaches
};

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(projectRoot, "data", "ocean.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

console.log(`실시간 관측자료 ${beaches.length}개 해수욕장 갱신 완료`);
if (failures.length) {
  console.warn(`일부 관측소 갱신 실패: ${failures.join(" / ")}`);
}
