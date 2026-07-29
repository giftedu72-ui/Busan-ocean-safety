const serviceKey = process.env.KHOA_SERVICE_KEY;
if (!serviceKey) throw new Error("KHOA_SERVICE_KEY가 없습니다.");

const candidates = [
  "HAEUNDAE", "Haeundae", "haeundae", "HAEUN", "HAE",
  "SONGJUNG", "Songjung", "songjung",
  "SONGJEONG", "Songjeong", "songjeong", "SONGJUNG_B",
  "IMNANG", "Imnang", "imnang",
  "GYEONGPO", "NAKSAN", "SOKCHO", "MANGSANG",
  "DAECHON", "JUNGMUN", "GORAEBUL"
];
const requestDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date()).replaceAll("-", "");

for (const beachCode of candidates) {
  const url = new URL("https://apis.data.go.kr/1192136/ripCurrent/GetRipCurrentApiService");
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "3");
  url.searchParams.set("type", "json");
  url.searchParams.set("beachCode", beachCode);
  url.searchParams.set("reqDate", requestDate);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(40000) });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      console.log("RESULT", beachCode, JSON.stringify({
        status: response.status,
        format: "non-json",
        length: text.length
      }));
      continue;
    }

    const root = payload.response ?? payload;
    const rawItems = root.body?.items?.item;
    const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
    const sample = items[0] ?? null;
    console.log("RESULT", beachCode, JSON.stringify({
      status: response.status,
      resultCode: root.header?.resultCode ?? null,
      resultMsg: root.header?.resultMsg ?? null,
      totalCount: root.body?.totalCount ?? null,
      itemKeys: sample ? Object.keys(sample) : []
    }));
    if (sample) console.log("FOUND", beachCode, sample.obsvtrNm, sample.lastScrCn);
  } catch (error) {
    console.log("ERROR", beachCode, error instanceof Error ? error.name : "UnknownError");
  }
}
