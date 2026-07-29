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
  TW_0088: "감천항 관측부이"
};

const beachStations = [
  { name: "해운대해수욕장", stationCode: "TW_0062", stationName: "해운대해수욕장 관측부이" },
  { name: "송정해수욕장", stationCode: "TW_0090", stationName: "송정해수욕장 관측부이" },
  { name: "광안리해수욕장", stationCode: "TW_0062", stationName: "인근 해운대 관측부이" },
  { name: "다대포해수욕장", stationCode: "TW_0088", stationName: "인근 감천항 관측부이" },
  { name: "송도해수욕장", stationCode: "TW_0088", stationName: "인근 감천항 관측부이" }
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

const stationResults = {};
const failures = [];

await Promise.all(
  Object.keys(stationDefinitions).map(async (stationCode) => {
    try {
      stationResults[stationCode] = await fetchStation(stationCode);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  })
);

if (!Object.keys(stationResults).length) {
  throw new Error(`실시간 관측값을 가져오지 못했습니다. ${failures.join(" / ")}`);
}

const beaches = beachStations.flatMap((beach) => {
  const observation = stationResults[beach.stationCode];
  if (!observation) return [];

  return [{
    ...beach,
    observedAt: observation.obsrvnDt ?? null,
    wave: numberOrNull(observation.wvhgt),
    wind: numberOrNull(observation.wspd),
    directionDegrees: numberOrNull(observation.wndrct),
    direction: directionLabel(observation.wndrct),
    temp: numberOrNull(observation.wtem)
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
