const DEFAULTS = {
  thresholdMinutes: 90,     // recommended default
  autoApprove: false,
  alarmPeriodMinutes: 5
};

const STORAGE_KEYS = {
  lastActiveByTabId: "lastActiveByTabId",   // { [tabId]: epochMs }
  importantTabIds: "importantTabIds",       // { [tabId]: true }
  candidates: "candidates",                 // array of tab objects for review
  settings: "settings"
};

async function getSettings() {
  const { settings } = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return { ...DEFAULTS, ...(settings || {}) };
}

async function setSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: next });
  return next;
}

async function getMap(key) {
  const obj = await chrome.storage.local.get(key);
  return obj[key] || {};
}

async function setMap(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

async function updateLastActive(tabId) {
  const lastActive = await getMap(STORAGE_KEYS.lastActiveByTabId);
  lastActive[String(tabId)] = Date.now();
  await setMap(STORAGE_KEYS.lastActiveByTabId, lastActive);
}

async function cleanupTabMaps(tabId) {
  const lastActive = await getMap(STORAGE_KEYS.lastActiveByTabId);
  const important = await getMap(STORAGE_KEYS.importantTabIds);
  delete lastActive[String(tabId)];
  delete important[String(tabId)];
  await setMap(STORAGE_KEYS.lastActiveByTabId, lastActive);
  await setMap(STORAGE_KEYS.importantTabIds, important);
}

async function isYouTubePlaying(tab) {
  try {
    if (!tab.url || !tab.url.includes("youtube.com/")) return false;

    // Ask content script whether video is playing
    const resp = await chrome.tabs.sendMessage(tab.id, { type: "YOUTUBE_IS_PLAYING" });
    return resp?.playing === true;
  } catch {
    // If we can't message (no script / not ready), assume not playing
    return false;
  }
}

async function findCandidates() {
  const settings = await getSettings();
  const thresholdMs = settings.thresholdMinutes * 60 * 1000;

  const [tabs, lastActive, important] = await Promise.all([
    chrome.tabs.query({}),
    getMap(STORAGE_KEYS.lastActiveByTabId),
    getMap(STORAGE_KEYS.importantTabIds)
  ]);

  const now = Date.now();
  const candidates = [];

  for (const tab of tabs) {
    if (!tab.id) continue;

    // Never close active tab
    if (tab.active) continue;

    // Respect Important
    if (important[String(tab.id)]) continue;

    // Optional: also respect pinned tabs (usually users pin important tabs)
    if (tab.pinned) continue;

    // Determine last active timestamp
    const ts = lastActive[String(tab.id)];
    const lastSeen = typeof ts === "number" ? ts : (tab.lastAccessed || now);
    const idleMs = now - lastSeen;

    if (idleMs < thresholdMs) continue;

    // Don't close YouTube if video playing
    if (tab.url && tab.url.includes("youtube.com")) {
      const playing = await isYouTubePlaying(tab);
      if (playing) continue;
    }

    candidates.push({
      id: tab.id,
      title: tab.title || tab.url || "(untitled)",
      url: tab.url || "",
      favIconUrl: tab.favIconUrl || "",
      idleMinutes: Math.round(idleMs / 60000)
    });
  }

  return candidates;
}

async function closeCandidates(candidates) {
  const ids = candidates.map(t => t.id).filter(Boolean);
  if (ids.length === 0) return;

  await chrome.tabs.remove(ids);

  // Clean maps
  const lastActive = await getMap(STORAGE_KEYS.lastActiveByTabId);
  const important = await getMap(STORAGE_KEYS.importantTabIds);
  for (const id of ids) {
    delete lastActive[String(id)];
    delete important[String(id)];
  }
  await setMap(STORAGE_KEYS.lastActiveByTabId, lastActive);
  await setMap(STORAGE_KEYS.importantTabIds, important);
}

async function openReviewPage({ focus = false } = {}) {
  const url = chrome.runtime.getURL("review.html");
  const existing = await chrome.tabs.query({ url });

  if (existing.length > 0) {
    await chrome.tabs.update(existing[0].id, { active: focus });
    if (focus && existing[0].windowId != null) {
      await chrome.windows.update(existing[0].windowId, { focused: true });
    }
    return;
  }

  await chrome.tabs.create({ url, active: focus });

}


async function runDeclutter() {
  const settings = await getSettings();
  const candidates = await findCandidates();

  if (candidates.length === 0) {
    await chrome.storage.local.remove(STORAGE_KEYS.candidates);
    return;
  }

  if (settings.autoApprove) {
    await closeCandidates(candidates);
    return;
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.candidates]: candidates });
  await openReviewPage({ focus: false });

}

// --- Event listeners ---

chrome.runtime.onInstalled.addListener(async () => {
  await setSettings({});
  const settings = await getSettings();
  chrome.alarms.create("DECLUTTER_SWEEP", { periodInMinutes: settings.alarmPeriodMinutes });
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await getSettings();
  chrome.alarms.create("DECLUTTER_SWEEP", { periodInMinutes: settings.alarmPeriodMinutes });
});

// Update last active when user switches tabs
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await updateLastActive(tabId);
});

// Update last active when page loads / changes
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    await updateLastActive(tabId);
  }
});

// Cleanup maps when tab closes
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await cleanupTabMaps(tabId);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "DECLUTTER_SWEEP") {
    await runDeclutter();
  }
});

// Messages from popup/review
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "RUN_NOW") {
    await runDeclutter();
    await openReviewPage({ focus: true });
    sendResponse({ ok: true });
    return true;
    }

    if (msg?.type === "TOGGLE_IMPORTANT") {
      const important = await getMap(STORAGE_KEYS.importantTabIds);
      const key = String(msg.tabId);
      if (important[key]) delete important[key];
      else important[key] = true;
      await setMap(STORAGE_KEYS.importantTabIds, important);
      sendResponse({ ok: true, important: !!important[key] });
      return;
    }

    if (msg?.type === "GET_STATE_FOR_TAB") {
      const [settings, important] = await Promise.all([getSettings(), getMap(STORAGE_KEYS.importantTabIds)]);
      sendResponse({
        ok: true,
        settings,
        isImportant: !!important[String(msg.tabId)]
      });
      return;
    }

    if (msg?.type === "GET_REVIEW_CANDIDATES") {
      const { candidates } = await chrome.storage.local.get(STORAGE_KEYS.candidates);
      const settings = await getSettings();
      sendResponse({ ok: true, candidates: candidates || [], settings });
      return;
    }

    if (msg?.type === "CLOSE_REVIEW_CANDIDATES") {
      const { candidates } = await chrome.storage.local.get(STORAGE_KEYS.candidates);
      const list = candidates || [];
      await closeCandidates(list);
      await chrome.storage.local.remove(STORAGE_KEYS.candidates);
      sendResponse({ ok: true, closed: list.length });
      return;
    }

    if (msg?.type === "CLEAR_REVIEW_CANDIDATES") {
      await chrome.storage.local.remove(STORAGE_KEYS.candidates);
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "UPDATE_SETTINGS") {
      const next = await setSettings(msg.patch || {});
      // If user changed alarm frequency, update alarm
      if (typeof msg.patch?.alarmPeriodMinutes === "number") {
        chrome.alarms.create("DECLUTTER_SWEEP", { periodInMinutes: next.alarmPeriodMinutes });
      }
      sendResponse({ ok: true, settings: next });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message" });
  })();

  return true; // keep message channel open for async
});
