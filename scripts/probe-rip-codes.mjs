const serviceKey = process.env.KHOA_SERVICE_KEY;
if (!serviceKey) throw new Error("KHOA_SERVICE_KEY가 없습니다.");

const candidates = [
  "HAEUNDAE",
  "SONGJUNG",
  "SONGJEONG",
  "GWANGANRI",
  "DADEPO",
  "DADAEPO",
  "SONGDO",
  "DAECHON",
  "JUNGMUN",
  "NAKSAN",
  "SOKCHO",
  "GORAEBUL"
];

for (const beachCode of candidates) {
  const url = new URL("https://apis.data.go.kr/1192136/ripCurrent/GetRipCurrentApiService");
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "3");
  url.searchParams.set("type", "json");
  url.searchParams.set("beachCode", beachCode);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const payload = await response.json();
    const root = payload.response ?? payload;
    const rawItems = root.body?.items?.item;
    const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
    if (items.length) {
      const sample = items[0];
      console.log(`FOUND ${beachCode} ${sample.beachNm ?? sample.staNm ?? sample.obsrvnNm ?? "이름없음"}`);
    }
  } catch {
    // 지원되지 않는 후보 코드는 출력하지 않습니다.
  }
}
