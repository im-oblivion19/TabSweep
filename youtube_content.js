chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "YOUTUBE_IS_PLAYING") return;

  const video = document.querySelector("video");
  const playing = !!video && !video.paused && !video.ended && video.readyState > 2;

  sendResponse({ playing });
});
