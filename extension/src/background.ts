type RuntimeMsg =
  | { type: "PROP2ICAL_SCRAPED"; count: number }
  | { type: "PROP2ICAL_RESULT" }
  | { type: "PROP2ICAL_ERROR" }
  | { type: string; [k: string]: unknown };
chrome.runtime.onMessage.addListener((msg: RuntimeMsg) => {
  if (msg?.type === "PROP2ICAL_SCRAPED") {
    void chrome.action.setBadgeText({ text: String(msg.count) });
    void chrome.action.setBadgeBackgroundColor({ color: "#4ade80" });
    setTimeout(() => void chrome.action.setBadgeText({ text: "" }), 8000);
  }
  if (msg?.type === "PROP2ICAL_RESULT") {
    void chrome.action.setBadgeText({ text: "✓" });
    void chrome.action.setBadgeBackgroundColor({ color: "#60a5fa" });
  }
  if (msg?.type === "PROP2ICAL_ERROR") {
    void chrome.action.setBadgeText({ text: "!" });
    void chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
  }
});
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && !tab.url.includes("/ProPortal/pages/ilp/prosolution/26_1/pstimetable.aspx")) {
  }
});
export {};
