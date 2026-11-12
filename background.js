/* Imagem Leve — autoria e desenvolvimento: Mr.creative. © 2026. */
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});
