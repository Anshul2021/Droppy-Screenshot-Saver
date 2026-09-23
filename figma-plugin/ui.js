// Droppy - Screenshot Inbox (Figma Plugin Cloud Client)

(function () {
  'use strict';

  const MAX_FIGMA_DIMENSION = 4096;

  // DOM Elements
  const statusDot = document.getElementById('statusDot');
  const liveBadge = document.getElementById('liveBadge');
  const refreshBtn = document.getElementById('refreshBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const savePluginSettingsBtn = document.getElementById('savePluginSettingsBtn');
  const pluginSupabaseUrl = document.getElementById('pluginSupabaseUrl');
  const pluginSupabaseAnon = document.getElementById('pluginSupabaseAnon');
  const pluginVercelUrl = document.getElementById('pluginVercelUrl');

  const userBar = document.getElementById('userBar');
  const userBarEmail = document.getElementById('userBarEmail');
  const signOutBtn = document.getElementById('signOutBtn');

  const qrBanner = document.getElementById('qrBanner');
  const qrContainer = document.getElementById('qrContainer');
  const toggleQrBtn = document.getElementById('toggleQrBtn');
  const copyMobileLinkBtn = document.getElementById('copyMobileLinkBtn');

  const sectionConfig = document.getElementById('sectionConfig');
  const sectionTargetSelect = document.getElementById('sectionTargetSelect');
  const sectionNameInput = document.getElementById('sectionNameInput');

  const queueListContainer = document.getElementById('queueListContainer');
  const skeletonContainer = document.getElementById('skeletonContainer');
  const queueList = document.getElementById('queueList');
  const emptyState = document.getElementById('emptyState');

  const authView = document.getElementById('authView');
  const authGoogleBtn = document.getElementById('authGoogleBtn');
  const settingsView = document.getElementById('settingsView');

  const pluginFooter = document.getElementById('pluginFooter');
  const insertAllBtn = document.getElementById('insertAllBtn');
  const clearInboxBtn = document.getElementById('clearInboxBtn');

  const progressModal = document.getElementById('progressModal');
  const progressStatus = document.getElementById('progressStatus');
  const progressBarFill = document.getElementById('progressBarFill');

  // State
  let supabase = null;
  let currentUser = null;
  let realtimeChannel = null;
  let cachedScreenshots = [];
  let existingSections = [];
  let isBusy = false;
  let qrcodeInstance = null;

  // Helpers
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

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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

  // 1. Initialize Supabase Client
  function initSupabase() {
    const DEFAULT_SB_URL = 'https://rjhojopsuprvxldntwko.supabase.co';
    const DEFAULT_SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqaG9qb3BzdXBydnhsZG50d2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NjgxMzksImV4cCI6MjEwNTI0NDEzOX0.pFCK-9rlhIr-2241PiJiRnGQzvPNDkziwIRcFzyH_Pg';

    const sbUrl = localStorage.getItem('droppy_figma_supabase_url') || DEFAULT_SB_URL;
    const sbKey = localStorage.getItem('droppy_figma_supabase_anon') || DEFAULT_SB_KEY;
    const vUrl = localStorage.getItem('droppy_figma_vercel_url') || 'https://droppy-mu.vercel.app';

    pluginSupabaseUrl.value = sbUrl;
    pluginSupabaseAnon.value = sbKey;
    pluginVercelUrl.value = vUrl;

    if (!sbUrl || !sbKey) {
      showSettings();
      return false;
    }

    try {
      supabase = window.supabase.createClient(sbUrl, sbKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
      return true;
    } catch (err) {
      console.error('[Droppy Plugin] Error initializing Supabase:', err);
      return false;
    }
  }

  // 2. Auth State
  async function setupAuth() {
    if (!supabase) return;

    const { data: { session } } = await supabase.auth.getSession();
    handleSession(session);

    supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session);
    });
  }

  function handleSession(session) {
    if (session && session.user) {
      currentUser = session.user;
      authView.classList.add('hidden');
      settingsView.classList.add('hidden');
      userBar.classList.remove('hidden');
      qrBanner.classList.remove('hidden');
      sectionConfig.classList.remove('hidden');
      queueListContainer.classList.remove('hidden');
      pluginFooter.classList.remove('hidden');

      userBarEmail.textContent = currentUser.email || 'Connected';

      generateQrCode(session);
      subscribeToRealtime();
      fetchScreenshots();
      setOnline(true);
    } else {
      currentUser = null;
      authView.classList.remove('hidden');
      userBar.classList.add('hidden');
      qrBanner.classList.add('hidden');
      sectionConfig.classList.add('hidden');
      queueListContainer.classList.add('hidden');
      pluginFooter.classList.add('hidden');
      setOnline(false);

      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }
    }
  }

  // 3. QR Code Generation for Mobile Auto-Pairing
  function getMobilePairingUrl(session) {
    const vUrl = localStorage.getItem('droppy_figma_vercel_url') || 'https://droppy.vercel.app';
    const sbUrl = localStorage.getItem('droppy_figma_supabase_url') || '';
    const sbKey = localStorage.getItem('droppy_figma_supabase_anon') || '';

    const params = new URLSearchParams();
    if (session) {
      params.set('access_token', session.access_token);
      params.set('refresh_token', session.refresh_token);
    }
    if (sbUrl) params.set('supabase_url', sbUrl);
    if (sbKey) params.set('supabase_key', sbKey);

    return `${vUrl}?${params.toString()}`;
  }

  function generateQrCode(session) {
    if (!qrContainer) return;
    qrContainer.innerHTML = '';
    const mobileUrl = getMobilePairingUrl(session);

    try {
      qrcodeInstance = new QRCode(qrContainer, {
        text: mobileUrl,
        width: 64,
        height: 64,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } catch (err) {
      // Fallback to QR Server image if QRCode library fails
      qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=64x64&data=${encodeURIComponent(mobileUrl)}" alt="QR">`;
    }
  }

  copyMobileLinkBtn.addEventListener('click', () => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const link = getMobilePairingUrl(session);
      navigator.clipboard.writeText(link).then(() => {
        parent.postMessage({ pluginMessage: { type: 'notify', message: 'Mobile upload link copied to clipboard!' } }, '*');
      });
    });
  });

  toggleQrBtn.addEventListener('click', () => {
    const qrContent = document.getElementById('qrContent');
    if (qrContent.classList.contains('hidden')) {
      qrContent.classList.remove('hidden');
      toggleQrBtn.textContent = 'Hide';
    } else {
      qrContent.classList.add('hidden');
      toggleQrBtn.textContent = 'Show';
    }
  });

  // 4. Realtime Subscription
  function subscribeToRealtime() {
    if (!supabase || !currentUser) return;
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);

    realtimeChannel = supabase
      .channel('droppy-figma-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'droppy_screenshots',
          filter: `user_id=eq.${currentUser.id}`
        },
        () => {
          fetchScreenshots();
        }
      )
      .subscribe();
  }

  // 5. Fetch Screenshots
  async function fetchScreenshots() {
    if (!supabase || !currentUser || isBusy) return;

    try {
      skeletonContainer.classList.remove('hidden');

      const { data, error } = await supabase
        .from('droppy_screenshots')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      skeletonContainer.classList.add('hidden');
      if (error) throw error;

      cachedScreenshots = data || [];
      renderQueue();
    } catch (err) {
      skeletonContainer.classList.add('hidden');
      console.error('[Droppy Plugin] Error fetching screenshots:', err);
    }
  }

  function renderQueue() {
    queueList.innerHTML = '';
    const count = cachedScreenshots.length;
    insertAllBtn.textContent = `Insert All (${count})`;
    insertAllBtn.disabled = count === 0;

    if (count === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    cachedScreenshots.forEach((item) => {
      const el = document.createElement('div');
      el.className = 'queue-item';

      const timeStr = formatRelativeTime(item.created_at);
      const metaStr = `${item.width ? `${item.width}×${item.height}` : ''} ${item.size_bytes ? `• ${formatBytes(item.size_bytes)}` : ''} ${timeStr ? `• ${timeStr}` : ''}`.trim();

      el.innerHTML = `
        <div class="item-left">
          <img src="${item.public_url}" class="item-thumb" alt="${item.filename}" loading="lazy">
          <div class="item-info">
            <span class="item-name" title="${item.filename}">${item.filename}</span>
            <span class="item-meta">${metaStr}</span>
          </div>
        </div>
        <div class="item-actions">
          <button class="btn-insert" data-id="${item.id}">Insert</button>
          <button class="btn-delete-item" data-id="${item.id}" title="Delete">&times;</button>
        </div>
      `;

      el.querySelector('.btn-insert').addEventListener('click', () => {
        insertSingleScreenshot(item);
      });

      el.querySelector('.btn-delete-item').addEventListener('click', async () => {
        await deleteScreenshot(item);
      });

      queueList.appendChild(el);
    });
  }

  async function deleteScreenshot(item) {
    try {
      if (item.storage_path) {
        await supabase.storage.from('droppy-screenshots').remove([item.storage_path]);
      }
      await supabase.from('droppy_screenshots').delete().eq('id', item.id);
      fetchScreenshots();
    } catch (err) {
      console.error('[Droppy Plugin] Delete error:', err);
    }
  }

  // Clear Inbox
  clearInboxBtn.addEventListener('click', async () => {
    if (!currentUser || cachedScreenshots.length === 0) return;

    try {
      const paths = cachedScreenshots.map((i) => i.storage_path).filter(Boolean);
      if (paths.length > 0) {
        await supabase.storage.from('droppy-screenshots').remove(paths);
      }
      await supabase.from('droppy_screenshots').delete().eq('user_id', currentUser.id);
      fetchScreenshots();
      parent.postMessage({ pluginMessage: { type: 'notify', message: 'Cloud inbox cleared' } }, '*');
    } catch (err) {
      console.error('[Droppy Plugin] Clear inbox error:', err);
    }
  });

  // 6. Downscale & Image Processing for Figma Canvas
  function fetchAndProcessImage(url, maxDim = MAX_FIGMA_DIMENSION) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;

        if (w <= maxDim && h <= maxDim) {
          fetch(url)
            .then((res) => res.arrayBuffer())
            .then((buf) => resolve({ bytes: new Uint8Array(buf), width: w, height: h }))
            .catch(() => {
              // Offscreen canvas fallback
              const canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, w, h);
              canvas.toBlob((blob) => {
                blob.arrayBuffer().then((ab) => resolve({ bytes: new Uint8Array(ab), width: w, height: h }));
              }, 'image/png');
            });
          return;
        }

        // Downscale proportionally
        let scale = Math.min(maxDim / w, maxDim / h);
        let targetW = Math.round(w * scale);
        let targetH = Math.round(h * scale);

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetW, targetH);

        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Canvas blob conversion failed'));
          blob.arrayBuffer().then((ab) => resolve({ bytes: new Uint8Array(ab), width: targetW, height: targetH }));
        }, 'image/png');
      };
      img.onerror = () => reject(new Error('Failed to load image from URL'));
      img.src = url;
    });
  }

  // 7. Insert Actions
  function getSectionOptions() {
    const rawVal = sectionTargetSelect.value;
    let sectionOption = 'none';
    let targetSectionId = null;

    if (rawVal === 'new') {
      sectionOption = 'new';
    } else if (rawVal.startsWith('existing:')) {
      sectionOption = 'existing';
      targetSectionId = rawVal.replace('existing:', '');
    }

    const sectionName = sectionNameInput.value.trim() || undefined;
    return { sectionOption, targetSectionId, sectionName };
  }

  async function insertSingleScreenshot(item) {
    if (isBusy) return;
    isBusy = true;
    showProgress(`Loading ${item.filename}...`, 50);

    try {
      const processed = await fetchAndProcessImage(item.public_url);
      const sec = getSectionOptions();

      parent.postMessage(
        {
          pluginMessage: {
            type: 'insert',
            filename: item.filename,
            bytes: Array.from(processed.bytes),
            width: processed.width,
            height: processed.height,
            sectionOption: sec.sectionOption,
            targetSectionId: sec.targetSectionId,
            sectionName: sec.sectionName
          }
        },
        '*'
      );
    } catch (err) {
      console.error('[Droppy Plugin] Insert error:', err);
      parent.postMessage({ pluginMessage: { type: 'notify', message: `Failed to insert: ${err.message}`, isError: true } }, '*');
    } finally {
      hideProgress();
      isBusy = false;
    }
  }

  insertAllBtn.addEventListener('click', async () => {
    if (isBusy || cachedScreenshots.length === 0) return;
    isBusy = true;

    const total = cachedScreenshots.length;
    const items = [];
    showProgress(`Preparing ${total} screenshots...`, 10);

    for (let i = 0; i < total; i++) {
      const item = cachedScreenshots[i];
      const pct = Math.round(((i + 1) / total) * 90);
      showProgress(`Processing ${i + 1}/${total}: ${item.filename}`, pct);

      try {
        const processed = await fetchAndProcessImage(item.public_url);
        items.push({
          filename: item.filename,
          bytes: Array.from(processed.bytes),
          width: processed.width,
          height: processed.height
        });
      } catch (err) {
        console.error('[Droppy Plugin] Failed to process image:', item.filename, err);
      }
    }

    if (items.length === 0) {
      hideProgress();
      isBusy = false;
      parent.postMessage({ pluginMessage: { type: 'notify', message: 'No valid images could be processed', isError: true } }, '*');
      return;
    }

    showProgress('Creating Figma canvas section & layout...', 95);
    const sec = getSectionOptions();

    parent.postMessage(
      {
        pluginMessage: {
          type: 'insert-all',
          items,
          sectionOption: sec.sectionOption,
          targetSectionId: sec.targetSectionId,
          sectionName: sec.sectionName
        }
      },
      '*'
    );
  });

  // 8. Handle Messages from Figma Main Thread (code.js)
  window.onmessage = (event) => {
    const msg = event.data?.pluginMessage;
    if (!msg) return;

    if (msg.type === 'sections-list') {
      updateSectionsDropdown(msg.sections || []);
    }

    if (msg.type === 'insert-all-complete' || msg.type === 'insert-complete') {
      hideProgress();
      isBusy = false;
    }
  };

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
    optNone.textContent = '⚡ Free Canvas';
    sectionTargetSelect.appendChild(optNone);

    if (currentVal && Array.from(sectionTargetSelect.options).some((o) => o.value === currentVal)) {
      sectionTargetSelect.value = currentVal;
    }
  }

  // 9. Auth Actions
  const quickConnectBtn = document.getElementById('quickConnectBtn');

  if (quickConnectBtn) {
    quickConnectBtn.addEventListener('click', () => {
      let guestId = localStorage.getItem('droppy_guest_session_id');
      if (!guestId) {
        guestId = 'user_' + Math.random().toString(36).substring(2, 14);
        localStorage.setItem('droppy_guest_session_id', guestId);
      }
      currentUser = { id: guestId, email: 'Connected Device' };
      handleSession({ access_token: guestId, refresh_token: guestId, user: currentUser });
    });
  }

  authGoogleBtn.addEventListener('click', async () => {
    if (!supabase) {
      showSettings();
      return;
    }
    try {
      const vUrl = localStorage.getItem('droppy_figma_vercel_url') || 'https://droppy-mu.vercel.app';
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: vUrl,
          skipBrowserRedirect: true
        }
      });
      if (error) throw error;
      if (data && data.url) {
        parent.postMessage({ pluginMessage: { type: 'open-url', url: data.url } }, '*');
        parent.postMessage({ pluginMessage: { type: 'notify', message: 'Opening Google Sign-In in your browser...' } }, '*');
      }
    } catch (err) {
      console.error('[Droppy Plugin] Auth error:', err);
      parent.postMessage({ pluginMessage: { type: 'notify', message: `Sign in error: ${err.message}`, isError: true } }, '*');
    }
  });

  signOutBtn.addEventListener('click', async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  });

  refreshBtn.addEventListener('click', () => {
    fetchScreenshots();
    parent.postMessage({ pluginMessage: { type: 'get-sections' } }, '*');
  });

  // Settings
  function showSettings() {
    settingsView.classList.remove('hidden');
    authView.classList.add('hidden');
    queueListContainer.classList.add('hidden');
  }

  function hideSettings() {
    settingsView.classList.add('hidden');
    if (currentUser) {
      queueListContainer.classList.remove('hidden');
    } else {
      authView.classList.remove('hidden');
    }
  }

  settingsBtn.addEventListener('click', showSettings);
  closeSettingsBtn.addEventListener('click', hideSettings);

  savePluginSettingsBtn.addEventListener('click', () => {
    const url = pluginSupabaseUrl.value.trim();
    const anon = pluginSupabaseAnon.value.trim();
    const vUrl = pluginVercelUrl.value.trim() || 'https://droppy.vercel.app';

    if (!url || !anon) {
      parent.postMessage({ pluginMessage: { type: 'notify', message: 'Please provide Supabase URL and Anon Key', isError: true } }, '*');
      return;
    }

    localStorage.setItem('droppy_figma_supabase_url', url);
    localStorage.setItem('droppy_figma_supabase_anon', anon);
    localStorage.setItem('droppy_figma_vercel_url', vUrl);

    hideSettings();
    parent.postMessage({ pluginMessage: { type: 'notify', message: 'Cloud settings saved!' } }, '*');

    if (initSupabase()) {
      setupAuth();
    }
  });

  // Init
  parent.postMessage({ pluginMessage: { type: 'get-sections' } }, '*');
  if (initSupabase()) {
    setupAuth();
  }
})();
