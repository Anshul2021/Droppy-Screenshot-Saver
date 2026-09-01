// Droppy - Screenshot Inbox Client Logic (with Multi-Selection & Skeleton Loading)

(function () {
  'use strict';

  // DOM Elements
  const hostNameEl = document.getElementById('hostName');
  const queueCountEl = document.getElementById('queueCount');
  const statusBanner = document.getElementById('statusBanner');
  const feedbackBanner = document.getElementById('feedbackBanner');
  const statusDot = document.querySelector('.status-dot');

  const fileInput = document.getElementById('fileInput');
  const selectBtn = document.getElementById('selectBtn');
  const idleUploadContainer = document.getElementById('idleUploadContainer');
  const previewCard = document.getElementById('previewCard');
  const previewCountBadge = document.getElementById('previewCountBadge');
  const previewThumbnails = document.getElementById('previewThumbnails');
  const addMoreBtn = document.getElementById('addMoreBtn');
  const sendBtn = document.getElementById('sendBtn');
  const cancelBtn = document.getElementById('cancelBtn');

  const skeletonContainer = document.getElementById('skeletonContainer');
  const queueList = document.getElementById('queueList');
  const emptyState = document.getElementById('emptyState');
  const queueFooter = document.getElementById('queueFooter');
  const clearAllBtn = document.getElementById('clearAllBtn');

  // State
  let selectedFiles = []; // Array of { file, previewUrl, width, height }
  let isUploading = false;
  let isServerOffline = false;
  let hasLoadedInitialQueue = false;
  let lastKnownQueueJson = '';
  let feedbackTimeout = null;

  // Initialize Connection Info
  function initConnectionInfo() {
    const currentHost = window.location.host || 'localhost:3847';
    if (hostNameEl) {
      hostNameEl.textContent = currentHost;
    }
  }

  // Format Helper: File Size
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Helper: Show Feedback Banner
  function showFeedback(message, type = 'success', duration = 3000) {
    if (!feedbackBanner) return;
    if (feedbackTimeout) clearTimeout(feedbackTimeout);

    feedbackBanner.textContent = message;
    feedbackBanner.className = `feedback-banner ${type}`;
    feedbackBanner.classList.remove('hidden');

    if (duration > 0) {
      feedbackTimeout = setTimeout(() => {
        feedbackBanner.classList.add('hidden');
      }, duration);
    }
  }

  function hideFeedback() {
    if (feedbackBanner) {
      feedbackBanner.classList.add('hidden');
    }
  }

  // Helper: Set Server Offline State
  function setServerOffline(offline) {
    if (isServerOffline === offline) return;
    isServerOffline = offline;

    if (offline) {
      if (statusDot) statusDot.classList.add('offline');
      if (statusBanner) {
        statusBanner.textContent = 'Server unreachable — trying to reconnect...';
        statusBanner.className = 'banner error';
        statusBanner.classList.remove('hidden');
      }
    } else {
      if (statusDot) statusDot.classList.remove('offline');
      if (statusBanner) {
        statusBanner.classList.add('hidden');
      }
    }
  }

  // Clear all selected files & reset UI to idle
  function resetUploadUI() {
    selectedFiles.forEach(item => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    selectedFiles = [];
    fileInput.value = '';
    previewThumbnails.innerHTML = '';
    previewCard.classList.add('hidden');
    idleUploadContainer.classList.remove('hidden');
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send to Figma';
    cancelBtn.disabled = false;
    isUploading = false;
  }

  // Render multi-file preview cards
  function renderPreviewList() {
    if (selectedFiles.length === 0) {
      resetUploadUI();
      return;
    }

    idleUploadContainer.classList.add('hidden');
    previewCard.classList.remove('hidden');

    const totalBytes = selectedFiles.reduce((acc, cur) => acc + cur.file.size, 0);
    const count = selectedFiles.length;
    previewCountBadge.textContent = `${count} screenshot${count === 1 ? '' : 's'} selected (${formatBytes(totalBytes)})`;
    sendBtn.textContent = count === 1 ? 'Send to Figma' : `Send ${count} to Figma`;

    previewThumbnails.innerHTML = '';
    const fragment = document.createDocumentFragment();

    selectedFiles.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'preview-item';

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'preview-item-thumb-wrap';

      const img = document.createElement('img');
      img.className = 'preview-item-thumb';
      img.src = item.previewUrl;
      img.alt = item.file.name;
      thumbWrap.appendChild(img);

      const info = document.createElement('div');
      info.className = 'preview-item-info';

      const name = document.createElement('div');
      name.className = 'preview-item-name';
      name.textContent = item.file.name;

      const specs = document.createElement('div');
      specs.className = 'preview-item-specs';
      const dims = item.width && item.height ? `${item.width} × ${item.height}` : 'Measuring...';
      specs.textContent = `${dims} • ${formatBytes(item.file.size)}`;

      info.appendChild(name);
      info.appendChild(specs);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'preview-item-remove';
      removeBtn.title = 'Remove';
      removeBtn.innerHTML = '&times;';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeSelectedFile(index);
      });

      row.appendChild(thumbWrap);
      row.appendChild(info);
      row.appendChild(removeBtn);

      fragment.appendChild(row);
    });

    previewThumbnails.appendChild(fragment);
  }

  function removeSelectedFile(index) {
    if (index >= 0 && index < selectedFiles.length) {
      const removed = selectedFiles.splice(index, 1)[0];
      if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      renderPreviewList();
    }
  }

  // Handle Newly Selected Files (multi-selection)
  function handleFilesAdded(fileList) {
    if (!fileList || fileList.length === 0) return;

    let addedCount = 0;
    Array.from(fileList).forEach(file => {
      if (!file.type.startsWith('image/')) {
        showFeedback('Non-image file skipped: ' + file.name, 'error', 3000);
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      const item = {
        file,
        previewUrl,
        width: null,
        height: null
      };

      // Measure dimensions
      const tempImg = new Image();
      tempImg.onload = () => {
        item.width = tempImg.naturalWidth;
        item.height = tempImg.naturalHeight;
        renderPreviewList();
      };
      tempImg.src = previewUrl;

      selectedFiles.push(item);
      addedCount++;
    });

    if (addedCount > 0) {
      renderPreviewList();
      hideFeedback();
    }
  }

  // Upload All Selected Files (in batch or sequentially)
  async function uploadSelectedFiles() {
    if (selectedFiles.length === 0 || isUploading) return;

    isUploading = true;
    sendBtn.disabled = true;
    cancelBtn.disabled = true;
    addMoreBtn.disabled = true;

    const total = selectedFiles.length;
    sendBtn.textContent = total === 1 ? 'Sending...' : `Sending ${total} screenshots...`;

    try {
      const formData = new FormData();
      selectedFiles.forEach((item) => {
        formData.append('image', item.file);
      });

      const response = await fetch('/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        let errMessage = 'Upload failed — check your connection';
        try {
          const errData = await response.json();
          if (errData && errData.error) errMessage = errData.error;
        } catch (_) {}
        throw new Error(errMessage);
      }

      showFeedback(total === 1 ? '✓ Screenshot sent' : `✓ ${total} screenshots sent`, 'success', 2500);
      resetUploadUI();
      fetchScreenshots();
    } catch (err) {
      console.error('[Droppy] Batch upload error:', err);
      showFeedback(err.message || 'Upload failed — check connection', 'error', 4000);
      sendBtn.disabled = false;
      cancelBtn.disabled = false;
      addMoreBtn.disabled = false;
      sendBtn.textContent = total === 1 ? 'Send to Figma' : `Send ${total} to Figma`;
      isUploading = false;
    }
  }

  // Delete a single screenshot
  async function deleteScreenshot(filename) {
    if (!filename) return;
    try {
      const res = await fetch(`/screenshots/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete screenshot.');
      fetchScreenshots();
    } catch (err) {
      console.error('[Droppy] Delete error:', err);
      showFeedback('Failed to delete screenshot.', 'error', 3000);
    }
  }

  // Clear all screenshots
  async function clearAllScreenshots() {
    try {
      const res = await fetch('/screenshots', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to clear screenshots.');
      fetchScreenshots();
    } catch (err) {
      console.error('[Droppy] Clear all error:', err);
      showFeedback('Failed to clear screenshots.', 'error', 3000);
    }
  }

  // Render screenshot queue items with memory optimization
  function renderQueue(screenshots) {
    if (skeletonContainer) {
      skeletonContainer.classList.add('hidden');
    }

    const count = screenshots.length;
    queueCountEl.textContent = `${count} screenshot${count === 1 ? '' : 's'} waiting`;

    // Explicitly release previous image buffers in DOM before replacing
    const oldImages = queueList.querySelectorAll('img');
    oldImages.forEach(img => {
      img.src = '';
    });

    if (count === 0) {
      emptyState.classList.remove('hidden');
      queueList.innerHTML = '';
      queueFooter.classList.add('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    queueFooter.classList.remove('hidden');


    const fragment = document.createDocumentFragment();

    screenshots.forEach(item => {
      const row = document.createElement('div');
      row.className = 'queue-item';

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'queue-thumb-wrap';

      const thumb = document.createElement('img');
      thumb.className = 'queue-thumb';
      thumb.src = item.url;
      thumb.alt = item.filename;
      thumb.loading = 'lazy';
      thumbWrap.appendChild(thumb);

      const info = document.createElement('div');
      info.className = 'queue-info';

      const name = document.createElement('div');
      name.className = 'queue-filename';
      name.textContent = item.filename;

      const dims = document.createElement('div');
      dims.className = 'queue-dimensions';
      if (item.width && item.height) {
        dims.textContent = `${item.width} × ${item.height}`;
      } else {
        dims.textContent = 'Image file';
      }

      info.appendChild(name);
      info.appendChild(dims);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-delete';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => {
        deleteScreenshot(item.filename);
      });

      row.appendChild(thumbWrap);
      row.appendChild(info);
      row.appendChild(delBtn);

      fragment.appendChild(row);
    });

    queueList.innerHTML = '';
    queueList.appendChild(fragment);
  }

  // Fetch Screenshots (Polling Function)
  async function fetchScreenshots() {
    try {
      const res = await fetch('/screenshots');
      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const data = await res.json();
      setServerOffline(false);
      hasLoadedInitialQueue = true;

      const jsonString = JSON.stringify(data);
      if (jsonString !== lastKnownQueueJson) {
        lastKnownQueueJson = jsonString;
        renderQueue(data);
      }
    } catch (err) {
      console.error('[Droppy] Polling error:', err);
      setServerOffline(true);
      if (!hasLoadedInitialQueue && skeletonContainer) {
        skeletonContainer.classList.add('hidden');
        emptyState.classList.remove('hidden');
        emptyState.textContent = 'Unable to reach server';
      }
    }
  }

  // Attach Event Listeners
  function attachListeners() {
    selectBtn.addEventListener('click', () => {
      fileInput.click();
    });

    addMoreBtn.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFilesAdded(e.target.files);
      }
      fileInput.value = ''; // Reset so same files can be re-selected if needed
    });

    sendBtn.addEventListener('click', uploadSelectedFiles);
    cancelBtn.addEventListener('click', resetUploadUI);
    clearAllBtn.addEventListener('click', clearAllScreenshots);
  }

  function init() {
    initConnectionInfo();
    attachListeners();
    fetchScreenshots();
    setInterval(fetchScreenshots, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
