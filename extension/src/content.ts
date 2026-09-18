import type { ScrapedData, ServerResponse, TimetableEvent } from "./types.js";
console.log("[prop2ical] content.ts loaded on", location.href);
if (!location.pathname.includes("/ProPortal/pages/ilp/prosolution/26_1/pstimetable.aspx") && !location.href.includes("/ProPortal/pages/ilp/prosolution/26_1/pstimetable.aspx")) {
  console.log("[prop2ical] URL does not match, exiting");
} else {
  init();
}
function parseHeaderToISO(text: string): string | null {
  const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  let [, d, mo, y] = m;
  d = d.padStart(2, "0");
  mo = mo.padStart(2, "0");
  if (y.length === 2) y = "20" + y;
  return `${y}-${mo}-${d}`;
}
function extractTable(): ScrapedData | null {
  const table = (document.getElementById("Content_Content_Content_MainContent_timetable1_tbltimetable") as HTMLTableElement | null) ?? document.querySelector<HTMLTableElement>("table.timetable");
  if (!table) {
    console.warn("[prop2ical] table not found", "Content_Content_Content_MainContent_timetable1_tbltimetable");
    return null;
  }
  const dateHeaders = Array.from(table.querySelectorAll("th.date")) as HTMLTableCellElement[];
  const dates = dateHeaders.map((th) => {
    const raw = th.textContent?.trim() ?? "";
    return { raw, iso: parseHeaderToISO(raw) ?? raw };
  });
  console.log("[prop2ical] dates:", dates);
  if (dates.length === 0) return null;
  const rows = Array.from(table.querySelectorAll("tr")) as HTMLTableRowElement[];
  const events: TimetableEvent[] = [];
  const seen = new Set<string>();
  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const tds = Array.from(row.querySelectorAll("td")) as HTMLTableCellElement[];
    if (tds.length === 0) continue;
    const hasHourCell = row.querySelector("td.time.hour") !== null || tds.length === 7;
    const dayOffset = hasHourCell ? 2 : 1;
    tds.forEach((td, colIdx) => {
      const isActivity = td.classList.contains("activity") || td.querySelector("div.activity") !== null;
      if (!isActivity) return;
      const descEl = td.querySelector("div.activitydescription") as HTMLDivElement | null;
      let text = descEl ? (descEl.textContent?.trim() ?? "") : (td.textContent?.trim() ?? "");
      if (!text) return;
      const timeMatch = text.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
      if (!timeMatch) return;
      const start = timeMatch[1].padStart(5, "0");
      const end = timeMatch[2].padStart(5, "0");
      const lines: string[] = text.split("\n").map((s: string) => s.trim()).filter(Boolean);
      let title = "";
      if (lines.length > 0) {
        title = lines[0].replace(timeMatch[0], "").trim() || "Lesson";
      }
      let staff = "";
      let room = "";
      for (const line of lines.slice(1)) {
        if (line.toLowerCase().startsWith("staff:")) {
          staff = line.replace(/staff:/i, "").trim();
        } else if (line) {
          room = room ? room + " " + line : line;
        }
      }
      const tip = td.querySelector("span.activitytooltip") as HTMLSpanElement | null;
      if (tip && (!staff || !room)) {
        const tipText = tip.textContent ?? "";
        const sm = tipText.match(/Staff:\s*([^\n]+)/i);
        if (sm && !staff) staff = sm[1].trim();
      }
      const cell = td.querySelector("div.activity.cell") as HTMLDivElement | null;
      let color: string | null = null;
      if (cell) {
        const style = cell.getAttribute("style") ?? "";
        const cm = style.match(/border-left:[^;]*?(#[0-9a-fA-F]{3,6}|rgb\([^)]+\))/);
        if (cm) color = cm[1];
      }
      const dayIndex = colIdx - dayOffset;
      if (dayIndex < 0 || dayIndex >= dates.length) return;
      const dateInfo = dates[dayIndex];
      if (!dateInfo?.iso) return;
      const key = `${dateInfo.iso}-${start}-${end}-${title}-${room}`;
      if (seen.has(key)) return;
      seen.add(key);
      events.push({
        title,
        staff,
        room,
        date: dateInfo.iso,
        start,
        end,
        raw: text,
        color,
        dateHeader: dateInfo.raw,
      });
    });
  }
  return {
    dates: dates.map((d) => d.iso),
    dateHeaders: dates.map((d) => d.raw),
    events,
    scrapedAt: new Date().toISOString(),
    sourceUrl: location.href,
  };
}
async function sendToServer(data: ScrapedData): Promise<ServerResponse> {
  const { serverUrl = "http://localhost:3000", authToken = "" } = (await chrome.storage.sync.get(["serverUrl", "authToken"])) as {
    serverUrl?: string;
    authToken?: string;
  };
  const endpoint = serverUrl.replace(/\/$/, "") + "/api/timetable";
  if (!authToken) {
    const msg = "Missing auth token — set RANDOM_IDENTIFER in extension popup/options (same as server) and save.";
    console.warn("[prop2ical]", msg);
    await chrome.storage.local.set({ lastError: msg, lastScrape: data });
    void chrome.runtime.sendMessage({ type: "PROP2ICAL_ERROR", error: msg }).catch(() => {});
    throw new Error(msg);
  }
  console.log("[prop2ical] sending", data.events.length, "events to", endpoint);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
        "X-Auth-Token": authToken,
      },
      body: JSON.stringify({
        dates: data.dates,
        events: data.events.map(({ title, staff, room, date, start, end, raw, color }) => ({
          title,
          staff,
          room,
          date,
          start,
          end,
          raw,
          color,
        })),
        scrapedAt: data.scrapedAt,
        sourceUrl: data.sourceUrl,
      }),
    });
    const json = (await res.json()) as ServerResponse & { error?: string };
    if (!res.ok) throw new Error((json as unknown as { error?: string }).error ?? `HTTP ${res.status}`);
    console.log("[prop2ical] server response", json);
    await chrome.storage.local.set({ lastResult: json, lastScrape: data });
    void chrome.runtime.sendMessage({ type: "PROP2ICAL_RESULT", payload: json }).catch(() => {});
    void chrome.runtime.sendMessage({ type: "PROP2ICAL_SCRAPED", count: data.events.length }).catch(() => {});
    return json;
  } catch (e) {
    const msg = String(e);
    console.error("[prop2ical] send failed", e);
    await chrome.storage.local.set({ lastError: msg, lastScrape: data });
    void chrome.runtime.sendMessage({ type: "PROP2ICAL_ERROR", error: msg }).catch(() => {});
    throw e;
  }
}
async function run(auto = true): Promise<void> {
  const data = extractTable();
  if (!data) {
    console.warn("[prop2ical] no data extracted");
    if (!auto) alert("prop2ical: could not find timetable table on this page.");
    return;
  }
  if (data.events.length === 0) {
    console.warn("[prop2ical] 0 events found");
    if (!auto) console.warn("[prop2ical] No events found in table — is the week empty?");
    return;
  }
  try {
    await sendToServer(data);
  } catch {}
}
function init(): void {
  let attempts = 0;
  const interval = window.setInterval(() => {
    attempts++;
    const table = (document.getElementById("Content_Content_Content_MainContent_timetable1_tbltimetable") as HTMLTableElement | null) ?? document.querySelector<HTMLTableElement>("table.timetable");
    if (table?.querySelector("th.date")) {
      clearInterval(interval);
      console.log("[prop2ical] table detected, scraping in 800ms");
      setTimeout(() => void run(true), 800);
    }
    if (attempts > 30) clearInterval(interval);
  }, 500);
  chrome.runtime.onMessage.addListener(
    (
      msg: { type: string; [k: string]: unknown },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (r: unknown) => void,
    ) => {
      if (msg?.type === "PROP2ICAL_SCRAPE_NOW") {
        void run(false)
          .then(() => sendResponse({ ok: true }))
          .catch((e: unknown) => sendResponse({ ok: false, error: String(e) }));
        return true;
      }
      if (msg?.type === "PROP2ICAL_GET_DATA") {
        const data = extractTable();
        sendResponse(data);
        return;
      }
      return undefined;
    },
  );
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (location.href.includes("/ProPortal/pages/ilp/prosolution/26_1/pstimetable.aspx")) setTimeout(() => void run(true), 1000);
    }
  }).observe(document, { subtree: true, childList: true });
}
