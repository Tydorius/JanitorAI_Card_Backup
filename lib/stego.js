let _stegoDebug = false;
try {
  const stored = window._debugMode;
  if (stored) _stegoDebug = true;
} catch (e) {}

function dbg(...args) {
  if (_stegoDebug || (typeof _popupDebug !== 'undefined' && _popupDebug)) {
    console.log('[JanitorAI Card Backup][DEBUG][stego]', ...args);
  }
}

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xEDB88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[i] = c;
  }
  return table;
}

const CRC_TABLE = buildCrc32Table();

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildTextChunk(keyword, text) {
  dbg('buildTextChunk called, keyword:', keyword, 'text length:', text.length);

  const encoder = new TextEncoder();

  const keywordBytes = encoder.encode(keyword);
  const textBytes = encoder.encode(text);
  dbg('keywordBytes length:', keywordBytes.length, 'textBytes length:', textBytes.length);

  const chunkData = new Uint8Array(keywordBytes.length + 1 + textBytes.length);
  chunkData.set(keywordBytes, 0);
  chunkData[keywordBytes.length] = 0x00;
  chunkData.set(textBytes, keywordBytes.length + 1);

  const chunkType = encoder.encode('tEXt');

  const crcPayload = new Uint8Array(chunkType.length + chunkData.length);
  crcPayload.set(chunkType, 0);
  crcPayload.set(chunkData, chunkType.length);
  const checksum = crc32(crcPayload);
  dbg('CRC32 checksum:', checksum.toString(16));

  const length = chunkData.length;
  dbg('Chunk data length field:', length);

  const chunk = new Uint8Array(4 + chunkType.length + chunkData.length + 4);
  const view = new DataView(chunk.buffer);

  view.setUint32(0, length, false);
  chunk.set(chunkType, 4);
  chunk.set(chunkData, 8);
  view.setUint32(8 + chunkData.length, checksum, false);

  dbg('Total chunk size:', chunk.length, 'bytes');

  return chunk;
}

function injectTextChunk(pngBuffer, keyword, text) {
  dbg('injectTextChunk called, pngBuffer byteLength:', pngBuffer.byteLength);

  const png = new Uint8Array(pngBuffer);
  dbg('PNG buffer first 8 bytes (signature):', Array.from(png.slice(0, 8)));

  const signatureLength = 8;

  const ihdrLengthView = new DataView(png.buffer, png.byteOffset + signatureLength, 4);
  const ihdrDataLength = ihdrLengthView.getUint32(0, false);
  dbg('IHDR data length:', ihdrDataLength);

  const ihdrChunkTotal = 4 + 4 + ihdrDataLength + 4;
  dbg('IHDR chunk total size:', ihdrChunkTotal);

  const splicePoint = signatureLength + ihdrChunkTotal;
  dbg('Splice point (after IHDR):', splicePoint);

  const textChunk = buildTextChunk(keyword, text);
  dbg('Text chunk built, size:', textChunk.length);

  const result = new Uint8Array(png.length + textChunk.length);
  dbg('Result buffer size:', result.length, '(original:', png.length, '+ chunk:', textChunk.length, ')');

  result.set(png.subarray(0, splicePoint), 0);
  result.set(textChunk, splicePoint);
  result.set(png.subarray(splicePoint), splicePoint + textChunk.length);

  dbg('Text chunk injected successfully');
  return result.buffer;
}

function encodeV2ForPng(v2Card) {
  dbg('encodeV2ForPng called');
  const json = JSON.stringify(v2Card);
  dbg('JSON string length:', json.length);

  const encoded = btoa(unescape(encodeURIComponent(json)));
  dbg('Base64 encoded length:', encoded.length);

  return encoded;
}

function createCardPng(pngBuffer, v2Card) {
  dbg('createCardPng called, pngBuffer byteLength:', pngBuffer.byteLength);
  dbg('V2 card name:', v2Card?.data?.name);

  const base64 = encodeV2ForPng(v2Card);
  dbg('Encoded card base64 length:', base64.length);

  const result = injectTextChunk(pngBuffer, 'chara', base64);
  dbg('Final PNG buffer byteLength:', result.byteLength);

  return result;
}
