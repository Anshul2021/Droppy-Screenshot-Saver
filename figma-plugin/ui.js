// Droppy - Screenshot Inbox (Figma Plugin UI Iframe Logic)

(function () {
  'use strict';

  const SERVER_BASE = 'http://localhost:3847';
  const MAX_FIGMA_DIMENSION = 4096;

  // DOM Elements
  const statusDot = document.getElementById('statusDot');
  const liveBadge = document.getElementById('liveBadge');
  const countBadge = document.getElementById('countBadge');
  const errorBanner = document.getElementById('errorBanner');
  const skeletonContainer = document.getElementById('skeletonContainer');
  const queueList = document.getElementById('queueList');
  const emptyState = document.getElementById('emptyState');
  const actionFooter = document.getElementById('actionFooter');
  const insertAllBtn = document.getElementById('insertAllBtn');
  const refreshBtn = document.getElementById('refreshBtn');

  const sectionTargetSelect = document.getElementById('sectionTargetSelect');
  const sectionNameInput = document.getElementById('sectionNameInput');

  const progressModal = document.getElementById('progressModal');
  const progressStatus = document.getElementById('progressStatus');
  const progressBarFill = document.getElementById('progressBarFill');

  // State
  let cachedScreenshots = [];
  let lastKnownJson = '';
  let isBusy = false;
  let existingSections = [];

  // Helper: Show Error Banner
  function showError(msg) {
    if (!errorBanner) return;
    errorBanner.textContent = msg;
    errorBanner.classList.remove('hidden');
  }

  function hideError() {
    if (!errorBanner) return;
    errorBanner.classList.add('hidden');
  }

  function setOnline(online) {
    if (statusDot) {
      if (online) {
        statusDot.classList.remove('offline');
        if (liveBadge) liveBadge.classList.remove('offline');
      } else {
        statusDot.classList.add('offline');
        if (liveBadge) liveBadge.classList.add('offline');
      }
    }
  }

  function formatRelativeTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function showProgress(status, percent) {
    if (!progressModal) return;
    progressModal.classList.remove('hidden');
    progressStatus.textContent = status;
    progressBarFill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  }

  function hideProgress() {
    if (!progressModal) return;
    progressModal.classList.add('hidden');
    progressBarFill.style.width = '0%';
  }

  function updateSectionsDropdown(sections) {
    existingSections = sections || [];
    const currentVal = sectionTargetSelect.value;
    sectionTargetSelect.innerHTML = '';

    const optNew = document.createElement('option');
    optNew.value = 'new';
    optNew.textContent = '➕ Create New Section';
    sectionTargetSelect.appendChild(optNew);

    if (existingSections.length > 0) {
      const optGroup = document.createElement('optgroup');
      optGroup.label = 'Existing Sections';
      existingSections.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = `existing:${s.id}`;
        opt.textContent = `📁 ${s.name}`;
        optGroup.appendChild(opt);
      });
      sectionTargetSelect.appendChild(optGroup);
    }

    const optNone = document.createElement('option');
    optNone.value = 'none';
    optNone.textContent = 'Canvas (No Section)';
    sectionTargetSelect.appendChild(optNone);

    if (currentVal && Array.from(sectionTargetSelect.options).some(o => o.value === currentVal)) {
      sectionTargetSelect.value = currentVal;
    }

    handleSectionSelectChange();
  }

  function handleSectionSelectChange() {
    const val = sectionTargetSelect.value;
    if (val === 'new') {
      sectionNameInput.classList.remove('hidden');
    } else {
      sectionNameInput.classList.add('hidden');
    }
  }

  sectionTargetSelect.addEventListener('change', handleSectionSelectChange);

  async function prepareImageBytes(blob, initialWidth, initialHeight) {
    return new Promise((resolve, reject) => {
      if (initialWidth && initialHeight && initialWidth <= MAX_FIGMA_DIMENSION && initialHeight <= MAX_FIGMA_DIMENSION) {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            bytes: Array.from(new Uint8Array(reader.result)),
            width: initialWidth,
            height: initialHeight
          });
        };
        reader.onerror = () => reject(new Error('Failed to read image buffer'));
        reader.readAsArrayBuffer(blob);
        return;
      }

      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let width = img.naturalWidth || initialWidth || 800;
        let height = img.naturalHeight || initialHeight || 600;

        if (width > MAX_FIGMA_DIMENSION || height > MAX_FIGMA_DIMENSION) {
          const scale = Math.min(MAX_FIGMA_DIMENSION / width, MAX_FIGMA_DIMENSION / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((resizedBlob) => {
          if (!resizedBlob) return reject(new Error('Canvas export failed'));
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              bytes: Array.from(new Uint8Array(reader.result)),
              width,
              height
            });
          };
          reader.onerror = () => reject(new Error('Failed to read resized image'));
          reader.readAsArrayBuffer(resizedBlob);
        }, 'image/png');
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to decode image'));
      };
      img.src = url;
    });
  }

  async function fetchImageForPlugin(item) {
    const imageUrl = item.url.startsWith('http') ? item.url : `${SERVER_BASE}${item.url}`;
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Failed to fetch image ${item.filename} (HTTP ${res.status})`);
    const blob = await res.blob();
    const prepared = await prepareImageBytes(blob, item.width, item.height);
    return {
      bytes: prepared.bytes,
      width: prepared.width,
      height: prepared.height,
      filename: item.filename
    };
  }

  function getSectionParams() {
    const val = sectionTargetSelect.value;
    if (val.startsWith('existing:')) {
      return {
        sectionOption: 'existing',
        targetSectionId: val.replace('existing:', ''),
        sectionName: ''
      };
    }
    if (val === 'none') {
      return {
        sectionOption: 'none',
        targetSectionId: null,
        sectionName: ''
      };
    }
    return {
      sectionOption: 'new',
      targetSectionId: null,
      sectionName: sectionNameInput.value.trim() || 'Mobile Screenshots'
    };
  }

  async function handleInsertItem(item, buttonEl) {
    if (isBusy) return;
    isBusy = true;
    hideError();
    const originalText = buttonEl ? buttonEl.textContent : 'Insert';
    if (buttonEl) {
      buttonEl.textContent = 'Inserting...';
      buttonEl.disabled = true;
    }

    try {
      const payload = await fetchImageForPlugin(item);
      const sectionParams = getSectionParams();

      parent.postMessage({
        pluginMessage: {
          type: 'insert',
          bytes: payload.bytes,
          width: payload.width,
          height: payload.height,
          filename: item.filename,
          ...sectionParams
        }
      }, '*');
    } catch (err) {
      console.error('[Droppy Plugin] Single insert error:', err);
      showError('Failed to insert screenshot. Check connection.');
    } finally {
      if (buttonEl) {
        buttonEl.textContent = originalText;
        buttonEl.disabled = false;
      }
      isBusy = false;
    }
  }

  async function handleInsertAll() {
    if (isBusy || cachedScreenshots.length === 0) return;
    isBusy = true;
    hideError();
    insertAllBtn.disabled = true;

    const total = cachedScreenshots.length;
    showProgress(`Preparing 1 of ${total} screenshots...`, 10);

    const payloads = [];
    for (let i = 0; i < total; i++) {
      const item = cachedScreenshots[i];
      try {
        showProgress(`Downloading ${i + 1} of ${total}: ${item.filename}`, Math.round(((i + 1) / total) * 80));
        const payload = await fetchImageForPlugin(item);
        payloads.push(payload);
      } catch (err) {
        console.error('[Droppy Plugin] Error fetching item for Insert All:', item.filename, err);
      }
    }

    if (payloads.length > 0) {
      showProgress(`Placing ${payloads.length} screenshots into Figma...`, 95);
      const sectionParams = getSectionParams();

      parent.postMessage({
        pluginMessage: {
          type: 'insert-all',
          items: payloads,
          ...sectionParams
        }
      }, '*');
    } else {
      showError('Failed to download screenshots for insertion.');
      hideProgress();
      insertAllBtn.disabled = false;
      isBusy = false;
    }
  }

  async function handleDeleteItem(filename) {
    hideError();
    try {
      const res = await fetch(`${SERVER_BASE}/screenshots/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error(`Failed to delete (${res.status})`);
      fetchScreenshots();
    } catch (err) {
      console.error('[Droppy Plugin] Delete error:', err);
      showError('Failed to delete screenshot.');
    }
  }

  function renderScreenshots(items) {
    if (skeletonContainer) skeletonContainer.classList.add('hidden');
    cachedScreenshots = items || [];
    const count = cachedScreenshots.length;
    countBadge.textContent = count === 0 ? 'No screenshots waiting' : `${count} screenshot${count === 1 ? '' : 's'} waiting`;

    if (count === 0) {
      emptyState.classList.remove('hidden');
      queueList.innerHTML = '';
      actionFooter.classList.add('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    actionFooter.classList.remove('hidden');

    const fragment = document.createDocumentFragment();
    cachedScreenshots.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'item-card';

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'item-thumb-wrap';
      const img = document.createElement('img');
      img.className = 'item-thumb';
      img.src = item.url.startsWith('http') ? item.url : `${SERVER_BASE}${item.url}`;
      img.alt = item.filename;
      img.loading = 'lazy';
      thumbWrap.appendChild(img);

      const info = document.createElement('div');
      info.className = 'item-info';
      const name = document.createElement('div');
      name.className = 'item-name';
      name.textContent = item.filename;

      const meta = document.createElement('div');
      meta.className = 'item-meta';
      const dimsStr = item.width && item.height ? `${item.width} × ${item.height}` : 'Image';
      const timeStr = formatRelativeTime(item.createdAt);
      meta.textContent = timeStr ? `${dimsStr} • ${timeStr}` : dimsStr;

      info.appendChild(name);
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'item-actions';

      const insertBtn = document.createElement('button');
      insertBtn.type = 'button';
      insertBtn.className = 'btn btn-action-insert';
      insertBtn.textContent = 'Insert';
      insertBtn.addEventListener('click', () => handleInsertItem(item, insertBtn));

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-action-delete';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => handleDeleteItem(item.filename));

      actions.appendChild(insertBtn);
      actions.appendChild(deleteBtn);

      card.appendChild(thumbWrap);
      card.appendChild(info);
      card.appendChild(actions);

      fragment.appendChild(card);
    });

    queueList.innerHTML = '';
    queueList.appendChild(fragment);
  }

  async function fetchScreenshots() {
    try {
      const res = await fetch(`${SERVER_BASE}/screenshots`);
      if (!res.ok) throw new Error(`Server status ${res.status}`);
      const data = await res.json();
      setOnline(true);
      hideError();

      const jsonStr = JSON.stringify(data);
      if (jsonStr !== lastKnownJson) {
        lastKnownJson = jsonStr;
        renderScreenshots(data);
      }
    } catch (err) {
      console.error('[Droppy Plugin] Connection error:', err);
      if (skeletonContainer) skeletonContainer.classList.add('hidden');
      setOnline(false);
      countBadge.textContent = 'Offline';
      showError("Can't connect to server — ensure Node server is running on port 3847");
    }
  }

  window.onmessage = (event) => {
    const msg = event.data && event.data.pluginMessage;
    if (!msg) return;

    if (msg.type === 'sections-list') {
      updateSectionsDropdown(msg.sections);
    }

    if (msg.type === 'insert-complete' || msg.type === 'insert-all-complete') {
      hideProgress();
      insertAllBtn.disabled = false;
      isBusy = false;
      fetchScreenshots();
    }
  };

  insertAllBtn.addEventListener('click', handleInsertAll);
  refreshBtn.addEventListener('click', () => {
    parent.postMessage({ pluginMessage: { type: 'get-sections' } }, '*');
    fetchScreenshots();
  });

  // Initial query & live polling every 1.5s
  parent.postMessage({ pluginMessage: { type: 'get-sections' } }, '*');
  fetchScreenshots();
  setInterval(fetchScreenshots, 1500);
})();
