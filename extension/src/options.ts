const urlInput = document.getElementById("serverUrl") as HTMLInputElement | null;
const tokenInput = document.getElementById("authToken") as HTMLInputElement | null;
const saveBtn = document.getElementById("save") as HTMLButtonElement | null;
const statusEl = document.getElementById("s") as HTMLSpanElement | null;
if (!urlInput || !tokenInput || !saveBtn) throw new Error("Missing options elements");
void chrome.storage.sync
  .get({ serverUrl: "http://localhost:3000", authToken: "" } as { serverUrl: string; authToken: string })
  .then(({ serverUrl, authToken }) => {
    urlInput.value = serverUrl;
    tokenInput.value = authToken;
  });
saveBtn.onclick = async () => {
  const serverUrl = urlInput.value.trim() || "http://localhost:3000";
  const authToken = tokenInput.value.trim();
  await chrome.storage.sync.set({ serverUrl, authToken });
  if (statusEl) {
    statusEl.textContent = " saved";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 1500);
  }
};
