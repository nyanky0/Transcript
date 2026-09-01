/**
 * LiveVoice AI — Live Transcribe & Multi-Model Intelligence Router
 * Supports Web Speech API live streaming, Gemini Audio-In Multimodal,
 * Multi-Device Microphone/Desktop Audio Routing, Audio File Upload & History Management.
 */

// --- CONFIGURATION & STATE ---
const DEFAULT_CONFIG = {
  geminiApiKey: '',
  geminiModel: 'gemini-3.5-flash-lite',
  cfrouterBaseUrl: 'https://api.openai.com/v1',
  cfrouterApiKey: '',
  cfrouterModel: 'deepseek-v4-flash-0731',
  customModelName: '',
  activeModel: 'gemini-3.5-flash-lite',
  activeMode: 'live-speech', // 'live-speech' or 'direct-audio'
  language: 'id-ID',
  autoPolish: false
};

const state = {
  config: { ...DEFAULT_CONFIG },
  isRecording: false,
  startTime: null,
  timerInterval: null,
  transcriptSegments: [], // Array of { id, time, text, isFinal }
  rawInterimText: '',
  audioContext: null,
  analyser: null,
  mediaStream: null,
  mediaRecorder: null,
  audioChunks: [],
  speechRecognition: null,
  silenceTimer: null,
  lastAIResult: '',
  
  // Audio Sources
  audioSourceType: 'mic', // 'mic' | 'desktop' | 'mix'
  selectedMicDeviceId: 'default',
  desktopStream: null,
  micStream: null,
  availableAudioDevices: [],

  // Upload File State
  uploadedFile: null,
  uploadedAudioBase64: null,
  uploadedDurationStr: '00:00',
  uploadedResultMarkdown: '',

  // History State
  historyList: []
};

// --- DOM ELEMENTS ---
const elements = {
  // Navigation & Tabs
  tabNavLive: document.getElementById('tabNavLive'),
  tabNavUpload: document.getElementById('tabNavUpload'),
  tabNavHistory: document.getElementById('tabNavHistory'),
  historyCountBadge: document.getElementById('historyCountBadge'),
  
  viewLiveTranscribe: document.getElementById('viewLiveTranscribe'),
  viewUploadAudio: document.getElementById('viewUploadAudio'),
  viewHistory: document.getElementById('viewHistory'),

  // Header & Model Selector
  activeModelSelect: document.getElementById('activeModelSelect'),
  modelProviderBadge: document.getElementById('modelProviderBadge'),
  btnOpenSettings: document.getElementById('btnOpenSettings'),
  
  // Audio Source Elements
  srcTypeMic: document.getElementById('srcTypeMic'),
  srcTypeDesktop: document.getElementById('srcTypeDesktop'),
  srcTypeMix: document.getElementById('srcTypeMix'),
  micSourceControls: document.getElementById('micSourceControls'),
  desktopSourceControls: document.getElementById('desktopSourceControls'),
  micDeviceSelect: document.getElementById('micDeviceSelect'),
  btnRefreshAudioDevices: document.getElementById('btnRefreshAudioDevices'),
  btnSelectDesktopAudio: document.getElementById('btnSelectDesktopAudio'),
  desktopCaptureStatus: document.getElementById('desktopCaptureStatus'),

  // Status & Mode
  liveStatusBadge: document.getElementById('liveStatusBadge'),
  speechLangSelect: document.getElementById('speechLangSelect'),
  modeLiveSpeech: document.getElementById('modeLiveSpeech'),
  modeDirectAudio: document.getElementById('modeDirectAudio'),
  engineBadgeText: document.getElementById('engineBadgeText'),
  
  // Recording & Visualizer
  btnToggleRecord: document.getElementById('btnToggleRecord'),
  recordIcon: document.getElementById('recordIcon'),
  recordBtnText: document.getElementById('recordBtnText'),
  recordTimer: document.getElementById('recordTimer'),
  audioVisualizer: document.getElementById('audioVisualizer'),
  volumeLevelBar: document.getElementById('volumeLevelBar'),
  
  // Actions & Output (Live)
  btnSaveLiveToHistory: document.getElementById('btnSaveLiveToHistory'),
  btnClearTranscript: document.getElementById('btnClearTranscript'),
  btnCopyTranscript: document.getElementById('btnCopyTranscript'),
  btnExportTranscript: document.getElementById('btnExportTranscript'),
  transcriptOutput: document.getElementById('transcriptOutput'),
  directAudioProgress: document.getElementById('directAudioProgress'),
  btnProcessDirectAudio: document.getElementById('btnProcessDirectAudio'),
  
  // Footer Stats
  wordCountBadge: document.getElementById('wordCountBadge'),
  charCountBadge: document.getElementById('charCountBadge'),
  lastProcessedBadge: document.getElementById('lastProcessedBadge'),
  
  // AI Panel
  btnPolishText: document.getElementById('btnPolishText'),
  btnSummarize: document.getElementById('btnSummarize'),
  btnActionItems: document.getElementById('btnActionItems'),
  btnCustomPrompt: document.getElementById('btnCustomPrompt'),
  customPromptBox: document.getElementById('customPromptBox'),
  customPromptInput: document.getElementById('customPromptInput'),
  btnRunCustomPrompt: document.getElementById('btnRunCustomPrompt'),
  aiResultTitle: document.getElementById('aiResultTitle'),
  aiModelUsedBadge: document.getElementById('aiModelUsedBadge'),
  aiOutputContent: document.getElementById('aiOutputContent'),
  aiLoadingOverlay: document.getElementById('aiLoadingOverlay'),
  aiLoadingMessage: document.getElementById('aiLoadingMessage'),
  btnCopyAIResult: document.getElementById('btnCopyAIResult'),
  btnClearAIResult: document.getElementById('btnClearAIResult'),
  btnApplyPolishToTranscript: document.getElementById('btnApplyPolishToTranscript'),
  autoPolishToggle: document.getElementById('autoPolishToggle'),

  // Upload View Elements
  audioDropzone: document.getElementById('audioDropzone'),
  audioFileInput: document.getElementById('audioFileInput'),
  btnBrowseAudio: document.getElementById('btnBrowseAudio'),
  uploadedFileCard: document.getElementById('uploadedFileCard'),
  uploadedFileName: document.getElementById('uploadedFileName'),
  uploadedFileSize: document.getElementById('uploadedFileSize'),
  uploadedFileDuration: document.getElementById('uploadedFileDuration'),
  uploadedFileType: document.getElementById('uploadedFileType'),
  btnRemoveUploadedFile: document.getElementById('btnRemoveUploadedFile'),
  uploadedAudioPlayer: document.getElementById('uploadedAudioPlayer'),
  uploadModelSelect: document.getElementById('uploadModelSelect'),
  uploadTaskModeSelect: document.getElementById('uploadTaskModeSelect'),
  btnStartUploadTranscribe: document.getElementById('btnStartUploadTranscribe'),
  uploadProgressContainer: document.getElementById('uploadProgressContainer'),
  uploadProgressStatusText: document.getElementById('uploadProgressStatusText'),
  uploadProgressPercent: document.getElementById('uploadProgressPercent'),
  uploadProgressBarFill: document.getElementById('uploadProgressBarFill'),
  uploadResultContent: document.getElementById('uploadResultContent'),
  uploadResultTag: document.getElementById('uploadResultTag'),
  btnCopyUploadResult: document.getElementById('btnCopyUploadResult'),
  btnExportUploadResult: document.getElementById('btnExportUploadResult'),

  // History View Elements
  historyTotalBadge: document.getElementById('historyTotalBadge'),
  historySearchInput: document.getElementById('historySearchInput'),
  btnClearAllHistory: document.getElementById('btnClearAllHistory'),
  historyListContainer: document.getElementById('historyListContainer'),
  
  // Modals & Settings
  settingsModal: document.getElementById('settingsModal'),
  btnCloseSettings: document.getElementById('btnCloseSettings'),
  btnSaveSettings: document.getElementById('btnSaveSettings'),
  btnResetSettings: document.getElementById('btnResetSettings'),
  geminiApiKey: document.getElementById('geminiApiKey'),
  geminiDefaultModel: document.getElementById('geminiDefaultModel'),
  cfrouterBaseUrl: document.getElementById('cfrouterBaseUrl'),
  cfrouterApiKey: document.getElementById('cfrouterApiKey'),
  customModelNameInput: document.getElementById('customModelNameInput'),
  
  // Export Modal
  exportModal: document.getElementById('exportModal'),
  btnCloseExport: document.getElementById('btnCloseExport'),
  toastContainer: document.getElementById('toastContainer')
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
  loadConfig();
  initLucideIcons();
  setupEventListeners();
  setupSpeechRecognition();
  updateModelUI();
  enumerateMicrophones();
  await refreshHistoryList();
});

function initLucideIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// --- LOCAL STORAGE & CONFIGURATION ---
function loadConfig() {
  try {
    const saved = localStorage.getItem('livevoice_config');
    if (saved) {
      state.config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Error loading config:', e);
  }
  
  // Apply saved values to UI inputs
  elements.geminiApiKey.value = state.config.geminiApiKey || '';
  elements.geminiDefaultModel.value = state.config.geminiModel || 'gemini-3.5-flash-lite';
  elements.cfrouterBaseUrl.value = state.config.cfrouterBaseUrl || 'https://api.openai.com/v1';
  elements.cfrouterApiKey.value = state.config.cfrouterApiKey || '';
  elements.customModelNameInput.value = state.config.customModelName || '';
  elements.speechLangSelect.value = state.config.language || 'id-ID';
  elements.autoPolishToggle.checked = !!state.config.autoPolish;
  
  // Set active model dropdown
  if (state.config.activeModel) {
    const optionExists = Array.from(elements.activeModelSelect.options).some(o => o.value === state.config.activeModel);
    if (optionExists) {
      elements.activeModelSelect.value = state.config.activeModel;
    } else {
      elements.activeModelSelect.value = 'custom';
    }
  }
}

function saveConfig() {
  state.config.geminiApiKey = elements.geminiApiKey.value.trim();
  state.config.geminiModel = elements.geminiDefaultModel.value;
  state.config.cfrouterBaseUrl = elements.cfrouterBaseUrl.value.trim().replace(/\/+$/, '');
  state.config.cfrouterApiKey = elements.cfrouterApiKey.value.trim();
  state.config.customModelName = elements.customModelNameInput.value.trim();
  state.config.language = elements.speechLangSelect.value;
  state.config.autoPolish = elements.autoPolishToggle.checked;
  state.config.activeModel = elements.activeModelSelect.value;
  
  localStorage.setItem('livevoice_config', JSON.stringify(state.config));
  updateModelUI();
  showToast('Pengaturan berhasil disimpan!', 'success');
}

// --- VIEW NAVIGATION TABS ---
function switchView(viewName) {
  const views = {
    viewLiveTranscribe: { btn: elements.tabNavLive, el: elements.viewLiveTranscribe },
    viewUploadAudio: { btn: elements.tabNavUpload, el: elements.viewUploadAudio },
    viewHistory: { btn: elements.tabNavHistory, el: elements.viewHistory }
  };

  Object.keys(views).forEach(key => {
    const isTarget = key === viewName;
    views[key].btn.classList.toggle('active', isTarget);
    views[key].el.classList.toggle('active', isTarget);
    views[key].el.classList.toggle('hidden', !isTarget);
  });

  if (viewName === 'viewHistory') {
    refreshHistoryList();
  }
  initLucideIcons();
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
  // Top App Navigation Tabs
  elements.tabNavLive.addEventListener('click', () => switchView('viewLiveTranscribe'));
  elements.tabNavUpload.addEventListener('click', () => switchView('viewUploadAudio'));
  elements.tabNavHistory.addEventListener('click', () => switchView('viewHistory'));

  // Audio Source Type Pills
  elements.srcTypeMic.addEventListener('click', () => switchAudioSourceType('mic'));
  elements.srcTypeDesktop.addEventListener('click', () => switchAudioSourceType('desktop'));
  elements.srcTypeMix.addEventListener('click', () => switchAudioSourceType('mix'));

  // Mic Device Dropdown & Refresh
  elements.micDeviceSelect.addEventListener('change', (e) => {
    state.selectedMicDeviceId = e.target.value;
    showToast(`Driver mikrofon dipilih: ${elements.micDeviceSelect.selectedOptions[0]?.text || 'Default'}`, 'info');
    if (state.isRecording) {
      restartAudioCaptureOnDeviceChange();
    }
  });
  elements.btnRefreshAudioDevices.addEventListener('click', () => {
    enumerateMicrophones(true);
  });

  // Desktop Sound Picker Button
  elements.btnSelectDesktopAudio.addEventListener('click', selectDesktopAudioSource);

  // Toggle Recording
  elements.btnToggleRecord.addEventListener('click', toggleRecording);
  
  // Model Selector
  elements.activeModelSelect.addEventListener('change', (e) => {
    state.config.activeModel = e.target.value;
    if (e.target.value === 'custom' && !state.config.customModelName) {
      openSettingsModal('tab-cfrouter');
      showToast('Silakan masukkan nama custom model Anda di Pengaturan.', 'info');
    } else {
      saveConfig();
    }
    updateModelUI();
  });
  
  // Language Change
  elements.speechLangSelect.addEventListener('change', (e) => {
    state.config.language = e.target.value;
    if (state.speechRecognition) {
      state.speechRecognition.lang = state.config.language;
    }
    saveConfig();
    showToast(`Bahasa diubah ke ${elements.speechLangSelect.selectedOptions[0].text}`, 'info');
  });

  // Mode Selection Pills
  elements.modeLiveSpeech.addEventListener('click', () => switchMode('live-speech'));
  elements.modeDirectAudio.addEventListener('click', () => switchMode('direct-audio'));

  // Quick Action Buttons
  elements.btnSaveLiveToHistory.addEventListener('click', () => saveCurrentLiveSessionToHistory());
  elements.btnClearTranscript.addEventListener('click', clearTranscript);
  elements.btnCopyTranscript.addEventListener('click', copyTranscript);
  elements.btnExportTranscript.addEventListener('click', openExportModal);
  elements.btnProcessDirectAudio.addEventListener('click', processDirectAudioWithGemini);

  // AI Action Buttons
  elements.btnPolishText.addEventListener('click', () => handleAIAction('polish'));
  elements.btnSummarize.addEventListener('click', () => handleAIAction('summarize'));
  elements.btnActionItems.addEventListener('click', () => handleAIAction('action-items'));
  elements.btnCustomPrompt.addEventListener('click', () => {
    elements.customPromptBox.classList.toggle('hidden');
    if (!elements.customPromptBox.classList.contains('hidden')) {
      elements.customPromptInput.focus();
    }
  });
  elements.btnRunCustomPrompt.addEventListener('click', () => {
    const prompt = elements.customPromptInput.value.trim();
    if (!prompt) {
      showToast('Ketik instruksi prompt terlebih dahulu.', 'error');
      return;
    }
    handleAIAction('custom', prompt);
  });

  // AI Output Card Actions
  elements.btnCopyAIResult.addEventListener('click', copyAIResult);
  elements.btnClearAIResult.addEventListener('click', clearAIResult);
  elements.btnApplyPolishToTranscript.addEventListener('click', applyPolishToTranscript);
  elements.autoPolishToggle.addEventListener('change', (e) => {
    state.config.autoPolish = e.target.checked;
    saveConfig();
  });

  // Upload View Setup
  setupUploadEventListeners();

  // History Search & Clear
  elements.historySearchInput.addEventListener('input', (e) => {
    renderHistoryCards(e.target.value.trim().toLowerCase());
  });
  elements.btnClearAllHistory.addEventListener('click', clearAllHistory);

  // Settings Modal Events
  elements.btnOpenSettings.addEventListener('click', () => openSettingsModal());
  elements.btnCloseSettings.addEventListener('click', closeSettingsModal);
  elements.btnSaveSettings.addEventListener('click', () => {
    saveConfig();
    closeSettingsModal();
  });
  elements.btnResetSettings.addEventListener('click', resetSettingsToDefault);

  // Settings Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId)?.classList.add('active');
    });
  });

  // Password Visibility Toggles
  document.querySelectorAll('.btn-toggle-pwd').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
      }
    });
  });

  // Export Modal Events
  elements.btnCloseExport.addEventListener('click', closeExportModal);
  document.querySelectorAll('.export-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const format = btn.getAttribute('data-format');
      exportTranscript(format);
      closeExportModal();
    });
  });

  // Close modals on backdrop click
  window.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) closeSettingsModal();
    if (e.target === elements.exportModal) closeExportModal();
  });
}

function updateModelUI() {
  const model = getEffectiveModel();
  const isGoogle = isGoogleModel(model);
  
  elements.modelProviderBadge.className = `provider-badge ${isGoogle ? 'google' : 'cfrouter'}`;
  elements.modelProviderBadge.textContent = isGoogle ? 'Google AI' : 'CFRouter / API';
  elements.engineBadgeText.textContent = `Engine: ${model}`;
}

function getEffectiveModel() {
  const selected = elements.activeModelSelect.value;
  if (selected === 'custom') {
    return state.config.customModelName || 'custom-model';
  }
  return selected;
}

function isGoogleModel(modelName) {
  return modelName.startsWith('gemini') || modelName.includes('google');
}

function switchMode(mode) {
  state.activeMode = mode;
  elements.modeLiveSpeech.classList.toggle('active', mode === 'live-speech');
  elements.modeDirectAudio.classList.toggle('active', mode === 'direct-audio');

  if (mode === 'direct-audio') {
    elements.directAudioProgress.classList.remove('hidden');
    showToast('Mode Gemini Audio-In: Merekam file audio langsung untuk Gemini Multimodal.', 'info');
  } else {
    elements.directAudioProgress.classList.add('hidden');
    showToast('Mode Realtime STT: Menggunakan browser Speech Recognition live.', 'info');
  }
}

// --- AUDIO DEVICE ENUMERATION & MULTI-SOURCE ROUTING ---

async function enumerateMicrophones(isManualRefresh = false) {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      console.warn('enumerateDevices not supported in this browser.');
      return;
    }

    let devices = await navigator.mediaDevices.enumerateDevices();
    const hasLabels = devices.some(d => d.kind === 'audioinput' && d.label);
    
    if (!hasLabels && !state.isRecording) {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        devices = await navigator.mediaDevices.enumerateDevices();
        tempStream.getTracks().forEach(t => t.stop());
      } catch (e) {
        console.log('Permission not granted yet for full device labels.');
      }
    }

    const audioInputs = devices.filter(d => d.kind === 'audioinput');
    state.availableAudioDevices = audioInputs;

    elements.micDeviceSelect.innerHTML = '';
    
    if (audioInputs.length === 0) {
      const opt = document.createElement('option');
      opt.value = 'default';
      opt.text = 'Default Microphone';
      elements.micDeviceSelect.appendChild(opt);
    } else {
      audioInputs.forEach((device, idx) => {
        const opt = document.createElement('option');
        opt.value = device.deviceId;
        opt.text = device.label || `Microphone ${idx + 1} (${device.deviceId.slice(0, 8)}...)`;
        if (device.deviceId === state.selectedMicDeviceId || (idx === 0 && state.selectedMicDeviceId === 'default')) {
          opt.selected = true;
        }
        elements.micDeviceSelect.appendChild(opt);
      });
    }

    if (isManualRefresh) {
      showToast(`Ditemukan ${audioInputs.length} perangkat mikrofon.`, 'success');
    }
  } catch (err) {
    console.error('Error enumerating audio devices:', err);
  }
}

function switchAudioSourceType(type) {
  state.audioSourceType = type;
  
  elements.srcTypeMic.classList.toggle('active', type === 'mic');
  elements.srcTypeDesktop.classList.toggle('active', type === 'desktop');
  elements.srcTypeMix.classList.toggle('active', type === 'mix');

  if (type === 'mic') {
    elements.micSourceControls.classList.remove('hidden');
    elements.desktopSourceControls.classList.add('hidden');
    showToast('Sumber Audio: Mikrofon PC / Driver Terpilih', 'info');
  } else if (type === 'desktop') {
    elements.micSourceControls.classList.add('hidden');
    elements.desktopSourceControls.classList.remove('hidden');
    showToast('Sumber Audio: Desktop / Aplikasi Tertentu (OBS, Zoom, Spotify, dll.)', 'info');
  } else if (type === 'mix') {
    elements.micSourceControls.classList.remove('hidden');
    elements.desktopSourceControls.classList.remove('hidden');
    showToast('Sumber Audio: MIX (Mikrofon + Suara Desktop/Aplikasi)', 'info');
  }

  if (state.isRecording) {
    restartAudioCaptureOnDeviceChange();
  }
}

async function selectDesktopAudioSource() {
  try {
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: 640,
        height: 360,
        frameRate: 10
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    const audioTracks = displayStream.getAudioTracks();
    if (audioTracks.length === 0) {
      displayStream.getTracks().forEach(t => t.stop());
      showToast('PERINGATAN: Pastikan Anda mencentang opsi "Share audio" / "Bagikan audio sistem" saat memilih layar/jendela aplikasi!', 'error');
      return;
    }

    if (state.desktopStream) {
      state.desktopStream.getTracks().forEach(t => t.stop());
    }

    state.desktopStream = displayStream;

    audioTracks[0].onended = () => {
      elements.desktopCaptureStatus.className = 'desktop-status-tag';
      elements.desktopCaptureStatus.innerHTML = '<i data-lucide="volume-x" class="icon-xs"></i> Tidak Aktif';
      initLucideIcons();
      showToast('Berbagi suara desktop dihentikan.', 'info');
      state.desktopStream = null;
      if (state.isRecording && state.audioSourceType === 'desktop') {
        stopRecording();
      }
    };

    const videoTrack = displayStream.getVideoTracks()[0];
    const sourceLabel = videoTrack ? videoTrack.label : 'Desktop Audio';
    
    elements.desktopCaptureStatus.className = 'desktop-status-tag active';
    elements.desktopCaptureStatus.innerHTML = `<i data-lucide="volume-2" class="icon-xs"></i> Aktif: ${escapeHtml(sourceLabel.slice(0, 20))}...`;
    initLucideIcons();

    showToast(`Berhasil menghubungkan audio: ${sourceLabel}`, 'success');

    if (state.isRecording) {
      restartAudioCaptureOnDeviceChange();
    }
  } catch (err) {
    if (err.name !== 'NotAllowedError') {
      console.error('Error capturing desktop audio:', err);
      showToast('Gagal menangkap suara desktop: ' + err.message, 'error');
    }
  }
}

// --- AUDIO STREAM PIPELINE & VISUALIZER ---

async function startAudioCapture() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContextClass();

    let finalStream = null;
    const type = state.audioSourceType;

    // 1. Capture Microphone if needed
    if (type === 'mic' || type === 'mix') {
      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      };
      
      if (state.selectedMicDeviceId && state.selectedMicDeviceId !== 'default') {
        audioConstraints.deviceId = { exact: state.selectedMicDeviceId };
      }

      state.micStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false
      });
    }

    // 2. Capture or Verify Desktop Stream if needed
    if (type === 'desktop' || type === 'mix') {
      if (!state.desktopStream || state.desktopStream.getAudioTracks().length === 0) {
        showToast('Pilih layar atau aplikasi yang ingin diambil suaranya...', 'info');
        await selectDesktopAudioSource();
        if (!state.desktopStream) {
          throw new Error('Suara desktop belum dipilih. Centang "Bagikan audio".');
        }
      }
    }

    // 3. Routing Streams
    if (type === 'mic') {
      finalStream = state.micStream;
    } else if (type === 'desktop') {
      finalStream = new MediaStream(state.desktopStream.getAudioTracks());
    } else if (type === 'mix') {
      const destination = state.audioContext.createMediaStreamDestination();
      
      if (state.micStream && state.micStream.getAudioTracks().length > 0) {
        const micSource = state.audioContext.createMediaStreamSource(state.micStream);
        const micGain = state.audioContext.createGain();
        micGain.gain.value = 1.0;
        micSource.connect(micGain);
        micGain.connect(destination);
      }

      if (state.desktopStream && state.desktopStream.getAudioTracks().length > 0) {
        const deskAudioStream = new MediaStream(state.desktopStream.getAudioTracks());
        const deskSource = state.audioContext.createMediaStreamSource(deskAudioStream);
        const deskGain = state.audioContext.createGain();
        deskGain.gain.value = 1.0;
        deskSource.connect(deskGain);
        deskGain.connect(destination);
      }

      finalStream = destination.stream;
    }

    state.mediaStream = finalStream;

    const sourceNode = state.audioContext.createMediaStreamSource(finalStream);
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 256;
    sourceNode.connect(state.analyser);

    drawVisualizer();

    state.audioChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
    state.mediaRecorder = new MediaRecorder(finalStream, { mimeType });
    
    state.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        state.audioChunks.push(e.data);
      }
    };
    
    state.mediaRecorder.start(1000);
    return true;
  } catch (err) {
    console.error('Error starting audio capture pipeline:', err);
    showToast('Gagal memulai audio: ' + err.message, 'error');
    stopAudioCapture();
    return false;
  }
}

function stopAudioCapture() {
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    try { state.mediaRecorder.stop(); } catch (e) {}
  }
  if (state.micStream) {
    state.micStream.getTracks().forEach(t => t.stop());
    state.micStream = null;
  }
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach(t => t.stop());
    state.mediaStream = null;
  }
  if (state.audioContext && state.audioContext.state !== 'closed') {
    try { state.audioContext.close(); } catch (e) {}
    state.audioContext = null;
  }
  elements.volumeLevelBar.style.width = '0%';
}

async function restartAudioCaptureOnDeviceChange() {
  if (!state.isRecording) return;
  stopAudioCapture();
  const ok = await startAudioCapture();
  if (ok) {
    showToast('Sumber audio berhasil dialihkan live!', 'success');
  }
}

function drawVisualizer() {
  const canvas = elements.audioVisualizer;
  const ctx = canvas.getContext('2d');
  
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  
  const bufferLength = state.analyser ? state.analyser.frequencyBinCount : 0;
  const dataArray = new Uint8Array(bufferLength);

  function renderFrame() {
    if (!state.isRecording) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      elements.volumeLevelBar.style.width = '0%';
      return;
    }
    
    requestAnimationFrame(renderFrame);
    state.analyser.getByteFrequencyData(dataArray);
    
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
    const average = sum / bufferLength;
    const volumePercent = Math.min(100, Math.round((average / 128) * 100));
    elements.volumeLevelBar.style.width = `${volumePercent}%`;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const barWidth = (canvas.width / bufferLength) * 2.5;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * canvas.height * 0.85;
      const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
      gradient.addColorStop(0, '#6366f1');
      gradient.addColorStop(0.5, '#06b6d4');
      gradient.addColorStop(1, '#a855f7');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
      
      x += barWidth + 1;
      if (x > canvas.width) break;
    }
  }

  renderFrame();
}

// --- SPEECH RECOGNITION (WEB SPEECH API) ---
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    console.warn('SpeechRecognition API is not supported in this browser.');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = state.config.language || 'id-ID';

  recognition.onresult = (event) => {
    let interim = '';
    
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        addFinalSegment(transcript.trim());
        triggerSilenceAutoPolish();
      } else {
        interim += transcript;
      }
    }
    
    state.rawInterimText = interim;
    renderTranscript();
    updateStats();
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    if (event.error === 'not-allowed') {
      showToast('Izin mikrofon ditolak. Berikan izin di browser Anda.', 'error');
      stopRecording();
    }
  };

  recognition.onend = () => {
    if (state.isRecording && state.activeMode === 'live-speech') {
      try {
        recognition.start();
      } catch (e) {
        console.log('Recognition restart ignored:', e);
      }
    }
  };

  state.speechRecognition = recognition;
}

function addFinalSegment(text) {
  if (!text) return;
  const now = new Date();
  const timeStr = now.toTimeString().substring(0, 8);
  
  state.transcriptSegments.push({
    id: Date.now() + Math.random(),
    time: timeStr,
    text: text
  });
}

function triggerSilenceAutoPolish() {
  if (!state.config.autoPolish) return;
  
  clearTimeout(state.silenceTimer);
  state.silenceTimer = setTimeout(() => {
    if (state.transcriptSegments.length > 0 && !state.isProcessingAI) {
      handleAIAction('polish', null, true);
    }
  }, 3000);
}

// --- RECORDING CONTROLS ---
async function toggleRecording() {
  if (state.isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  const micReady = await startAudioCapture();
  if (!micReady) return;

  state.isRecording = true;
  state.startTime = Date.now();

  if (state.activeMode === 'live-speech' && state.speechRecognition) {
    try {
      state.speechRecognition.lang = state.config.language;
      state.speechRecognition.start();
    } catch (e) {
      console.warn('SpeechRecognition start failed or already active:', e);
    }
  }

  elements.btnToggleRecord.classList.add('recording');
  elements.recordBtnText.textContent = 'Hentikan Transkripsi';
  elements.recordIcon.setAttribute('data-lucide', 'square');
  elements.liveStatusBadge.className = 'status-badge recording';
  elements.liveStatusBadge.innerHTML = '<span class="status-indicator"></span> Merekam Live...';
  initLucideIcons();

  startTimer();
  showToast('Mikrofon/Audio aktif. Silakan mulai berbicara...', 'info');
}

function stopRecording() {
  state.isRecording = false;
  
  if (state.speechRecognition) {
    try {
      state.speechRecognition.stop();
    } catch (e) {}
  }

  stopAudioCapture();
  stopTimer();

  if (state.rawInterimText.trim()) {
    addFinalSegment(state.rawInterimText.trim());
    state.rawInterimText = '';
    renderTranscript();
    updateStats();
  }

  elements.btnToggleRecord.classList.remove('recording');
  elements.recordBtnText.textContent = 'Mulai Transkripsi Live';
  elements.recordIcon.setAttribute('data-lucide', 'mic');
  elements.liveStatusBadge.className = 'status-badge idle';
  elements.liveStatusBadge.innerHTML = '<span class="status-indicator"></span> Standby';
  initLucideIcons();

  showToast('Transkripsi dihentikan.', 'info');

  // Auto-archive snapshot if we have meaningful content
  if (state.transcriptSegments.length > 0) {
    saveCurrentLiveSessionToHistory(true);
  }
}

function startTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    elements.recordTimer.textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(state.timerInterval);
}

// --- TRANSCRIPT RENDERING & STATS ---
function renderTranscript() {
  if (state.transcriptSegments.length === 0 && !state.rawInterimText) {
    elements.transcriptOutput.innerHTML = `
      <div class="empty-state" id="emptyStatePrompt">
        <div class="empty-icon-circle">
          <i data-lucide="mic-off" class="empty-icon"></i>
        </div>
        <h3>Mikrofon Belum Aktif</h3>
        <p>Klik tombol <strong>"Mulai Transkripsi Live"</strong> untuk mulai berbicara. Kata-kata Anda akan muncul secara instan di sini.</p>
        <div class="quick-hints">
          <span>💡 <strong>Tips:</strong> Anda dapat beralih model AI kapan saja untuk merapikan teks atau membuat ringkasan.</span>
        </div>
      </div>
    `;
    initLucideIcons();
    return;
  }

  let html = '';
  state.transcriptSegments.forEach(seg => {
    html += `
      <div class="transcript-segment" data-id="${seg.id}">
        <span class="segment-timestamp">${seg.time}</span>
        <div class="segment-text">${escapeHtml(seg.text)}</div>
      </div>
    `;
  });

  if (state.rawInterimText) {
    html += `
      <div class="transcript-segment interim">
        <span class="segment-timestamp">Live...</span>
        <div class="segment-text interim-text">${escapeHtml(state.rawInterimText)}</div>
      </div>
    `;
  }

  elements.transcriptOutput.innerHTML = html;
  elements.transcriptOutput.scrollTop = elements.transcriptOutput.scrollHeight;
}

function getFullTranscriptText() {
  return state.transcriptSegments.map(s => s.text).join(' ') + (state.rawInterimText ? ' ' + state.rawInterimText : '');
}

function updateStats() {
  const fullText = getFullTranscriptText().trim();
  const words = fullText ? fullText.split(/\s+/).filter(Boolean).length : 0;
  const chars = fullText.length;
  
  elements.wordCountBadge.textContent = words;
  elements.charCountBadge.textContent = chars;
}

function clearTranscript() {
  if (!confirm('Apakah Anda yakin ingin menghapus seluruh transkrip aktif?')) return;
  state.transcriptSegments = [];
  state.rawInterimText = '';
  renderTranscript();
  updateStats();
  elements.lastProcessedBadge.textContent = '-';
  showToast('Transkrip dibersihkan.', 'info');
}

function copyTranscript() {
  const text = getFullTranscriptText().trim();
  if (!text) {
    showToast('Tidak ada teks untuk disalin.', 'error');
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    showToast('Transkrip berhasil disalin ke clipboard!', 'success');
  });
}

function applyPolishToTranscript() {
  if (!state.lastAIResult) return;
  if (!confirm('Ganti teks transkrip dengan hasil yang telah dirapikan oleh AI?')) return;
  
  state.transcriptSegments = [{
    id: Date.now(),
    time: new Date().toTimeString().substring(0, 8),
    text: state.lastAIResult.replace(/^[#*-]+\s*/gm, '').trim()
  }];
  state.rawInterimText = '';
  renderTranscript();
  updateStats();
  showToast('Transkrip diperbarui dengan teks rapi AI!', 'success');
}

// --- AI INTELLIGENCE ROUTER (GEMINI + CFROUTER) ---

async function handleAIAction(actionType, customPromptText = null, isSilent = false) {
  const transcript = getFullTranscriptText().trim();
  if (!transcript) {
    if (!isSilent) showToast('Transkrip masih kosong. Bicaralah terlebih dahulu.', 'error');
    return;
  }

  const model = getEffectiveModel();
  const isGoogle = isGoogleModel(model);
  
  if (isGoogle && !state.config.geminiApiKey) {
    openSettingsModal('tab-gemini');
    showToast('Silakan masukkan Google Gemini API Key Anda terlebih dahulu.', 'error');
    return;
  }

  if (!isGoogle && !state.config.cfrouterApiKey) {
    openSettingsModal('tab-cfrouter');
    showToast('Silakan masukkan CFRouter / Custom API Key Anda terlebih dahulu.', 'error');
    return;
  }

  let systemInstruction = '';
  let userPrompt = '';
  let title = 'Hasil AI';

  switch (actionType) {
    case 'polish':
      title = 'Teks Dirapikan & Diperbaiki';
      systemInstruction = 'Anda adalah asisten editor transkripsi ahli.';
      userPrompt = `Berikut adalah draf transkrip suara mentah dari pembicaraan:\n"""\n${transcript}\n"""\n\nTugas Anda:\n1. Perbaiki tanda baca, kapitalisasi kata, dan kesalahan ejaan (termasuk typo fonetik / salah dengar kata).\n2. Susun kalimat menjadi paragraf yang natural, rapi, dan nyaman dibaca tanpa mengubah maksud asli pembicara.\n3. Hanya berikan hasil teks yang telah dirapikan secara langsung tanpa kata pengantar/penutup.`;
      break;

    case 'summarize':
      title = 'Ringkasan Eksekutif & Poin Penting';
      systemInstruction = 'Anda adalah asisten eksekutif untuk analisis dan ringkasan pertemuan.';
      userPrompt = `Berikut adalah transkrip rekaman pembicaraan:\n"""\n${transcript}\n"""\n\nBuatkan:\n1. **Ringkasan Eksekutif (Executive Summary)** (1-2 paragraf padat).\n2. **Poin-Poin Kunci Pembahasan** (Bullet points terstruktur).\n3. **Topik Utama yang Dibahas**.`;
      break;

    case 'action-items':
      title = 'Notula Rapat & Daftar Tugas (Action Items)';
      systemInstruction = 'Anda adalah sekretaris rapat profesional.';
      userPrompt = `Berikut adalah transkrip pembicaraan:\n"""\n${transcript}\n"""\n\nEkstrak dan buatkan notula terstruktur:\n1. **Daftar Tugas / Action Items** (dengan format [ ] Tugas - Penanggung Jawab jika ada).\n2. **Keputusan yang Diambil (Key Decisions)**.\n3. **Hal yang Perlu Ditindaklanjuti / Follow-up**.`;
      break;

    case 'custom':
      title = 'Hasil Custom Prompt';
      systemInstruction = 'Anda adalah asisten AI serbaguna.';
      userPrompt = `Konteks Transkrip:\n"""\n${transcript}\n"""\n\nInstruksi Pengguna:\n${customPromptText}`;
      break;
  }

  setAILoading(true, `Memproses dengan model ${model}...`);
  elements.aiResultTitle.textContent = title;
  elements.aiModelUsedBadge.textContent = model;

  try {
    let result = '';
    if (isGoogle) {
      result = await callGeminiAPI(model, systemInstruction, userPrompt);
    } else {
      result = await callCFRouterAPI(model, systemInstruction, userPrompt);
    }

    state.lastAIResult = result;
    renderAIResult(result);
    elements.lastProcessedBadge.textContent = new Date().toLocaleTimeString();
    elements.btnApplyPolishToTranscript.classList.toggle('hidden', actionType !== 'polish');
    
    if (!isSilent) showToast('Proses AI berhasil selesai!', 'success');
  } catch (err) {
    console.error('AI Request Error:', err);
    elements.aiOutputContent.innerHTML = `
      <div class="info-alert" style="background: rgba(244,63,94,0.1); border-color: rgba(244,63,94,0.3); color: #fda4af;">
        <i data-lucide="alert-triangle"></i>
        <div>
          <strong>Gagal Memproses AI:</strong> ${escapeHtml(err.message)}
          <br><small>Periksa kembali API Key, Base URL, atau kuota API Anda di Pengaturan.</small>
        </div>
      </div>
    `;
    initLucideIcons();
    showToast('Terjadi kesalahan saat memanggil AI.', 'error');
  } finally {
    setAILoading(false);
  }
}

// --- DIRECT GEMINI MULTIMODAL AUDIO TRANSCRIPTION ---
async function processDirectAudioWithGemini() {
  if (state.audioChunks.length === 0) {
    showToast('Tidak ada data rekaman audio. Tekan Rekam terlebih dahulu.', 'error');
    return;
  }

  if (!state.config.geminiApiKey) {
    openSettingsModal('tab-gemini');
    showToast('Masukkan Google Gemini API Key untuk menggunakan Gemini Audio-In.', 'error');
    return;
  }

  let model = state.config.geminiModel || 'gemini-3.5-transcribe';
  if (state.config.activeModel.startsWith('gemini')) {
    model = state.config.activeModel;
  }

  setAILoading(true, `Mengonversi audio & mengirim ke Google AI (${model})...`);
  elements.aiResultTitle.textContent = 'Transkripsi Native Audio Gemini';
  elements.aiModelUsedBadge.textContent = `${model} (Audio-In)`;

  try {
    const audioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
    const base64Audio = await blobToBase64(audioBlob);

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${state.config.geminiApiKey}`;
    
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'audio/webm',
                data: base64Audio.split(',')[1]
              }
            },
            {
              text: "Transkripsikan audio ini secara presisi, natural, dan lengkap dalam bahasa aslinya. Jika terdapat beberapa pembicara, beri label Speaker 1, Speaker 2. Setelah transkrip lengkap, buatkan ringkasan singkat poin pentingnya."
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Tidak ada teks yang dihasilkan.';
    
    state.lastAIResult = resultText;
    renderAIResult(resultText);

    state.transcriptSegments.push({
      id: Date.now(),
      time: new Date().toTimeString().substring(0, 8),
      text: resultText
    });
    renderTranscript();
    updateStats();

    saveCurrentLiveSessionToHistory(true);
    showToast('Transkripsi Audio Gemini berhasil!', 'success');
  } catch (err) {
    console.error('Gemini Audio Error:', err);
    elements.aiOutputContent.innerHTML = `
      <div class="info-alert" style="background: rgba(244,63,94,0.1); border-color: rgba(244,63,94,0.3); color: #fda4af;">
        <i data-lucide="alert-triangle"></i>
        <div><strong>Error Transkripsi Audio:</strong> ${escapeHtml(err.message)}</div>
      </div>
    `;
    initLucideIcons();
  } finally {
    setAILoading(false);
  }
}

// --- API CALL IMPLEMENTATIONS ---

async function callGeminiAPI(modelName, systemInstruction, userPrompt) {
  const apiKey = state.config.geminiApiKey;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }]
      }
    ],
    generationConfig: {
      temperature: 0.3
    }
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Gemini API Error (HTTP ${res.status})`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '(Respon kosong)';
}

async function callCFRouterAPI(modelName, systemInstruction, userPrompt) {
  const baseUrl = state.config.cfrouterBaseUrl || 'https://api.openai.com/v1';
  const apiKey = state.config.cfrouterApiKey;
  const endpoint = `${baseUrl}/chat/completions`;

  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: userPrompt });

  const payload = {
    model: modelName,
    messages: messages,
    temperature: 0.3
  };

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `CFRouter API Error (HTTP ${res.status}): ${res.statusText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '(Respon kosong)';
}

// --- AUDIO FILE UPLOAD WORKSPACE ---

function setupUploadEventListeners() {
  elements.btnBrowseAudio.addEventListener('click', () => {
    elements.audioFileInput.click();
  });

  elements.audioFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleSelectedAudioFile(e.target.files[0]);
    }
  });

  // Drag & Drop events
  const dropzone = elements.audioDropzone;
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectedAudioFile(e.dataTransfer.files[0]);
    }
  });

  elements.btnRemoveUploadedFile.addEventListener('click', clearUploadedFile);
  elements.btnStartUploadTranscribe.addEventListener('click', processUploadedAudioFile);
  elements.btnCopyUploadResult.addEventListener('click', copyUploadedResult);
  elements.btnExportUploadResult.addEventListener('click', exportUploadedResult);
}

function handleSelectedAudioFile(file) {
  state.uploadedFile = file;

  const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
  elements.uploadedFileName.textContent = file.name;
  elements.uploadedFileSize.textContent = `${sizeMb} MB`;
  elements.uploadedFileType.textContent = file.type || 'audio';

  const audioUrl = URL.createObjectURL(file);
  elements.uploadedAudioPlayer.src = audioUrl;
  
  elements.uploadedAudioPlayer.onloadedmetadata = () => {
    const durSec = Math.floor(elements.uploadedAudioPlayer.duration);
    const mins = String(Math.floor(durSec / 60)).padStart(2, '0');
    const secs = String(durSec % 60).padStart(2, '0');
    state.uploadedDurationStr = `${mins}:${secs}`;
    elements.uploadedFileDuration.textContent = state.uploadedDurationStr;
  };

  elements.audioDropzone.classList.add('hidden');
  elements.uploadedFileCard.classList.remove('hidden');
  initLucideIcons();
  showToast(`Berkas ${file.name} siap ditranskrip.`, 'info');
}

function clearUploadedFile() {
  state.uploadedFile = null;
  state.uploadedAudioBase64 = null;
  elements.audioFileInput.value = '';
  elements.uploadedAudioPlayer.src = '';
  elements.uploadedFileCard.classList.add('hidden');
  elements.audioDropzone.classList.remove('hidden');
  elements.uploadProgressContainer.classList.add('hidden');
}

async function processUploadedAudioFile() {
  if (!state.uploadedFile) {
    showToast('Pilih berkas audio terlebih dahulu.', 'error');
    return;
  }

  if (!state.config.geminiApiKey) {
    openSettingsModal('tab-gemini');
    showToast('Masukkan Google Gemini API Key Anda di Pengaturan.', 'error');
    return;
  }

  const model = elements.uploadModelSelect.value;
  const taskMode = elements.uploadTaskModeSelect.value;
  
  let promptText = '';
  if (taskMode === 'full-diarize') {
    promptText = 'Transkripsikan audio ini secara lengkap, presisi, dan alami dalam bahasa aslinya. Deteksi pembicara yang berbeda (beri label Speaker 1, Speaker 2, dst) beserta perkiraan timestamp. Setelah transkrip lengkap, buatkan ringkasan eksekutif poin pentingnya.';
  } else if (taskMode === 'verbatim') {
    promptText = 'Transkripsikan audio ini secara verbatim persis kata per kata tanpa ada bagian yang dilewati atau diringkas. Format dengan paragraf yang rapi.';
  } else if (taskMode === 'meeting-notes') {
    promptText = 'Transkripsikan audio rekaman rapat ini secara lengkap, lalu ekstrak: 1. Transkrip Dialog Rapat, 2. Ringkasan Eksekutif, 3. Notula & Action Items (Daftar Tugas dengan penanggung jawab), 4. Keputusan Kunci yang Disepakati.';
  } else if (taskMode === 'summary-only') {
    promptText = 'Dengarkan audio ini dan buatkan ringkasan eksekutif komprehensif, poin penting pembahasan, dan kesimpulan utamanya.';
  }

  // Show Progress
  elements.uploadProgressContainer.classList.remove('hidden');
  elements.uploadProgressPercent.textContent = '25%';
  elements.uploadProgressBarFill.style.width = '25%';
  elements.uploadProgressStatusText.textContent = 'Membaca & Mengonversi Berkas Audio...';

  try {
    const base64Data = await blobToBase64(state.uploadedFile);
    
    elements.uploadProgressPercent.textContent = '60%';
    elements.uploadProgressBarFill.style.width = '60%';
    elements.uploadProgressStatusText.textContent = `Mengirim ke Google Gemini (${model})...`;

    const mimeType = state.uploadedFile.type || 'audio/mp3';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${state.config.geminiApiKey}`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data.split(',')[1]
              }
            },
            { text: promptText }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    elements.uploadProgressPercent.textContent = '95%';
    elements.uploadProgressBarFill.style.width = '95%';
    elements.uploadProgressStatusText.textContent = 'Menyusun Hasil Transkripsi...';

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || '(Hasil kosong)';

    state.uploadedResultMarkdown = resultText;
    renderUploadedResult(resultText);
    elements.uploadResultTag.textContent = model;

    // Save automatically to History
    await saveToHistoryDatabase({
      id: 'up_' + Date.now(),
      title: state.uploadedFile.name,
      sourceType: 'upload',
      createdAt: new Date().toISOString(),
      model: model,
      duration: state.uploadedDurationStr,
      transcriptText: resultText,
      segments: [],
      aiAnalysis: resultText
    });

    elements.uploadProgressPercent.textContent = '100%';
    elements.uploadProgressBarFill.style.width = '100%';
    elements.uploadProgressStatusText.textContent = 'Selesai!';
    setTimeout(() => elements.uploadProgressContainer.classList.add('hidden'), 1000);

    showToast('Transkripsi berkas audio berhasil & tersimpan ke Riwayat!', 'success');
  } catch (err) {
    console.error('Upload Transcribe Error:', err);
    elements.uploadProgressContainer.classList.add('hidden');
    elements.uploadResultContent.innerHTML = `
      <div class="info-alert" style="background: rgba(244,63,94,0.1); border-color: rgba(244,63,94,0.3); color: #fda4af;">
        <i data-lucide="alert-triangle"></i>
        <div><strong>Gagal Mentranskrip Berkas:</strong> ${escapeHtml(err.message)}</div>
      </div>
    `;
    initLucideIcons();
    showToast('Terjadi kesalahan saat memproses berkas audio.', 'error');
  }
}

function renderUploadedResult(markdownText) {
  let html = markdownText
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/^\s*\n\*/gm, '<ul>\n*')
    .replace(/^(\*|-)\s+(.*)/gim, '<li>$2</li>')
    .replace(/^\d+\.\s+(.*)/gim, '<li>$1</li>')
    .replace(/\n\n/gim, '<br><br>');

  elements.uploadResultContent.innerHTML = html;
}

function copyUploadedResult() {
  if (!state.uploadedResultMarkdown) {
    showToast('Tidak ada hasil transkripsi berkas untuk disalin.', 'error');
    return;
  }
  navigator.clipboard.writeText(state.uploadedResultMarkdown).then(() => {
    showToast('Hasil transkripsi berkas disalin ke clipboard!', 'success');
  });
}

function exportUploadedResult() {
  if (!state.uploadedResultMarkdown) {
    showToast('Tidak ada hasil transkripsi berkas untuk diekspor.', 'error');
    return;
  }
  const filename = `upload_transcript_${Date.now()}.md`;
  downloadFile(state.uploadedResultMarkdown, filename, 'text/markdown');
  showToast(`File ${filename} berhasil diunduh!`, 'success');
}

// --- TRANSCRIPT HISTORY DATABASE (INDEXEDDB & LOCALSTORAGE) ---

const DB_NAME = 'LiveVoiceAI_DB';
const DB_VERSION = 1;
const STORE_NAME = 'transcripts_history';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveToHistoryDatabase(entry) {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    await new Promise((resolve) => tx.oncomplete = resolve);
    await refreshHistoryList();
  } catch (err) {
    console.error('Error saving to IndexedDB, fallback to localStorage:', err);
    try {
      const history = JSON.parse(localStorage.getItem('livevoice_history') || '[]');
      history.unshift(entry);
      localStorage.setItem('livevoice_history', JSON.stringify(history.slice(0, 50)));
      await refreshHistoryList();
    } catch (e) {}
  }
}

async function getHistoryFromDatabase() {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    try {
      return JSON.parse(localStorage.getItem('livevoice_history') || '[]');
    } catch (e) {
      return [];
    }
  }
}

async function deleteFromHistoryDatabase(id) {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    await new Promise((resolve) => tx.oncomplete = resolve);
  } catch (err) {
    let history = JSON.parse(localStorage.getItem('livevoice_history') || '[]');
    history = history.filter(h => h.id !== id);
    localStorage.setItem('livevoice_history', JSON.stringify(history));
  }
  await refreshHistoryList();
  showToast('Riwayat berhasil dihapus.', 'info');
}

async function clearAllHistoryDatabase() {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    await new Promise((resolve) => tx.oncomplete = resolve);
  } catch (err) {
    localStorage.removeItem('livevoice_history');
  }
  await refreshHistoryList();
  showToast('Semua riwayat transkrip berhasil dibersihkan.', 'info');
}

async function saveCurrentLiveSessionToHistory(isAuto = false) {
  const fullText = getFullTranscriptText().trim();
  if (!fullText) {
    if (!isAuto) showToast('Transkrip aktif masih kosong.', 'error');
    return;
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const entry = {
    id: 'live_' + Date.now(),
    title: `Live Session — ${dateStr}`,
    sourceType: 'live',
    createdAt: now.toISOString(),
    model: getEffectiveModel(),
    duration: elements.recordTimer.textContent || '00:00',
    transcriptText: fullText,
    segments: [...state.transcriptSegments],
    aiAnalysis: state.lastAIResult || null
  };

  await saveToHistoryDatabase(entry);
  if (!isAuto) {
    showToast('Sesi transkrip live berhasil disimpan ke Riwayat!', 'success');
  }
}

async function refreshHistoryList() {
  state.historyList = await getHistoryFromDatabase();
  elements.historyCountBadge.textContent = state.historyList.length;
  elements.historyTotalBadge.textContent = `${state.historyList.length} Sesi Tersimpan`;
  renderHistoryCards();
}

function renderHistoryCards(searchQuery = '') {
  const container = elements.historyListContainer;
  let items = state.historyList;

  if (searchQuery) {
    items = items.filter(item => 
      item.title.toLowerCase().includes(searchQuery) ||
      (item.transcriptText && item.transcriptText.toLowerCase().includes(searchQuery)) ||
      (item.model && item.model.toLowerCase().includes(searchQuery))
    );
  }

  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon-circle">
          <i data-lucide="inbox" class="empty-icon"></i>
        </div>
        <h3>${searchQuery ? 'Tidak Ada Riwayat yang Cocok' : 'Belum Ada Riwayat Transkripsi'}</h3>
        <p>${searchQuery ? 'Coba kata kunci lain.' : 'Setiap sesi transkripsi live atau berkas yang diunggah akan otomatis terarsip rapi di sini.'}</p>
      </div>
    `;
    initLucideIcons();
    return;
  }

  let html = '';
  items.forEach(item => {
    const isUpload = item.sourceType === 'upload';
    const dateFormatted = new Date(item.createdAt).toLocaleString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const words = item.transcriptText ? item.transcriptText.split(/\s+/).filter(Boolean).length : 0;
    const excerpt = item.transcriptText ? item.transcriptText.slice(0, 180) + '...' : '(Kosong)';

    html += `
      <div class="history-card" data-id="${item.id}">
        <div class="history-card-header">
          <div class="history-card-title-group">
            <div class="history-card-title">
              <i data-lucide="${isUpload ? 'file-audio' : 'mic'}" class="icon-accent"></i>
              <span>${escapeHtml(item.title)}</span>
            </div>
            <span class="history-card-meta">${dateFormatted} • Durasi: ${item.duration || '-'}</span>
          </div>
          <span class="tag-model">${escapeHtml(item.model || 'Gemini')}</span>
        </div>

        <div class="history-card-excerpt">${escapeHtml(excerpt)}</div>

        <div class="history-card-footer">
          <span class="stat-label"><strong>${words}</strong> kata</span>
          <div class="history-card-actions">
            <button class="btn-icon-subtle btn-history-load" data-id="${item.id}" title="Muat ke Editor Live">
              <i data-lucide="external-link"></i> Buka
            </button>
            <button class="btn-icon-subtle btn-history-copy" data-id="${item.id}" title="Salin Teks">
              <i data-lucide="copy"></i>
            </button>
            <button class="btn-icon-subtle btn-history-export" data-id="${item.id}" title="Unduh Markdown">
              <i data-lucide="download"></i>
            </button>
            <button class="btn-icon-subtle btn-history-delete" data-id="${item.id}" title="Hapus Riwayat Ini">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  initLucideIcons();

  // Attach card action listeners
  container.querySelectorAll('.btn-history-load').forEach(btn => {
    btn.addEventListener('click', () => loadHistoryItemToEditor(btn.getAttribute('data-id')));
  });
  container.querySelectorAll('.btn-history-copy').forEach(btn => {
    btn.addEventListener('click', () => copyHistoryItem(btn.getAttribute('data-id')));
  });
  container.querySelectorAll('.btn-history-export').forEach(btn => {
    btn.addEventListener('click', () => exportHistoryItem(btn.getAttribute('data-id')));
  });
  container.querySelectorAll('.btn-history-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Hapus transkrip ini dari riwayat?')) {
        deleteFromHistoryDatabase(btn.getAttribute('data-id'));
      }
    });
  });
}

function loadHistoryItemToEditor(id) {
  const item = state.historyList.find(h => h.id === id);
  if (!item) return;

  if (item.segments && item.segments.length > 0) {
    state.transcriptSegments = [...item.segments];
  } else {
    state.transcriptSegments = [{
      id: Date.now(),
      time: new Date(item.createdAt).toTimeString().substring(0, 8),
      text: item.transcriptText
    }];
  }

  state.rawInterimText = '';
  renderTranscript();
  updateStats();

  if (item.aiAnalysis) {
    state.lastAIResult = item.aiAnalysis;
    renderAIResult(item.aiAnalysis);
    elements.aiResultTitle.textContent = `Riwayat: ${item.title}`;
    elements.aiModelUsedBadge.textContent = item.model || 'Tersimpan';
  }

  switchView('viewLiveTranscribe');
  showToast(`Sesi "${item.title}" dimuat ke workspace!`, 'success');
}

function copyHistoryItem(id) {
  const item = state.historyList.find(h => h.id === id);
  if (!item || !item.transcriptText) return;
  navigator.clipboard.writeText(item.transcriptText).then(() => {
    showToast('Teks transkrip riwayat disalin ke clipboard!', 'success');
  });
}

function exportHistoryItem(id) {
  const item = state.historyList.find(h => h.id === id);
  if (!item) return;
  
  let content = `# ${item.title}\n`;
  content += `Tanggal: ${item.createdAt}\nModel: ${item.model}\n\n`;
  content += `## Transkrip Lengkap\n\n${item.transcriptText}\n\n`;
  if (item.aiAnalysis) {
    content += `---\n\n## Hasil Analisis AI\n\n${item.aiAnalysis}\n`;
  }

  const filename = `${item.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
  downloadFile(content, filename, 'text/markdown');
  showToast(`File ${filename} berhasil diunduh!`, 'success');
}

function clearAllHistory() {
  if (state.historyList.length === 0) {
    showToast('Riwayat sudah kosong.', 'info');
    return;
  }
  if (!confirm('Apakah Anda yakin ingin MENGHAPUS SEMUA riwayat transkripsi yang tersimpan?')) return;
  clearAllHistoryDatabase();
}

// --- UTILITIES & HELPERS ---

function setAILoading(isLoading, message = '') {
  state.isProcessingAI = isLoading;
  elements.aiLoadingOverlay.classList.toggle('hidden', !isLoading);
  if (message) elements.aiLoadingMessage.textContent = message;
}

function renderAIResult(markdownText) {
  let html = markdownText
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/^\s*\n\*/gm, '<ul>\n*')
    .replace(/^(\*|-)\s+(.*)/gim, '<li>$2</li>')
    .replace(/^\d+\.\s+(.*)/gim, '<li>$1</li>')
    .replace(/\n\n/gim, '<br><br>');

  elements.aiOutputContent.innerHTML = html;
}

function copyAIResult() {
  if (!state.lastAIResult) {
    showToast('Tidak ada hasil AI untuk disalin.', 'error');
    return;
  }
  navigator.clipboard.writeText(state.lastAIResult).then(() => {
    showToast('Hasil AI berhasil disalin ke clipboard!', 'success');
  });
}

function clearAIResult() {
  state.lastAIResult = '';
  elements.aiOutputContent.innerHTML = `
    <div class="empty-ai-state">
      <i data-lucide="bot" class="large-ghost-icon"></i>
      <h4>Pilih Tugas AI di Atas</h4>
      <p>Klik <strong>Rapikan & Perbaiki</strong>, <strong>Ringkasan Eksekutif</strong>, atau <strong>Notula & To-Do List</strong> untuk mengolah teks transkrip dengan model yang dipilih.</p>
    </div>
  `;
  elements.btnApplyPolishToTranscript.classList.add('hidden');
  elements.aiResultTitle.textContent = 'Hasil Pengolahan AI';
  elements.aiModelUsedBadge.textContent = 'Siap';
  initLucideIcons();
}

function openSettingsModal(defaultTab = 'tab-gemini') {
  elements.settingsModal.classList.remove('hidden');
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === defaultTab);
  });
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.toggle('active', c.id === defaultTab);
  });
  initLucideIcons();
}

function closeSettingsModal() {
  elements.settingsModal.classList.add('hidden');
}

function resetSettingsToDefault() {
  if (!confirm('Reset semua pengaturan ke konfigurasi default?')) return;
  state.config = { ...DEFAULT_CONFIG };
  localStorage.removeItem('livevoice_config');
  loadConfig();
  showToast('Pengaturan telah di-reset.', 'info');
}

function openExportModal() {
  if (!getFullTranscriptText().trim()) {
    showToast('Transkrip masih kosong. Tidak ada data untuk diekspor.', 'error');
    return;
  }
  elements.exportModal.classList.remove('hidden');
}

function closeExportModal() {
  elements.exportModal.classList.add('hidden');
}

function exportTranscript(format) {
  const rawText = getFullTranscriptText().trim();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  let filename = `transcript_${timestamp}`;
  let content = '';
  let mimeType = 'text/plain';

  if (format === 'txt') {
    filename += '.txt';
    content = state.transcriptSegments.map(s => `[${s.time}] ${s.text}`).join('\n');
  } else if (format === 'md') {
    filename += '.md';
    mimeType = 'text/markdown';
    content = `# Transkrip Rekaman — ${new Date().toLocaleDateString()}\n\n## Transkrip Mentah\n\n`;
    state.transcriptSegments.forEach(s => {
      content += `- **[${s.time}]**: ${s.text}\n`;
    });
    if (state.lastAIResult) {
      content += `\n---\n\n## Hasil Analisis AI (${getEffectiveModel()})\n\n${state.lastAIResult}\n`;
    }
  } else if (format === 'json') {
    filename += '.json';
    mimeType = 'application/json';
    content = JSON.stringify({
      createdAt: new Date().toISOString(),
      model: getEffectiveModel(),
      stats: {
        words: elements.wordCountBadge.textContent,
        chars: elements.charCountBadge.textContent
      },
      segments: state.transcriptSegments,
      aiAnalysis: state.lastAIResult || null
    }, null, 2);
  }

  downloadFile(content, filename, mimeType);
  showToast(`File ${filename} berhasil diunduh!`, 'success');
}

function downloadFile(data, filename, type) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-circle';
  
  toast.innerHTML = `<i data-lucide="${iconName}" class="icon-small"></i> <span>${escapeHtml(message)}</span>`;
  elements.toastContainer.appendChild(toast);
  initLucideIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
