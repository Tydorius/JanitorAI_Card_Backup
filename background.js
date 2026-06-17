console.log('[JanitorAI Card Backup] Background script starting...');

const AVATAR_BASE_URL = 'https://ella.janitorai.com/bot-avatars/';

let _debugMode = false;
browser.storage.local.get('_debugMode').then(r => {
  _debugMode = !!r._debugMode;
  if (_debugMode) console.log('[JanitorAI Card Backup][DEBUG] Debug mode restored from storage');
}).catch(() => {});

function dbg(...args) {
  if (_debugMode) console.log('[JanitorAI Card Backup][DEBUG]', ...args);
}

const tabCharacters = new Map();

let _authToken = null;

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const authHeader = details.requestHeaders.find(h => h.name.toLowerCase() === 'authorization');
    if (authHeader && authHeader.value) {
      _authToken = authHeader.value;
    }
  },
  { urls: ['*://janitorai.com/hampter/*'] },
  ['requestHeaders']
);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractFromSystemPrompt(systemPrompt, chatName) {
  const result = { personality: '', scenario: '', example_dialogs: '' };

  if (chatName) {
    const escaped = escapeRegex(chatName);
    const personaPattern = new RegExp(
      `<${escaped}'?s?\\s*[Pp]ersona>([\\s\\S]*?)<\\/${escaped}'?s?\\s*[Pp]ersona>`,
      'i'
    );
    const match = personaPattern.exec(systemPrompt);
    if (match) result.personality = match[1].trim();
  }

  const scenarioMatch = systemPrompt.match(/<Scenario>([\s\S]*?)<\/Scenario>/i);
  if (scenarioMatch) result.scenario = scenarioMatch[1].trim();

  const dialogsMatch = systemPrompt.match(/<example_dialogs>([\s\S]*?)<\/example_dialogs>/i);
  if (dialogsMatch) result.example_dialogs = dialogsMatch[1].trim();

  return result;
}

function mergeCharacterFields(tabData, fields, source) {
  if (fields.personality) tabData.character.personality = fields.personality;
  if (fields.scenario) tabData.character.scenario = fields.scenario;
  if (fields.example_dialogs) tabData.character.example_dialogs = fields.example_dialogs;
  if (fields.description) tabData.character.description = fields.description;
  if (fields.first_message) tabData.character.first_message = fields.first_message;
  if (fields.first_messages) tabData.character.first_messages = fields.first_messages;
  if (tabData.character.personality && tabData.character.personality.trim()) {
    tabData.complete = true;
    tabData.source = source;
    return true;
  }
  return false;
}

async function enrichCharacterFromApi(characterId, tabId) {
  try {
    const response = await browser.tabs.sendMessage(tabId, {
      type: 'FETCH_CHARACTER',
      characterId,
      authToken: _authToken
    });
    if (!response || !response.success) {
      console.log(`[JanitorAI Card Backup] Character enrichment failed: ${response?.status || response?.error || 'content script error'}`);
      return;
    }
    const fullChar = response.data;

    const tabData = tabCharacters.get(tabId);
    if (!tabData || !tabData.character || tabData.complete) return;

    if (mergeCharacterFields(tabData, fullChar, 'api')) {
      setIconState('green', tabId);
      console.log(`[JanitorAI Card Backup] Character data complete (characters API): ${tabData.character.name} [tab ${tabId}]`);
    } else {
      console.log(`[JanitorAI Card Backup] Character enrichment incomplete — personality field is empty [tab ${tabId}]`);
    }
  } catch (e) {
    console.error('[JanitorAI Card Backup] Character enrichment error:', e);
  }
}

function setIconState(state, tabId) {
  const iconSets = {
    gray: {
      path: {
        16: 'icons/icon-16-grayscale.png',
        48: 'icons/icon-48-grayscale.png',
        128: 'icons/icon-128-grayscale.png'
      }
    },
    yellow: {
      path: {
        16: 'icons/icon-16-grayscale.png',
        48: 'icons/icon-48-grayscale.png',
        128: 'icons/icon-128-grayscale.png'
      },
      badgeText: '!',
      badgeBackgroundColor: '#f59e0b'
    },
    green: {
      path: {
        16: 'icons/icon-16-color.png',
        48: 'icons/icon-48-color.png',
        128: 'icons/icon-128-color.png'
      },
      badgeText: '',
      badgeBackgroundColor: '#22c55e'
    },
    'green-warning': {
      path: {
        16: 'icons/icon-16-color.png',
        48: 'icons/icon-48-color.png',
        128: 'icons/icon-128-color.png'
      },
      badgeText: '!',
      badgeBackgroundColor: '#f59e0b'
    }
  };

  const config = iconSets[state] || iconSets.gray;
  const details = tabId !== undefined ? { tabId } : {};
  try {
    browser.action.setIcon({ path: config.path, ...details });
    if (config.badgeText !== undefined) {
      browser.action.setBadgeText({ text: config.badgeText, ...details });
    }
    if (config.badgeBackgroundColor) {
      browser.action.setBadgeBackgroundColor({ color: config.badgeBackgroundColor, ...details });
    }
  } catch (e) {
    console.error('[JanitorAI Card Backup] setIconState failed:', e);
  }
  dbg('Icon state set to:', state, 'tabId:', tabId);
}

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    console.log('[JanitorAI Card Backup] Intercepted chat request:', details.method, details.url, 'tabId:', details.tabId);

    if (typeof browser.webRequest.filterResponseData !== 'function') {
      console.error('[JanitorAI Card Backup] filterResponseData not available');
      return;
    }

    const tabId = details.tabId;

    let filter;
    try {
      filter = browser.webRequest.filterResponseData(details.requestId);
      dbg('Filter created for requestId:', details.requestId);
    } catch (e) {
      console.error('[JanitorAI Card Backup] Failed to create filter:', e);
      return;
    }

    const decoder = new TextDecoder('utf-8');
    let data = '';

    filter.ondata = (event) => {
      data += decoder.decode(event.data, { stream: true });
      filter.write(event.data);
    };

    filter.onerror = (error) => {
      console.error('[JanitorAI Card Backup] Filter error:', error);
      filter.disconnect();
    };

    filter.onstop = () => {
      dbg('Filter onstop, data length:', data.length);
      try {
        const parsed = JSON.parse(data);
        dbg('JSON parsed successfully, top-level keys:', Object.keys(parsed));

        if (parsed.character && parsed.character.id) {
          const character = parsed.character;
          dbg('Character found - id:', character.id, 'name:', character.name);

          if (tabId < 0) {
            dbg('Request from non-tab context, ignoring');
          } else {
            tabCharacters.set(tabId, { character, complete: false });
            dbg('Character saved for tab', tabId, '(partial)');
            setIconState('yellow', tabId);
            console.log(`[JanitorAI Card Backup] Captured character (partial): ${character.name} [tab ${tabId}]`);
            enrichCharacterFromApi(character.id, tabId);
          }
        } else {
          dbg('Response has no character object or character.id. Top-level keys:', Object.keys(parsed));
        }
      } catch (e) {
        console.error('[JanitorAI Card Backup] Failed to parse chat data:', e);
        dbg('Raw data preview (first 500 chars):', data.substring(0, 500));
      }

      filter.close();
    };
  },
  { urls: ['*://janitorai.com/hampter/chats*'] },
  ['blocking']
);

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    const tabId = details.tabId;
    if (tabId < 0) return;

    let filter;
    try {
      filter = browser.webRequest.filterResponseData(details.requestId);
    } catch (e) { return; }

    const decoder = new TextDecoder('utf-8');
    let data = '';

    filter.ondata = (event) => {
      data += decoder.decode(event.data, { stream: true });
      filter.write(event.data);
    };

    filter.onstop = () => {
      try {
        const fullChar = JSON.parse(data);
        if (fullChar.id) {
          dbg('Passive character data captured from characters API:', fullChar.name);
          const tabData = tabCharacters.get(tabId);
          if (tabData && tabData.character && !tabData.complete) {
            if (mergeCharacterFields(tabData, fullChar, 'api')) {
              setIconState('green', tabId);
              console.log(`[JanitorAI Card Backup] Character data complete (passive capture): ${tabData.character.name} [tab ${tabId}]`);
            } else {
              console.log(`[JanitorAI Card Backup] Passive capture incomplete — personality field is empty [tab ${tabId}]`);
            }
          }
        }
      } catch (e) {}
      filter.close();
    };
  },
  { urls: ['*://janitorai.com/hampter/characters/*'] },
  ['blocking']
);

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!details.url.endsWith('/generateAlpha')) return;
    if (details.method !== 'POST') return;
    console.log('[JanitorAI Card Backup] Intercepted generateAlpha request, tabId:', details.tabId);

    if (typeof browser.webRequest.filterResponseData !== 'function') return;

    let filter;
    try {
      filter = browser.webRequest.filterResponseData(details.requestId);
      dbg('generateAlpha filter created for requestId:', details.requestId);
    } catch (e) {
      console.error('[JanitorAI Card Backup] Failed to create generateAlpha filter:', e);
      return;
    }

    const tabId = details.tabId;
    const decoder = new TextDecoder('utf-8');
    let data = '';

    filter.ondata = (event) => {
      data += decoder.decode(event.data, { stream: true });
      filter.write(event.data);
    };

    filter.onerror = (error) => {
      console.error('[JanitorAI Card Backup] generateAlpha filter error:', error);
      filter.disconnect();
    };

    filter.onstop = () => {
      dbg('generateAlpha filter onstop, data length:', data.length);
      const trimmed = data.trim();
      if (!trimmed.startsWith('{')) {
        console.log('[JanitorAI Card Backup] generateAlpha returned non-JSON response (likely server error), skipping');
        filter.close();
        return;
      }
      try {
        const parsed = JSON.parse(data);
        dbg('generateAlpha response keys:', Object.keys(parsed));

        if (parsed.messages && parsed.messages.length > 0) {
          const systemMsg = parsed.messages.find(m => m.role === 'system');
          if (systemMsg && systemMsg.content) {
            dbg('System message found, content length:', systemMsg.content.length);

            const tabData = tabId >= 0 ? tabCharacters.get(tabId) : null;
            if (tabData && tabData.character && !tabData.complete) {
              const chatName = tabData.character.chat_name || tabData.character.name || '';
              const extracted = extractFromSystemPrompt(systemMsg.content, chatName);
              dbg('Extracted fields - personality:', extracted.personality.length, 'scenario:', extracted.scenario.length, 'example_dialogs:', extracted.example_dialogs.length);

              if (mergeCharacterFields(tabData, extracted, 'generateAlpha')) {
                setIconState('green-warning', tabId);
                console.log(`[JanitorAI Card Backup] Character data complete (generateAlpha fallback): ${tabData.character.name} [tab ${tabId}]`);
              } else {
                dbg('generateAlpha extraction did not produce personality content for tab', tabId);
              }
            } else if (tabData && tabData.complete) {
              dbg('Tab', tabId, 'already complete, skipping generateAlpha');
            }
          } else {
            dbg('No system message found in generateAlpha response');
          }
        }
      } catch (e) {
        console.error('[JanitorAI Card Backup] Failed to parse generateAlpha data:', e);
        dbg('generateAlpha raw data preview (first 500 chars):', data.substring(0, 500));
      }

      filter.close();
    };
  },
  { urls: ['*://janitorai.com/generateAlpha'] },
  ['blocking']
);

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  if (!tabCharacters.has(tabId)) return;

  const isOnChatPage = /janitorai\.com\/chats\/\w/.test(changeInfo.url);
  if (!isOnChatPage) {
    dbg('Tab', tabId, 'navigated away from chat, clearing character data');
    tabCharacters.delete(tabId);
    try {
      browser.action.setIcon({
        path: {
          16: 'icons/icon-16-grayscale.png',
          48: 'icons/icon-48-grayscale.png',
          128: 'icons/icon-128-grayscale.png'
        },
        tabId
      });
      browser.action.setBadgeText({ text: '', tabId });
    } catch (e) {}
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  if (tabCharacters.has(tabId)) {
    dbg('Tab', tabId, 'closed, cleaning up character data');
    tabCharacters.delete(tabId);
  }
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  dbg('Message received:', message.type, message);

  switch (message.type) {
    case 'GET_LATEST_CHARACTER': {
      const tabId = message.tabId;
      dbg('Handling GET_LATEST_CHARACTER for tab', tabId);
      const tabData = tabId !== undefined && tabId !== null ? tabCharacters.get(tabId) : null;
      if (tabData) {
        dbg('Tab', tabId, 'has character:', tabData.character?.name, 'complete:', tabData.complete);
      } else {
        dbg('No data for tab', tabId);
      }
      sendResponse({ success: true, character: tabData?.character || null, complete: !!tabData?.complete, source: tabData?.source || null });
      return false;
    }

    case 'CLEAR_CHARACTER': {
      const tabId = message.tabId;
      dbg('Handling CLEAR_CHARACTER for tab', tabId);
      if (tabId !== undefined && tabId !== null) {
        tabCharacters.delete(tabId);
        setIconState('gray', tabId);
        dbg('Character cleared for tab', tabId);
      }
      sendResponse({ success: true });
      return false;
    }

    case 'FETCH_AVATAR':
      dbg('Handling FETCH_AVATAR, url:', message.avatarUrl);
      fetchAvatarAsPng(message.avatarUrl).then(arrayBuffer => {
        const bytes = new Uint8Array(arrayBuffer);
        dbg('Avatar fetched and converted, byte count:', bytes.length);
        sendResponse({ success: true, data: Array.from(bytes) });
      }).catch(e => {
        console.error('[JanitorAI Card Backup] FETCH_AVATAR error:', e);
        dbg('FETCH_AVATAR failed:', e.message, e.stack);
        sendResponse({ success: false, error: e.message });
      });
      return true;

    case 'DOWNLOAD_JSON': {
      dbg('Handling DOWNLOAD_JSON, filename:', message.filename);
      const jsonBlob = new Blob([message.json], { type: 'application/json' });
      const jsonBlobUrl = URL.createObjectURL(jsonBlob);
      browser.downloads.download({
        url: jsonBlobUrl,
        filename: message.filename,
        saveAs: true
      }).then(downloadId => {
        dbg('Download started, id:', downloadId);
        browser.downloads.onChanged.addListener(function listener(delta) {
          if (delta.id === downloadId && (delta.state?.current === 'complete' || delta.state?.current === 'interrupted')) {
            URL.revokeObjectURL(jsonBlobUrl);
            browser.downloads.onChanged.removeListener(listener);
            dbg('Blob URL revoked, download state:', delta.state?.current);
          }
        });
        sendResponse({ success: true, downloadId });
      }).catch(e => {
        console.error('[JanitorAI Card Backup] DOWNLOAD_JSON error:', e);
        dbg('DOWNLOAD_JSON error:', e.message);
        sendResponse({ success: false, error: e.message });
      });
      return true;
    }

    case 'DOWNLOAD_PNG': {
      dbg('Handling DOWNLOAD_PNG, filename:', message.filename, 'data length:', message.data?.length);
      const pngBytes = new Uint8Array(message.data);
      const pngBlob = new Blob([pngBytes], { type: 'image/png' });
      const pngBlobUrl = URL.createObjectURL(pngBlob);
      browser.downloads.download({
        url: pngBlobUrl,
        filename: message.filename,
        saveAs: true
      }).then(downloadId => {
        dbg('Download started, id:', downloadId);
        browser.downloads.onChanged.addListener(function listener(delta) {
          if (delta.id === downloadId && (delta.state?.current === 'complete' || delta.state?.current === 'interrupted')) {
            URL.revokeObjectURL(pngBlobUrl);
            browser.downloads.onChanged.removeListener(listener);
            dbg('Blob URL revoked, download state:', delta.state?.current);
          }
        });
        sendResponse({ success: true, downloadId });
      }).catch(e => {
        console.error('[JanitorAI Card Backup] DOWNLOAD_PNG error:', e);
        dbg('DOWNLOAD_PNG error:', e.message);
        sendResponse({ success: false, error: e.message });
      });
      return true;
    }

    case 'SET_DEBUG':
      _debugMode = !!message.enabled;
      dbg('Debug mode set to:', _debugMode);
      browser.storage.local.set({ _debugMode: _debugMode }).catch(() => {});
      sendResponse({ success: true });
      return false;

    case 'PING':
      sendResponse({ success: true, pong: true });
      break;
  }
});

async function fetchAvatarAsPng(avatarUrl) {
  dbg('fetchAvatarAsPng called with:', avatarUrl);

  const response = await fetch(avatarUrl);
  dbg('Fetch response status:', response.status, response.statusText);
  dbg('Content-Type:', response.headers.get('content-type'));

  if (!response.ok) throw new Error(`Avatar fetch failed: ${response.status}`);

  const contentType = response.headers.get('content-type') || '';
  const blob = await response.blob();
  dbg('Blob size:', blob.size, 'type:', blob.type);

  if (contentType.includes('image/png')) {
    dbg('Avatar is already PNG, returning raw arrayBuffer');
    return await blob.arrayBuffer();
  }

  dbg('Avatar is not PNG (type:', contentType, '), converting via OffscreenCanvas');
  return await convertImageToPng(blob);
}

async function convertImageToPng(blob) {
  dbg('convertImageToPng called, blob size:', blob.size);

  const bitmap = await createImageBitmap(blob);
  dbg('createImageBitmap success, dimensions:', bitmap.width, 'x', bitmap.height);

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const pngBlob = await canvas.convertToBlob({ type: 'image/png' });
  dbg('convertToBlob success, PNG blob size:', pngBlob.size);

  const ab = await pngBlob.arrayBuffer();
  dbg('ArrayBuffer byte length:', ab.byteLength);
  return ab;
}

console.log('[JanitorAI Card Backup] Background script loaded and ready');
