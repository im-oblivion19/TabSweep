async function send(msg) {
  return await chrome.runtime.sendMessage(msg);
}

function render(candidates) {
  const list = document.getElementById("list");
  list.innerHTML = "";

  for (const t of candidates) {
    const div = document.createElement("div");
    div.className = "card";

    const safeTitle = t.title || t.url || "(untitled)";
    div.innerHTML = `
      <div class="title">${safeTitle}</div>
      <div class="meta">
        Idle ~${t.idleMinutes} min — <a href="${t.url}" target="_blank" rel="noreferrer">${t.url}</a>
      </div>
    `;
    list.appendChild(div);
  }
}

(async () => {
  const resp = await send({ type: "GET_REVIEW_CANDIDATES" });
  const candidates = resp.candidates || [];
  const settings = resp.settings;

  document.getElementById("threshold").value = settings.thresholdMinutes;
  document.getElementById("autoApprove").checked = settings.autoApprove;

  document.getElementById("subtitle").textContent =
    candidates.length
      ? `Found ${candidates.length} tab(s) to close.`
      : "No tabs to close.";

  render(candidates);

  document.getElementById("threshold").addEventListener("change", async (e) => {
    const val = Number(e.target.value);
    if (!Number.isFinite(val) || val < 5) return;
    await send({ type: "UPDATE_SETTINGS", patch: { thresholdMinutes: val } });
  });

  document.getElementById("autoApprove").addEventListener("change", async (e) => {
    await send({ type: "UPDATE_SETTINGS", patch: { autoApprove: e.target.checked } });
  });

  document.getElementById("closeAll").addEventListener("click", async () => {
    const out = await send({ type: "CLOSE_REVIEW_CANDIDATES" });
    document.getElementById("subtitle").textContent = `Closed ${out.closed} tab(s).`;
    document.getElementById("list").innerHTML = "";
  });

  document.getElementById("cancel").addEventListener("click", async () => {
    await send({ type: "CLEAR_REVIEW_CANDIDATES" });
    window.close();
  });
})();
