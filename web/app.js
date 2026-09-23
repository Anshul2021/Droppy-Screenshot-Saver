// Droppy Cloud Web App Client
(function () {
  'use strict';

  // State
  let supabase = null;
  let currentUser = null;
  let selectedFiles = []; // [{ file, previewUrl, width, height, id }]
  let realtimeChannel = null;

  // DOM Elements
  const authContainer = document.getElementById('auth-container');
  const mainApp = document.getElementById('main-app');
  const userProfileBadge = document.getElementById('user-profile-badge');
  const userAvatar = document.getElementById('user-avatar');
  const userEmail = document.getElementById('user-email');
  const btnSignout = document.getElementById('btn-signout');
  const btnGoogleLogin = document.getElementById('btn-google-login');
  const emailLoginForm = document.getElementById('email-login-form');
  const inputEmail = document.getElementById('input-email');
  const pairBanner = document.getElementById('pair-banner');

  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const btnBrowse = document.getElementById('btn-browse');

  const previewSection = document.getElementById('preview-section');
  const previewGrid = document.getElementById('preview-grid');
  const skeletonGrid = document.getElementById('skeleton-grid');
  const selectedCountBadge = document.getElementById('selected-count-badge');
  const btnClearSelection = document.getElementById('btn-clear-selection');
  const btnUpload = document.getElementById('btn-upload');
  const progressContainer = document.getElementById('upload-progress-container');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressStatusText = document.getElementById('progress-status-text');
  const progressPercentageText = document.getElementById('progress-percentage-text');

  const cloudInboxSection = document.getElementById('cloud-inbox-section');
  const inboxGrid = document.getElementById('inbox-grid');
  const inboxCountBadge = document.getElementById('inbox-count-badge');
  const inboxEmptyState = document.getElementById('inbox-empty-state');
  const btnClearInbox = document.getElementById('btn-clear-inbox');

  const settingsModal = document.getElementById('settings-modal');
  const btnSettings = document.getElementById('btn-settings');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const cfgSupabaseUrl = document.getElementById('cfg-supabase-url');
  const cfgSupabaseAnon = document.getElementById('cfg-supabase-anon');
  const toastContainer = document.getElementById('toast-container');

  // Helper: Show Toast
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // Helper: Format Bytes
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // 1. Initialize Supabase Client
  function initSupabase() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlFromParam = urlParams.get('supabase_url');
    const keyFromParam = urlParams.get('supabase_key');

    if (urlFromParam && keyFromParam) {
      localStorage.setItem('droppy_supabase_url', urlFromParam);
      localStorage.setItem('droppy_supabase_anon_key', keyFromParam);
    }

    const sbUrl = localStorage.getItem('droppy_supabase_url') || (window.DROPPY_CONFIG && window.DROPPY_CONFIG.supabaseUrl) || '';
    const sbKey = localStorage.getItem('droppy_supabase_anon_key') || (window.DROPPY_CONFIG && window.DROPPY_CONFIG.supabaseAnonKey) || '';

    cfgSupabaseUrl.value = sbUrl;
    cfgSupabaseAnon.value = sbKey;

    if (!sbUrl || !sbKey) {
      // Need setup
      authContainer.classList.remove('hidden');
      mainApp.classList.add('hidden');
      showSettingsModal();
      showToast('Please enter your Supabase project credentials in Settings.', 'info');
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
      console.error('[Droppy] Failed to create Supabase client:', err);
      showToast('Error connecting to Supabase: ' + err.message, 'error');
      return false;
    }
  }

  // 2. Auth State Handler
  async function setupAuth() {
    if (!supabase) return;

    const urlParams = new URLSearchParams(window.location.search);
    const userIdFromParam = urlParams.get('user_id') || localStorage.getItem('droppy_paired_user_id');

    if (userIdFromParam) {
      localStorage.setItem('droppy_paired_user_id', userIdFromParam);
      currentUser = { id: userIdFromParam, email: 'Paired with Figma' };
      authContainer.classList.add('hidden');
      mainApp.classList.remove('hidden');
      pairBanner.classList.remove('hidden');
      userProfileBadge.classList.remove('hidden');
      userEmail.textContent = 'Paired with Figma';
      userAvatar.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${userIdFromParam}`;
      fetchInboxScreenshots();
      return;
    }

    // Check URL for session tokens
    const accessToken = urlParams.get('access_token');
    const refreshToken = urlParams.get('refresh_token');

    if (accessToken && refreshToken) {
      try {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        pairBanner.classList.remove('hidden');
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (err) {
        console.error('[Droppy] Error restoring session from link:', err);
      }
    }

    const { data: { session } } = await supabase.auth.getSession();
    handleSessionChange(session);

    supabase.auth.onAuthStateChange((_event, session) => {
      handleSessionChange(session);
    });
  }

  function handleSessionChange(session) {
    if (session && session.user) {
      currentUser = session.user;
      authContainer.classList.add('hidden');
      mainApp.classList.remove('hidden');
      userProfileBadge.classList.remove('hidden');
      userEmail.textContent = currentUser.email || 'Connected';
      userAvatar.src = currentUser.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.id}`;
      
      subscribeToRealtime();
      fetchInboxScreenshots();
    } else {
      currentUser = null;
      authContainer.classList.remove('hidden');
      mainApp.classList.add('hidden');
      userProfileBadge.classList.add('hidden');
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }
    }
  }

  // 3. Realtime Subscription
  function subscribeToRealtime() {
    if (!supabase || !currentUser) return;
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);

    realtimeChannel = supabase
      .channel('droppy-cloud-inbox')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'droppy_screenshots',
          filter: `user_id=eq.${currentUser.id}`
        },
        () => {
          fetchInboxScreenshots();
        }
      )
      .subscribe();
  }

  // 4. Fetch Inbox Screenshots
  async function fetchInboxScreenshots() {
    if (!supabase || !currentUser) return;

    try {
      const { data, error } = await supabase
        .from('droppy_screenshots')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      renderInboxGrid(data || []);
    } catch (err) {
      console.error('[Droppy] Error fetching inbox:', err);
    }
  }

  function renderInboxGrid(items) {
    inboxCountBadge.textContent = items.length;
    inboxGrid.innerHTML = '';

    if (items.length === 0) {
      inboxEmptyState.classList.remove('hidden');
      return;
    }

    inboxEmptyState.classList.add('hidden');

    items.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'screenshot-thumb-card';
      card.innerHTML = `
        <img src="${item.public_url}" alt="${item.filename}" loading="lazy">
        <div class="thumb-meta">
          <span>${item.width ? `${item.width}×${item.height}` : ''}</span>
          <span>${formatBytes(item.size_bytes)}</span>
        </div>
        <button class="thumb-delete-btn" title="Delete screenshot">&times;</button>
      `;

      card.querySelector('.thumb-delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteScreenshot(item);
      });

      inboxGrid.appendChild(card);
    });
  }

  async function deleteScreenshot(item) {
    try {
      // 1. Delete from Supabase Storage
      if (item.storage_path) {
        await supabase.storage.from('droppy-screenshots').remove([item.storage_path]);
      }
      // 2. Delete DB record
      const { error } = await supabase
        .from('droppy_screenshots')
        .delete()
        .eq('id', item.id);

      if (error) throw error;
      showToast('Screenshot removed', 'info');
      fetchInboxScreenshots();
    } catch (err) {
      showToast('Failed to delete: ' + err.message, 'error');
    }
  }

  // Clear Inbox (All user screenshots)
  btnClearInbox.addEventListener('click', async () => {
    if (!currentUser) return;
    if (!confirm('Are you sure you want to clear all screenshots from your cloud inbox?')) return;

    try {
      const { data: items } = await supabase
        .from('droppy_screenshots')
        .select('id, storage_path')
        .eq('user_id', currentUser.id);

      if (items && items.length > 0) {
        const paths = items.map((i) => i.storage_path).filter(Boolean);
        if (paths.length > 0) {
          await supabase.storage.from('droppy-screenshots').remove(paths);
        }
        await supabase.from('droppy_screenshots').delete().eq('user_id', currentUser.id);
      }

      showToast('Cloud inbox cleared', 'success');
      fetchInboxScreenshots();
    } catch (err) {
      showToast('Error clearing inbox: ' + err.message, 'error');
    }
  });

  // 5. File Selection & Drag-and-Drop
  function triggerFileInput() {
    fileInput.value = '';
    fileInput.click();
  }

  dropZone.addEventListener('click', (e) => {
    if (e.target.closest('button') !== btnBrowse && e.target !== dropZone && !e.target.closest('.upload-art') && !e.target.closest('.upload-heading')) return;
    triggerFileInput();
  });
  btnBrowse.addEventListener('click', (e) => {
    e.stopPropagation();
    triggerFileInput();
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFiles(Array.from(files));
    }
  });

  fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(Array.from(files));
    }
  });

  function handleFiles(files) {
    const validImages = files.filter((f) => f.type.startsWith('image/'));
    if (validImages.length === 0) {
      showToast('Please select valid image files', 'error');
      return;
    }

    skeletonGrid.classList.remove('hidden');
    previewSection.classList.remove('hidden');

    let loadedCount = 0;
    validImages.forEach((file) => {
      const previewUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        selectedFiles.push({
          id: Math.random().toString(36).substring(2, 9),
          file,
          previewUrl,
          width: img.naturalWidth || 800,
          height: img.naturalHeight || 600
        });
        loadedCount++;
        if (loadedCount === validImages.length) {
          skeletonGrid.classList.add('hidden');
          renderPreviews();
        }
      };
      img.onerror = () => {
        loadedCount++;
        if (loadedCount === validImages.length) {
          skeletonGrid.classList.add('hidden');
          renderPreviews();
        }
      };
      img.src = previewUrl;
    });
  }

  function renderPreviews() {
    previewGrid.innerHTML = '';
    selectedCountBadge.textContent = selectedFiles.length;

    if (selectedFiles.length === 0) {
      previewSection.classList.add('hidden');
      return;
    }

    previewSection.classList.remove('hidden');

    selectedFiles.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'screenshot-thumb-card';
      card.innerHTML = `
        <img src="${item.previewUrl}" alt="${item.file.name}">
        <div class="thumb-meta">
          <span>${item.width}×${item.height}</span>
          <span>${formatBytes(item.file.size)}</span>
        </div>
        <button class="thumb-delete-btn" title="Remove">&times;</button>
      `;

      card.querySelector('.thumb-delete-btn').addEventListener('click', () => {
        URL.revokeObjectURL(item.previewUrl);
        selectedFiles.splice(index, 1);
        renderPreviews();
      });

      previewGrid.appendChild(card);
    });
  }

  btnClearSelection.addEventListener('click', () => {
    selectedFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    selectedFiles = [];
    renderPreviews();
  });

  // 6. Direct Upload to Supabase Storage & Database
  btnUpload.addEventListener('click', async () => {
    if (!supabase || !currentUser) {
      showToast('Please sign in to upload', 'error');
      return;
    }

    if (selectedFiles.length === 0) {
      showToast('No screenshots selected', 'error');
      return;
    }

    btnUpload.disabled = true;
    progressContainer.classList.remove('hidden');
    const total = selectedFiles.length;
    let completed = 0;

    for (let i = 0; i < total; i++) {
      const item = selectedFiles[i];
      const progressPct = Math.round((i / total) * 100);
      progressBarFill.style.width = `${progressPct}%`;
      progressPercentageText.textContent = `${progressPct}%`;
      progressStatusText.textContent = `Uploading ${i + 1} of ${total}...`;

      try {
        const cleanName = item.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${currentUser.id}/${Date.now()}_${cleanName}`;

        // 1. Upload to Supabase Storage Bucket
        const { error: uploadErr } = await supabase.storage
          .from('droppy-screenshots')
          .upload(storagePath, item.file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadErr) throw uploadErr;

        // 2. Get Public URL
        const { data: { publicUrl } } = supabase.storage
          .from('droppy-screenshots')
          .getPublicUrl(storagePath);

        // 3. Insert record into droppy_screenshots
        const { error: dbErr } = await supabase
          .from('droppy_screenshots')
          .insert({
            user_id: currentUser.id,
            filename: item.file.name,
            storage_path: storagePath,
            public_url: publicUrl,
            width: item.width,
            height: item.height,
            size_bytes: item.file.size
          });

        if (dbErr) throw dbErr;
        completed++;
      } catch (err) {
        console.error('[Droppy] Upload error for item:', item.file.name, err);
        showToast(`Failed to upload ${item.file.name}: ${err.message}`, 'error');
      }
    }

    progressBarFill.style.width = '100%';
    progressPercentageText.textContent = '100%';
    progressStatusText.textContent = `Uploaded ${completed} screenshot${completed > 1 ? 's' : ''}!`;

    // Revoke object URLs and clear selection
    selectedFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    selectedFiles = [];
    renderPreviews();

    showToast(`Successfully uploaded ${completed} screenshot${completed > 1 ? 's' : ''} to Figma!`, 'success');

    setTimeout(() => {
      progressContainer.classList.add('hidden');
      btnUpload.disabled = false;
    }, 1500);

    fetchInboxScreenshots();
  });

  // 7. Auth Actions
  btnGoogleLogin.addEventListener('click', async () => {
    if (!supabase) return;
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (err) {
      showToast('Google login error: ' + err.message, 'error');
    }
  });

  emailLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = inputEmail.value.trim();
    if (!email || !supabase) return;

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin
        }
      });
      if (error) throw error;
      showToast('Magic login link sent to your email!', 'success');
      inputEmail.value = '';
    } catch (err) {
      showToast('Sign in error: ' + err.message, 'error');
    }
  });

  btnSignout.addEventListener('click', async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    showToast('Signed out', 'info');
  });

  // 8. Settings Modal
  function showSettingsModal() {
    settingsModal.classList.remove('hidden');
  }

  function hideSettingsModal() {
    settingsModal.classList.add('hidden');
  }

  btnSettings.addEventListener('click', showSettingsModal);
  btnCloseSettings.addEventListener('click', hideSettingsModal);

  btnSaveSettings.addEventListener('click', () => {
    const url = cfgSupabaseUrl.value.trim();
    const anon = cfgSupabaseAnon.value.trim();

    if (!url || !anon) {
      showToast('Please enter both Supabase URL and Anon Key', 'error');
      return;
    }

    localStorage.setItem('droppy_supabase_url', url);
    localStorage.setItem('droppy_supabase_anon_key', anon);
    hideSettingsModal();
    showToast('Settings saved! Connecting...', 'success');

    if (initSupabase()) {
      setupAuth();
    }
  });

  // Startup
  if (initSupabase()) {
    setupAuth();
  }
})();
