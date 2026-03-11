// Relay color preview messages between popup and content scripts.
// The popup connects via port; on disconnect (popup closed), revert preview.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'popup-preview') return;

  function sendToAllTabs(msg) {
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      }
    });
  }

  port.onMessage.addListener((msg) => sendToAllTabs(msg));

  port.onDisconnect.addListener(() => {
    sendToAllTabs({ type: 'preview', color: null });
  });
});
