(() => {
  const fileInput = document.getElementById('saveFile');
  const fileNameInput = document.getElementById('fileName');
  const detectModeInput = document.getElementById('detectMode');
  const candidateList = document.getElementById('candidateList');
  const selectedPathInput = document.getElementById('selectedPath');
  const currentMoneyInput = document.getElementById('currentMoney');
  const newMoneyInput = document.getElementById('newMoney');
  const applyBtn = document.getElementById('applyMoney');
  const downloadBtn = document.getElementById('downloadSave');
  const resetBtn = document.getElementById('resetEditor');
  const editorStatus = document.getElementById('editorStatus');
  const editorLog = document.getElementById('editorLog');

  const MONEY_RE = /(gold|money|cash|coin|coins|credit|credits)/i;

  const state = {
    fileName: '',
    mode: '',
    originalText: '',
    parsed: null,
    selectedPath: '',
    candidates: []
  };

  function setStatus(msg, isError = false) {
    editorStatus.textContent = msg;
    editorStatus.style.color = isError ? '#ffd3dc' : '';
  }

  function setLog(msg) {
    editorLog.textContent = msg;
  }

  function escapeHTML(text) {
    return String(text).replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  function splitPath(path) {
    return path ? path.split('.').filter(Boolean) : [];
  }

  function getAtPath(obj, path) {
    return splitPath(path).reduce((acc, key) => acc && acc[key], obj);
  }

  function setAtPath(obj, path, value) {
    const parts = splitPath(path);
    const last = parts.pop();
    if (!last) return false;
    let ref = obj;
    for (const part of parts) {
      if (typeof ref !== 'object' || ref === null || !(part in ref)) return false;
      ref = ref[part];
    }
    ref[last] = value;
    return true;
  }

  function walk(obj, basePath = '', bucket = []) {
    if (typeof obj !== 'object' || obj === null) return bucket;
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => walk(item, `${basePath}${basePath ? '.' : ''}${index}`, bucket));
      return bucket;
    }

    Object.keys(obj).forEach(key => {
      const value = obj[key];
      const path = `${basePath}${basePath ? '.' : ''}${key}`;
      if (typeof value === 'number' && Number.isFinite(value) && MONEY_RE.test(`${key} ${path}`)) {
        bucket.push({ path, key, value });
      }
      if (typeof value === 'object' && value !== null) {
        walk(value, path, bucket);
      }
    });
    return bucket;
  }

  function uniqueCandidates(items) {
    const seen = new Set();
    return items.filter(item => {
      const sig = `${item.path}:${item.value}`;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
  }

  function rankCandidates(items) {
    return [...items].sort((a, b) => {
      const score = item => {
        const path = item.path.toLowerCase();
        if (path.includes('gameparty._gold')) return 0;
        if (path.endsWith('._gold')) return 1;
        if (path.endsWith('.gold')) return 2;
        if (path.includes('gold')) return 3;
        if (path.includes('money')) return 4;
        if (path.includes('cash')) return 5;
        if (path.includes('credit')) return 6;
        return 10;
      };
      return score(a) - score(b);
    });
  }

  function renderCandidates() {
    if (!state.candidates.length) {
      candidateList.innerHTML = '<div class="empty-state">Tidak ada kandidat uang yang ditemukan pada save ini.</div>';
      return;
    }

    candidateList.innerHTML = state.candidates.map(item => {
      const active = item.path === state.selectedPath ? 'active' : '';
      return `<button type="button" class="candidate-chip ${active}" data-path="${escapeHTML(item.path)}"><span>${escapeHTML(item.path)}</span><strong>${escapeHTML(item.value)}</strong></button>`;
    }).join('');

    candidateList.querySelectorAll('.candidate-chip').forEach(btn => {
      btn.addEventListener('click', () => selectPath(btn.dataset.path));
    });
  }

  function selectPath(path) {
    state.selectedPath = path;
    const value = getAtPath(state.parsed, path);
    selectedPathInput.value = path;
    currentMoneyInput.value = value;
    newMoneyInput.value = value;
    renderCandidates();
    setStatus(`Candidate dipilih: ${path}`);
  }

  function tryParse(text) {
    const trimmed = text.trim();

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return { mode: 'json', parsed: JSON.parse(trimmed) };
    }

    if (window.LZString && typeof window.LZString.decompressFromBase64 === 'function') {
      const decompressed = window.LZString.decompressFromBase64(trimmed);
      if (decompressed && (decompressed.trim().startsWith('{') || decompressed.trim().startsWith('['))) {
        return { mode: 'rpgsave-base64-lzstring', parsed: JSON.parse(decompressed), rawJson: decompressed };
      }
    }

    throw new Error('Format save belum bisa dibaca. Coba file .rpgsave umum atau JSON hasil decode.');
  }

  function resetEditor() {
    state.fileName = '';
    state.mode = '';
    state.originalText = '';
    state.parsed = null;
    state.selectedPath = '';
    state.candidates = [];
    fileInput.value = '';
    fileNameInput.value = '';
    detectModeInput.value = '';
    selectedPathInput.value = '';
    currentMoneyInput.value = '';
    newMoneyInput.value = '';
    candidateList.innerHTML = '<div class="empty-state">Belum ada data. Upload save dulu.</div>';
    setStatus('Menunggu file save.');
    setLog('Belum ada proses.');
  }

  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      state.fileName = file.name;
      state.originalText = text;
      fileNameInput.value = file.name;
      setStatus('Membaca file save...');

      const parsedResult = tryParse(text);
      state.mode = parsedResult.mode;
      state.parsed = parsedResult.parsed;
      detectModeInput.value = parsedResult.mode;

      const found = rankCandidates(uniqueCandidates(walk(state.parsed)));
      state.candidates = found;
      setLog(JSON.stringify(found.slice(0, 12), null, 2) || '[]');

      if (!found.length) {
        renderCandidates();
        setStatus('Save berhasil dibaca, tapi candidate uang tidak ditemukan.', true);
        return;
      }

      selectPath(found[0].path);
      renderCandidates();
      setStatus(`Save berhasil dibaca. Ditemukan ${found.length} candidate.`);
    } catch (error) {
      resetEditor();
      fileNameInput.value = file.name || '';
      setStatus(error.message || 'Gagal membaca save.', true);
      setLog(String(error.stack || error));
    }
  });

  applyBtn.addEventListener('click', () => {
    if (!state.parsed || !state.selectedPath) {
      setStatus('Upload save dan pilih candidate uang dulu.', true);
      return;
    }

    const nextValue = Number(newMoneyInput.value);
    if (!Number.isFinite(nextValue) || nextValue < 0) {
      setStatus('Masukkan nilai uang yang valid.', true);
      return;
    }

    const ok = setAtPath(state.parsed, state.selectedPath, nextValue);
    if (!ok) {
      setStatus('Gagal menyimpan nilai baru ke path terpilih.', true);
      return;
    }

    currentMoneyInput.value = String(nextValue);
    state.candidates = rankCandidates(uniqueCandidates(walk(state.parsed)));
    renderCandidates();
    setStatus(`Nilai uang diubah menjadi ${nextValue}. Sekarang kamu bisa download save baru.`);
    setLog(JSON.stringify(state.candidates.slice(0, 12), null, 2));
  });

  downloadBtn.addEventListener('click', () => {
    if (!state.parsed || !state.mode) {
      setStatus('Belum ada save yang siap didownload.', true);
      return;
    }

    try {
      const json = JSON.stringify(state.parsed);
      let output = json;
      let outName = state.fileName || 'edited-save.rpgsave';

      if (state.mode === 'rpgsave-base64-lzstring') {
        if (!window.LZString || typeof window.LZString.compressToBase64 !== 'function') {
          throw new Error('Library LZString tidak termuat, jadi save .rpgsave tidak bisa dibuat ulang.');
        }
        output = window.LZString.compressToBase64(json);
        if (!outName.endsWith('.rpgsave')) outName += '.rpgsave';
      } else if (state.mode === 'json') {
        if (!outName.endsWith('.json')) outName += '.json';
      }

      const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = outName.replace(/(\.rpgsave|\.json)?$/, '-money-edited$1');
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus('Save baru berhasil dibuat dan diunduh.');
    } catch (error) {
      setStatus(error.message || 'Gagal membuat save baru.', true);
      setLog(String(error.stack || error));
    }
  });

  resetBtn.addEventListener('click', resetEditor);
  resetEditor();
})();
