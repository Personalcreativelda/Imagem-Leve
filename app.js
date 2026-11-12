/* Imagem Leve — © 2026 Mr.creative. Todos os direitos reservados. */
const $ = (selector) => document.querySelector(selector);
const dropzone = $('#dropzone');
const input = $('#fileInput');
const statusEl = $('#status');
const resultsEl = $('#results');
const fileList = $('#fileList');
const summary = $('#summary');
const quality = $('#quality');
const format = $('#format');
const state = { items: [], busy: false };

const icons = {
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>'
};

function bytes(value) {
  if (!Number.isFinite(value) || value === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function safeBaseName(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '-').trim() || 'imagem';
}

function extension(mime) {
  return mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
}

function setStatus(message = '', error = false) {
  statusEl.textContent = message;
  statusEl.className = `status${error ? ' error' : ''}`;
}

function canvasBlob(canvas, mime, amount) {
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('O navegador não conseguiu criar a imagem.')),
    mime,
    amount
  ));
}

async function processFile(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const maxWidth = Math.max(64, Math.min(12000, Number($('#maxWidth').value) || 1920));
  const maxHeight = Math.max(64, Math.min(12000, Number($('#maxHeight').value) || 1920));
  let scale = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height);
  if ($('#noUpscale').checked) scale = Math.min(1, scale);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: format.value !== 'image/jpeg' });
  if (format.value === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await canvasBlob(canvas, format.value, Number(quality.value) / 100);
  return {
    original: file,
    blob,
    width,
    height,
    name: `${safeBaseName(file.name)}-leve.${extension(format.value)}`,
    url: URL.createObjectURL(blob)
  };
}

async function handleFiles(fileCollection) {
  if (state.busy) return;
  const files = [...fileCollection].filter(file => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
  if (!files.length) return setStatus('Escolha arquivos JPG, PNG ou WebP.', true);
  state.busy = true;
  setStatus(`Processando ${files.length} ${files.length === 1 ? 'imagem' : 'imagens'}…`);
  try {
    for (let index = 0; index < files.length; index++) {
      setStatus(`Processando ${index + 1} de ${files.length}: ${files[index].name}`);
      state.items.push(await processFile(files[index]));
    }
    render();
    setStatus(`${files.length} ${files.length === 1 ? 'imagem pronta' : 'imagens prontas'} para baixar.`);
  } catch (error) {
    console.error(error);
    setStatus('Não foi possível processar uma das imagens. Tente outro arquivo ou formato.', true);
  } finally {
    state.busy = false;
    input.value = '';
  }
}

function render() {
  fileList.innerHTML = '';
  let originalTotal = 0;
  let finalTotal = 0;
  state.items.forEach((item, index) => {
    originalTotal += item.original.size;
    finalTotal += item.blob.size;
    const reduction = Math.round((1 - item.blob.size / item.original.size) * 100);
    const card = document.createElement('article');
    card.className = 'file-card';
    card.innerHTML = `
      <img class="thumb" src="${item.url}" alt="Prévia de ${item.original.name}" width="84" height="84">
      <div class="file-info">
        <p class="file-name" title="${item.name.replace(/"/g, '&quot;')}">${item.name}</p>
        <p class="file-meta">${item.width} × ${item.height} px · ${bytes(item.original.size)} → ${bytes(item.blob.size)}</p>
        <span class="saving ${reduction < 0 ? 'bad' : ''}">${reduction >= 0 ? `${reduction}% menor` : `${Math.abs(reduction)}% maior`}</span>
      </div>
      <button class="button ghost download-one" type="button" data-index="${index}">${icons.download} Baixar</button>`;
    fileList.appendChild(card);
  });
  const reduction = originalTotal ? Math.round((1 - finalTotal / originalTotal) * 100) : 0;
  summary.textContent = `${state.items.length} ${state.items.length === 1 ? 'arquivo' : 'arquivos'} · ${bytes(originalTotal)} → ${bytes(finalTotal)}${reduction >= 0 ? ` · ${reduction}% menor` : ''}`;
  resultsEl.classList.toggle('visible', state.items.length > 0);
  $('#downloadAllBtn').disabled = !state.items.length;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Pequeno criador de ZIP sem dependências; usa entradas "store" (as imagens já são comprimidas).
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) { return [value & 255, (value >>> 8) & 255]; }
function u32(value) { return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]; }

async function makeZip(items) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const item of items) {
    const data = new Uint8Array(await item.blob.arrayBuffer());
    const name = encoder.encode(item.name);
    const crc = crc32(data);
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...name
    ]);
    localParts.push(local, data);
    const central = new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name
    ]);
    centralParts.push(central);
    offset += local.length + data.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(items.length), ...u16(items.length),
    ...u32(centralSize), ...u32(offset), ...u16(0)
  ]);
  return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
}

input.addEventListener('change', () => handleFiles(input.files));
dropzone.addEventListener('click', event => { if (event.target === dropzone || !event.target.closest('label')) input.click(); });
dropzone.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); }
});
['dragenter', 'dragover'].forEach(name => dropzone.addEventListener(name, event => {
  event.preventDefault();
  dropzone.classList.add('dragging');
}));
['dragleave', 'drop'].forEach(name => dropzone.addEventListener(name, event => {
  event.preventDefault();
  dropzone.classList.remove('dragging');
}));
dropzone.addEventListener('drop', event => handleFiles(event.dataTransfer.files));
quality.addEventListener('input', () => $('#qualityValue').textContent = `${quality.value}%`);
format.addEventListener('change', () => {
  $('#qualityField').style.opacity = format.value === 'image/png' ? '.45' : '1';
  quality.disabled = format.value === 'image/png';
});
fileList.addEventListener('click', event => {
  const button = event.target.closest('.download-one');
  if (!button) return;
  const item = state.items[Number(button.dataset.index)];
  downloadBlob(item.blob, item.name);
});
$('#clearBtn').addEventListener('click', () => {
  state.items.forEach(item => URL.revokeObjectURL(item.url));
  state.items = [];
  render();
  setStatus('');
});
$('#downloadAllBtn').addEventListener('click', async () => {
  const button = $('#downloadAllBtn');
  button.disabled = true;
  button.textContent = 'Preparando ZIP…';
  try {
    downloadBlob(await makeZip(state.items), 'imagens-leves.zip');
  } finally {
    button.disabled = false;
    button.textContent = 'Baixar tudo (.zip)';
  }
});
