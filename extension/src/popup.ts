import type { ServerResponse, ScrapedData } from "./types.js";
function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}
async function load(): Promise<void> {
  const { serverUrl = "http://localhost:3000", authToken = "" } = (await chrome.storage.sync.get(["serverUrl", "authToken"])) as {
    serverUrl?: string;
    authToken?: string;
  };
  ($("serverUrl") as HTMLInputElement).value = serverUrl;
  ($("authToken") as HTMLInputElement).value = authToken;
  const { lastResult, lastError, lastScrape } = (await chrome.storage.local.get(["lastResult", "lastError", "lastScrape"])) as {
    lastResult?: ServerResponse;
    lastError?: string;
    lastScrape?: ScrapedData;
  };
  if (lastResult?.icalUrl) {
    showResult(lastResult, lastScrape ?? null);
    $("status").textContent = `Last scrape: ${lastScrape?.events?.length ?? "?"} events`;
    $("status").className = "card ok";
  } else if (lastError) {
    $("status").textContent = "Last error: " + lastError.slice(0, 300);
    $("status").className = "card err";
    if (lastScrape) $("status").textContent += ` (${lastScrape.events?.length ?? 0} events scraped)`;
  } else {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url?.includes("/ProPortal/pages/ilp/prosolution/26_1/pstimetable.aspx")) {
      $("status").textContent = "On timetable page — click Scrape & send now";
    }
  }
}
function showResult(json: ServerResponse, scrape: ScrapedData | null): void {
  const el = $("result");
  el.style.display = "block";
  const count = scrape?.events?.length ?? json.eventCount ?? "?";
  el.innerHTML = `
    <div class="ok" style="font-weight:700;margin-bottom:6px">✓ Sent ${count} events</div>
    <div style="font-size:12px;word-break:break-all;margin-bottom:8px"><a href="${escapeAttr(json.icalUrl)}" target="_blank">${escapeHtml(json.icalUrl)}</a></div>
    <div class="row">
      <button id="copy" class="secondary">Copy iCal URL</button>
      <button id="open" class="secondary">Open .ics</button>
    </div>
    <div class="muted" style="margin-top:8px;font-size:11px">webcal: <a href="${escapeAttr(json.webcalUrl)}" target="_blank">${escapeHtml(json.webcalUrl)}</a></div>
  `;
  const copyBtn = document.getElementById("copy") as HTMLButtonElement | null;
  if (copyBtn) {
    copyBtn.onclick = async () => {
      await navigator.clipboard.writeText(json.icalUrl);
      copyBtn.textContent = "Copied!";
      setTimeout(() => {
        copyBtn.textContent = "Copy iCal URL";
      }, 1200);
    };
  }
  const openBtn = document.getElementById("open") as HTMLButtonElement | null;
  if (openBtn) openBtn.onclick = () => void chrome.tabs.create({ url: json.icalUrl });
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    if (c === "&") return "&amp;";
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    if (c === '"') return "&quot;";
    return "&#39;";
  });
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}
($("save") as HTMLButtonElement).onclick = async () => {
  const v = (($("serverUrl") as HTMLInputElement).value.trim().replace(/\/$/, "")) || "http://localhost:3000";
  const tok = ($("authToken") as HTMLInputElement).value.trim();
  await chrome.storage.sync.set({ serverUrl: v, authToken: tok });
  $("saveStatus").textContent = "saved";
  setTimeout(() => {
    $("saveStatus").textContent = "";
  }, 1500);
};
($("scrape") as HTMLButtonElement).onclick = async () => {
  $("status").textContent = "Scraping…";
  $("status").className = "card muted";
  $("result").style.display = "none";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    $("status").textContent = "No active tab";
    return;
  }
  if (!tab.url?.includes("/ProPortal/pages/ilp/prosolution/26_1/pstimetable.aspx")) {
    $("status").textContent = "Not on timetable page. Open /ProPortal/pages/ilp/prosolution/26_1/pstimetable.aspx first.";
    $("status").className = "card err";
    return;
  }
  const { authToken } = (await chrome.storage.sync.get("authToken")) as { authToken?: string };
  if (!authToken) {
    $("status").textContent = "Missing auth token — set RANDOM_IDENTIFER from server and Save first.";
    $("status").className = "card err";
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: "PROP2ICAL_SCRAPE_NOW" }, async () => {
    if (chrome.runtime.lastError) {
      $("status").textContent = "Content script not ready — reload the page and try again. (" + (chrome.runtime.lastError.message ?? "") + ")";
      $("status").className = "card err";
      return;
    }
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const { lastResult, lastError } = (await chrome.storage.local.get(["lastResult", "lastError"])) as {
        lastResult?: ServerResponse;
        lastError?: string;
      };
      if (lastResult?.icalUrl) {
        const { lastScrape } = (await chrome.storage.local.get("lastScrape")) as { lastScrape?: ScrapedData };
        $("status").textContent = "Done!";
        $("status").className = "card ok";
        showResult(lastResult, lastScrape ?? null);
        return;
      }
      if (lastError) {
        $("status").textContent = "Error: " + String(lastError).slice(0, 400);
        $("status").className = "card err";
        return;
      }
    }
    $("status").textContent = "Scrape sent — check page banner or try again.";
  });
};
($("openOptions") as HTMLAnchorElement).onclick = (e) => {
  e.preventDefault();
  void chrome.runtime.openOptionsPage();
};
void load();
chrome.runtime.onMessage.addListener((msg: { type: string; payload?: ServerResponse; error?: string }) => {
  if (msg?.type === "PROP2ICAL_RESULT" && msg.payload) showResult(msg.payload, null);
  if (msg?.type === "PROP2ICAL_ERROR" && msg.error) {
    $("status").textContent = "Error: " + msg.error.slice(0, 300);
    $("status").className = "card err";
  }
});
