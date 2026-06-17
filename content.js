function getAuthTokenFromCookies() {
  const cookies = document.cookie.split(';');
  const parts = {};
  for (const cookie of cookies) {
    const eqIdx = cookie.indexOf('=');
    const name = cookie.slice(0, eqIdx).trim();
    const value = cookie.slice(eqIdx + 1);
    const match = name.match(/^sb-.*-auth-token\.(\d+)$/);
    if (match) {
      parts[match[1]] = value;
    }
  }
  const indices = Object.keys(parts).sort();
  if (indices.length === 0) return null;
  let combined = indices.map(i => parts[i]).join('');
  if (combined.startsWith('base64-')) {
    combined = combined.substring(7);
  }
  try {
    const decoded = JSON.parse(atob(combined));
    if (decoded.access_token) return 'Bearer ' + decoded.access_token;
  } catch (e) {}
  return null;
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_CHARACTER') {
    const authToken = message.authToken || getAuthTokenFromCookies();
    const headers = { 'Accept': 'application/json, text/plain, */*' };
    if (authToken) {
      headers['Authorization'] = authToken;
    }
    fetch(`https://janitorai.com/hampter/characters/${message.characterId}`, {
      credentials: 'include',
      headers
    }).then(async response => {
      if (!response.ok) {
        sendResponse({ success: false, status: response.status });
        return;
      }
      const data = await response.json();
      sendResponse({ success: true, data });
    }).catch(e => {
      sendResponse({ success: false, error: e.message });
    });
    return true;
  }
});
