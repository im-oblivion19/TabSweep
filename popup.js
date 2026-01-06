async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function send(msg) {
  return await chrome.runtime.sendMessage(msg);
}

(async () => {
  const tab = await getActiveTab();
  const state = await send({ type: "GET_STATE_FOR_TAB", tabId: tab.id });

  const thresholdEl = document.getElementById("threshold");
  const autoApproveEl = document.getElementById("autoApprove");
  const toggleBtn = document.getElementById("toggleImportant");
  const runNowBtn = document.getElementById("runNow");

  thresholdEl.value = state.settings.thresholdMinutes;
  autoApproveEl.checked = state.settings.autoApprove;

  toggleBtn.textContent = state.isImportant ? "Unmark" : "Mark";

  toggleBtn.addEventListener("click", async () => {
    const resp = await send({ type: "TOGGLE_IMPORTANT", tabId: tab.id });
    toggleBtn.textContent = resp.important ? "Unmark" : "Mark";
  });

  thresholdEl.addEventListener("change", async () => {
    const val = Number(thresholdEl.value);
    if (!Number.isFinite(val) || val < 1) return;
    await send({ type: "UPDATE_SETTINGS", patch: { thresholdMinutes: val } });
  });

  autoApproveEl.addEventListener("change", async () => {
    await send({ type: "UPDATE_SETTINGS", patch: { autoApprove: autoApproveEl.checked } });
  });

  runNowBtn.addEventListener("click", async () => {
    await send({ type: "RUN_NOW" });
    window.close();
  });
})();
