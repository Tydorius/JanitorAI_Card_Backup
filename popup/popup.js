let _popupDebug = false;

function dbg(...args) {
  if (_popupDebug) console.log('[JanitorAI Card Backup][DEBUG][popup]', ...args);
}

document.addEventListener('DOMContentLoaded', async () => {
  const statusIcon = document.getElementById('status-icon');
  const statusLabel = document.getElementById('status-label');
  const statusDetail = document.getElementById('status-detail');
  const characterInfo = document.getElementById('character-info');
  const characterName = document.getElementById('character-name');
  const characterMeta = document.getElementById('character-meta');
  const exportSection = document.getElementById('export-section');
  const downloadBtn = document.getElementById('download-btn');
  const messageArea = document.getElementById('message-area');
  const formatRadios = document.querySelectorAll('input[name="format"]');
  const debugCheckbox = document.getElementById('debug-toggle');

  let currentCharacter = null;

  setStatus('waiting', 'Checking...', 'Looking for character data');

  if (debugCheckbox) {
    const stored = await browser.storage.local.get('_debugMode');
    _popupDebug = !!stored._debugMode;
    debugCheckbox.checked = _popupDebug;
    dbg('Debug mode from storage:', _popupDebug);

    debugCheckbox.addEventListener('change', async () => {
      _popupDebug = debugCheckbox.checked;
      dbg('Debug checkbox changed to:', _popupDebug);
      try {
        await browser.runtime.sendMessage({ type: 'SET_DEBUG', enabled: _popupDebug });
        dbg('SET_DEBUG message sent successfully');
      } catch (e) {
        console.error('[JanitorAI Card Backup] Failed to send SET_DEBUG:', e);
      }
    });
  }

  try {
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    const tabId = activeTab?.id;
    dbg('Active tab ID:', tabId);

    dbg('Sending GET_LATEST_CHARACTER message');
    const response = await browser.runtime.sendMessage({ type: 'GET_LATEST_CHARACTER', tabId });
    dbg('GET_LATEST_CHARACTER response:', response);

    if (response && response.success && response.character) {
      currentCharacter = response.character;
      dbg('Got character:', currentCharacter.name, 'id:', currentCharacter.id);
      dbg('Character keys:', Object.keys(currentCharacter));
      dbg('Character.avatar:', currentCharacter.avatar);

      const isComplete = !!response.complete;
      dbg('Character complete flag:', isComplete);

      if (isComplete) {
        showCharacterReady(currentCharacter);
      } else {
        showCharacterPartial(currentCharacter);
      }
    } else {
      dbg('No character in response:', response);
      setStatus('waiting', 'No character captured', 'Open a JanitorAI chat to capture card data');
      showTip('Navigate to janitorai.com and open a chat. The extension will automatically capture the character data when the page loads.');
    }
  } catch (e) {
    setStatus('error', 'Error', 'Could not communicate with background script');
    console.error('[JanitorAI Card Backup] Popup init error:', e);
    dbg('Init error:', e.message, e.stack);
  }

  downloadBtn.addEventListener('click', handleDownload);

  function setStatus(type, label, detail) {
    statusIcon.className = 'status-icon ' + type;
    statusLabel.textContent = label;
    statusDetail.textContent = detail;
  }

  function showCharacterReady(character) {
    setStatus('ready', 'Character captured', 'Ready to export');

    characterName.textContent = character.name || character.chat_name || 'Unknown';
    const metaParts = [];
    if (character.chat_name && character.chat_name !== character.name) {
      metaParts.push('Chat name: ' + character.chat_name);
    }
    if (character.is_nsfw) {
      metaParts.push('NSFW');
    }
    if (character.first_messages && character.first_messages.length > 1) {
      metaParts.push(character.first_messages.length + ' greetings');
    }
    characterMeta.textContent = metaParts.join(' ');

    characterInfo.classList.remove('hidden');
    exportSection.classList.remove('hidden');
    downloadBtn.disabled = false;
  }

  function showCharacterPartial(character) {
    setStatus('partial', 'Capturing...', 'Fetching character data');

    characterName.textContent = character.name || character.chat_name || 'Unknown';
    const metaParts = [];
    if (character.chat_name && character.chat_name !== character.name) {
      metaParts.push('Chat name: ' + character.chat_name);
    }
    if (character.is_nsfw) {
      metaParts.push('NSFW');
    }
    if (character.first_messages && character.first_messages.length > 1) {
      metaParts.push(character.first_messages.length + ' greetings');
    }
    characterMeta.textContent = metaParts.join(' ');

    characterInfo.classList.remove('hidden');
    exportSection.classList.add('hidden');
    downloadBtn.disabled = true;

    showMessage('Capturing full character data. This should complete automatically within a few seconds.', 'warning');
  }

  function showTip(message) {
    messageArea.textContent = message;
    messageArea.className = 'message-area info';
    messageArea.classList.remove('hidden');
  }

  function showMessage(message, type) {
    messageArea.textContent = message;
    messageArea.className = 'message-area ' + type;
    messageArea.classList.remove('hidden');
  }

  function getSelectedFormat() {
    for (const radio of formatRadios) {
      if (radio.checked) return radio.value;
    }
    return 'json';
  }

  async function handleDownload() {
    if (!currentCharacter) return;

    const format = getSelectedFormat();
    dbg('handleDownload called, format:', format);
    dbg('currentCharacter keys:', Object.keys(currentCharacter));

    downloadBtn.disabled = true;
    downloadBtn.classList.add('processing');
    downloadBtn.querySelector('.btn-text').textContent = 'Processing...';

    try {
      dbg('Calling mapToV2 with character:', currentCharacter.name);
      const v2Card = mapToV2(currentCharacter);
      dbg('mapToV2 result keys:', Object.keys(v2Card));
      dbg('V2 data.name:', v2Card.data?.name);
      dbg('V2 data.description length:', (v2Card.data?.description || '').length);
      dbg('V2 data.first_mes length:', (v2Card.data?.first_mes || '').length);
      dbg('V2 card JSON size:', JSON.stringify(v2Card).length, 'bytes');

      if (format === 'json') {
        dbg('Starting JSON download');
        await downloadJson(v2Card);
        dbg('JSON download completed');
      } else {
        dbg('Starting PNG download');
        await downloadPng(v2Card, currentCharacter);
        dbg('PNG download completed');
      }

      downloadBtn.classList.remove('processing');
      downloadBtn.classList.add('success');
      downloadBtn.querySelector('.btn-text').textContent = 'Done';
      showMessage('Export complete', 'success');

      setTimeout(() => {
        downloadBtn.classList.remove('success');
        downloadBtn.querySelector('.btn-text').textContent = 'Download Card';
        downloadBtn.disabled = false;
        messageArea.classList.add('hidden');
      }, 2000);

    } catch (e) {
      console.error('[JanitorAI Card Backup] Download error:', e);
      dbg('Download error:', e.message, 'Stack:', e.stack);
      downloadBtn.classList.remove('processing');
      downloadBtn.classList.add('error');
      downloadBtn.querySelector('.btn-text').textContent = 'Error';
      showMessage('Export failed: ' + e.message, 'error');

      setTimeout(() => {
        downloadBtn.classList.remove('error');
        downloadBtn.querySelector('.btn-text').textContent = 'Download Card';
        downloadBtn.disabled = false;
      }, 3000);
    }
  }

  async function downloadJson(v2Card) {
    dbg('downloadJson called');
    const json = JSON.stringify(v2Card, null, 2);
    dbg('JSON string length:', json.length);

    const filename = sanitizeFilename(v2Card.data.name) + '.json';
    dbg('Download filename:', filename);

    dbg('Sending DOWNLOAD_JSON message to background...');
    const response = await browser.runtime.sendMessage({
      type: 'DOWNLOAD_JSON',
      json: json,
      filename: filename
    });
    dbg('DOWNLOAD_JSON response:', response);

    if (!response || !response.success) {
      throw new Error(response?.error || 'Download failed');
    }
    dbg('Download id:', response.downloadId);
  }

  async function downloadPng(v2Card, character) {
    dbg('downloadPng called');
    const avatarFilename = character.avatar;
    dbg('Character avatar field:', avatarFilename);

    if (!avatarFilename) {
      dbg('ERROR: Character has no avatar field');
      throw new Error('Character has no avatar — cannot create PNG card');
    }

    const avatarUrl = 'https://ella.janitorai.com/bot-avatars/' + avatarFilename + '?width=1200';
    dbg('Avatar URL:', avatarUrl);

    dbg('Sending FETCH_AVATAR message...');
    const avatarResponse = await browser.runtime.sendMessage({
      type: 'FETCH_AVATAR',
      avatarUrl: avatarUrl
    });
    dbg('FETCH_AVATAR response:', avatarResponse?.success, 'data length:', avatarResponse?.data?.length, 'error:', avatarResponse?.error);

    if (!avatarResponse || !avatarResponse.success) {
      dbg('FETCH_AVATAR failed:', avatarResponse?.error);
      throw new Error(avatarResponse?.error || 'Failed to fetch avatar');
    }

    const pngBytes = new Uint8Array(avatarResponse.data);
    dbg('PNG bytes received, length:', pngBytes.length);
    dbg('PNG header check (should be 137,80,78,71,13,10,26,10):', Array.from(pngBytes.slice(0, 8)));

    dbg('Calling createCardPng...');
    const pngBuffer = createCardPng(pngBytes.buffer, v2Card);
    dbg('createCardPng result, byte length:', pngBuffer.byteLength);

    const filename = sanitizeFilename(v2Card.data.name) + '.png';
    dbg('Download filename:', filename);

    dbg('Sending DOWNLOAD_PNG message to background...');
    const response = await browser.runtime.sendMessage({
      type: 'DOWNLOAD_PNG',
      data: Array.from(new Uint8Array(pngBuffer)),
      filename: filename
    });
    dbg('DOWNLOAD_PNG response:', response);

    if (!response || !response.success) {
      throw new Error(response?.error || 'Download failed');
    }
    dbg('Download id:', response.downloadId);
  }

  function sanitizeFilename(name) {
    return (name || 'character')
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 60)
      .trim();
  }
});
