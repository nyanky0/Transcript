/**
 * LiveVoice AI — Live Transcribe & Multi-Model Intelligence Router
 * Supports Web Speech API live streaming, Gemini Audio-In Multimodal,
 * Multi-Device Microphone/Desktop Audio Routing, Audio File Upload & History Management.
 */

// --- CONFIGURATION & STATE ---
const SECRETS = (typeof window !== 'undefined' && window.APP_SECRETS) ? window.APP_SECRETS : {};

const DEFAULT_CONFIG = {
  geminiApiKey: SECRETS.geminiApiKey || '',
  geminiModel: 'gemini-3.6-flash',
  cfrouterBaseUrl: 'https://api.cfrouter.my.id/v1',
  cfrouterApiKey: SECRETS.cfrouterApiKey || '',
  cfrouterModel: 'Qwen3.8-27B',
  omniBaseUrl: 'http://localhost:20128/v1',
  omniApiKey: SECRETS.omniApiKey || '',
  omniModel: 'combo-gratis',
  customModelName: '',
  activeModel: 'combo-gratis',
  activeMode: 'live-speech', // 'live-speech' or 'direct-audio'
  language: 'bilingual', // 'bilingual' (Indo + English), 'id-ID', 'en-US', 'ja-JP'
  micGain: '2.0', // 1.0 (Normal), 2.0 (+6dB Booster), 3.5 (+11dB Whisper Boost)
  browserNoiseSuppression: false, // Default false: Bypass aggressive browser noise gate to catch whispers
  autoPolish: false,

  // Dual-Agent Default Configuration (Default: Localhost Omni Router combo-gratis)
  transcriptAgent: {
    model: 'combo-gratis',
    useDefault: true,
    baseUrl: '',
    apiKey: ''
  },
  summaryAgent: {
    model: 'combo-gratis',
    useDefault: true,
    baseUrl: '',
    apiKey: ''
  }
};

const state = {
  config: { ...DEFAULT_CONFIG },
  isRecording: false,
  startTime: null,
  timerInterval: null,
  transcriptSegments: [], // Array of { id, time, text, isFinal }
  rawInterimText: '',
  audioContext: null,
  gainNode: null,
  compressorNode: null,
  analyser: null,
  mediaStream: null,
  mediaRecorder: null,
  audioChunks: [],
  fullSessionAudioChunks: [],
  recordedMimeType: 'audio/webm',
  speechRecognition: null,
  silenceTimer: null,
  lastAIResult: '',
  isNotepadMode: false,
  activeMode: 'live-speech', // 'live-speech' or 'direct-audio'
  isProcessingAI: false, // Flag for async AI background processing
  isSendingAudioChunk: false, // Flag for audio-in chunk dispatch in flight

  // Audio Marker System (Windows Voice Recorder Style)
  audioMarkers: [],
  markersCount: 0,

  // Active target for Agent Config Modal ('transcript' | 'summary')
  activeConfigTargetAgent: 'transcript',
  
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
  historyList: [],
  tempSummaryList: [],

  // Summary Input Source State (.md / .txt / Recent Transcripts)
  customSummarySource: null, // { type: 'file'|'recent', name: string, text: string, meta: string, size?: number }
  activeSummarySourceTab: 'live', // 'live' | 'file' | 'recent'
  selectedSummaryFiles: [], // Array of { name, size, text, words }
  selectedRecentSessionIds: new Set(), // Set of session IDs selected in AI panel
  selectedHistoryCardIds: new Set(), // Set of session IDs selected in viewHistory

  // Speaker Custom Renaming Aliases & Auto-Stream Config
  speakerAliases: {}, // { 'pembicara 1': 'Budi', 'speaker 2': 'Pak Joko' }
  autoStreamIntervalSec: 30 // Default 30s for rich audio context
};

window.state = state;

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

  // Header Dual-Agent Status
  headerTranscriptModelName: document.getElementById('headerTranscriptModelName'),
  headerSummaryModelName: document.getElementById('headerSummaryModelName'),
  activeModelSelect: document.getElementById('activeModelSelect'),
  modelProviderBadge: document.getElementById('modelProviderBadge'),
  btnOpenSettings: document.getElementById('btnOpenSettings'),

  // Dual-Agent Selectors & Controls
  transcriptModelSelect: document.getElementById('transcriptModelSelect'),
  summaryModelSelect: document.getElementById('summaryModelSelect'),
  btnTranscriptAgentConfig: document.getElementById('btnTranscriptAgentConfig'),
  btnSummaryAgentConfig: document.getElementById('btnSummaryAgentConfig'),
  chkAutoSendGeminiAudio: document.getElementById('chkAutoSendGeminiAudio'),
  
  // Audio Source Elements
  srcTypeMic: document.getElementById('srcTypeMic'),
  srcTypeDesktop: document.getElementById('srcTypeDesktop'),
  srcTypeMix: document.getElementById('srcTypeMix'),
  micSourceControls: document.getElementById('micSourceControls'),
  desktopSourceControls: document.getElementById('desktopSourceControls'),
  micDeviceSelect: document.getElementById('micDeviceSelect'),
  micGainSelect: document.getElementById('micGainSelect'),
  chkNoiseSuppression: document.getElementById('chkNoiseSuppression'),
  noiseGateStatusLabel: document.getElementById('noiseGateStatusLabel'),
  btnRefreshAudioDevices: document.getElementById('btnRefreshAudioDevices'),
  btnSelectDesktopAudio: document.getElementById('btnSelectDesktopAudio'),
  desktopCaptureStatus: document.getElementById('desktopCaptureStatus'),

  // Status & Mode
  liveStatusBadge: document.getElementById('liveStatusBadge'),
  speechLangSelect: document.getElementById('speechLangSelect'),
  modeLiveSpeech: document.getElementById('modeLiveSpeech'),
  modeDirectAudio: document.getElementById('modeDirectAudio'),
  modeGeminiLive: document.getElementById('modeGeminiLive'),
  geminiLiveProgress: document.getElementById('geminiLiveProgress'),
  geminiLiveWsDot: document.getElementById('geminiLiveWsDot'),
  geminiLiveWsStatus: document.getElementById('geminiLiveWsStatus'),
  geminiLiveModelSelect: document.getElementById('geminiLiveModelSelect'),
  engineBadgeText: document.getElementById('engineBadgeText'),
  
  // Recording & Wave Visualizer Monitor
  btnToggleRecord: document.getElementById('btnToggleRecord'),
  recordIcon: document.getElementById('recordIcon'),
  recordBtnText: document.getElementById('recordBtnText'),
  recordTimer: document.getElementById('recordTimer'),
  audioVisualizer: document.getElementById('audioVisualizer'),
  volumeLevelBar: document.getElementById('volumeLevelBar'),
  audioLiveStatusBadge: document.getElementById('audioLiveStatusBadge'),
  audioLiveStatusText: document.getElementById('audioLiveStatusText'),
  audioDbLevelText: document.getElementById('audioDbLevelText'),

  // Marker Controls (Windows Voice Recorder Style)
  btnAddAudioMarker: document.getElementById('btnAddAudioMarker'),
  markerBtnLabel: document.getElementById('markerBtnLabel'),
  audioMarkerStrip: document.getElementById('audioMarkerStrip'),
  markerChipsList: document.getElementById('markerChipsList'),
  
  // Actions & Output (Live Messenger Chat Stream)
  btnSaveLiveToHistory: document.getElementById('btnSaveLiveToHistory'),
  btnDownloadRecordedAudio: document.getElementById('btnDownloadRecordedAudio'),
  btnClearTranscript: document.getElementById('btnClearTranscript'),
  btnCopyTranscript: document.getElementById('btnCopyTranscript'),
  btnExportTranscript: document.getElementById('btnExportTranscript'),
  transcriptOutput: document.getElementById('transcriptOutput'),
  directAudioProgress: document.getElementById('directAudioProgress'),
  audioBannerTopBar: document.getElementById('audioBannerTopBar'),
  btnToggleAudioBanner: document.getElementById('btnToggleAudioBanner'),
  audioBannerChevron: document.getElementById('audioBannerChevron'),
  audioBannerDetailsBody: document.getElementById('audioBannerDetailsBody'),
  audioStreamProgressWrapper: document.getElementById('audioStreamProgressWrapper'),
  streamPulseDot: document.getElementById('streamPulseDot'),
  audioStreamStatusText: document.getElementById('audioStreamStatusText'),
  audioStreamCountdownText: document.getElementById('audioStreamCountdownText'),
  audioStreamProgressBar: document.getElementById('audioStreamProgressBar'),
  autoStreamIntervalSelect: document.getElementById('autoStreamIntervalSelect'),
  streamMiniCircleWrap: document.getElementById('streamMiniCircleWrap'),
  streamCircleMeter: document.getElementById('streamCircleMeter'),
  streamMiniCountdown: document.getElementById('streamMiniCountdown'),
  btnProcessDirectAudio: document.getElementById('btnProcessDirectAudio'),
  btnViewGeminiAudioLogs: document.getElementById('btnViewGeminiAudioLogs'),
  btnViewAudioInHistory: document.getElementById('btnViewAudioInHistory'),
  btnOpenAudioInFolderQuick: document.getElementById('btnOpenAudioInFolderQuick'),
  geminiAudioModelSelect: document.getElementById('geminiAudioModelSelect'),
  geminiLogsModal: document.getElementById('geminiLogsModal'),
  btnCloseGeminiLogs: document.getElementById('btnCloseGeminiLogs'),
  btnRefreshGeminiLogs: document.getElementById('btnRefreshGeminiLogs'),
  geminiLogsOutputContent: document.getElementById('geminiLogsOutputContent'),
  
  // Audio-In History Modal Elements
  audioInHistoryModal: document.getElementById('audioInHistoryModal'),
  btnCloseAudioInHistory: document.getElementById('btnCloseAudioInHistory'),
  btnRefreshAudioInHistory: document.getElementById('btnRefreshAudioInHistory'),
  btnOpenAudioInFolderFromModal: document.getElementById('btnOpenAudioInFolderFromModal'),
  audioInSearchInput: document.getElementById('audioInSearchInput'),
  audioInCountTotal: document.getElementById('audioInCountTotal'),
  audioInListContainer: document.getElementById('audioInListContainer'),

  // Summary Input Source Selector Elements
  srcTabLive: document.getElementById('srcTabLive'),
  srcTabFile: document.getElementById('srcTabFile'),
  srcTabRecent: document.getElementById('srcTabRecent'),
  sourcePanelFile: document.getElementById('sourcePanelFile'),
  sourcePanelRecent: document.getElementById('sourcePanelRecent'),
  summaryDropzone: document.getElementById('summaryDropzone'),
  summaryFileInput: document.getElementById('summaryFileInput'),
  btnBrowseSummaryFile: document.getElementById('btnBrowseSummaryFile'),
  summaryFilesListContainer: document.getElementById('summaryFilesListContainer'),
  recentSessionSearch: document.getElementById('recentSessionSearch'),
  btnSelectAllRecent: document.getElementById('btnSelectAllRecent'),
  btnClearRecentSelection: document.getElementById('btnClearRecentSelection'),
  recentSessionsChecklist: document.getElementById('recentSessionsChecklist'),
  recentSelectionFooter: document.getElementById('recentSelectionFooter'),
  recentSelectionSummaryText: document.getElementById('recentSelectionSummaryText'),
  btnApplyRecentSelection: document.getElementById('btnApplyRecentSelection'),
  btnRefreshRecentSessions: document.getElementById('btnRefreshRecentSessions'),
  activeSourceStatusPill: document.getElementById('activeSourceStatusPill'),
  activeSourceType: document.getElementById('activeSourceType'),
  activeSourceName: document.getElementById('activeSourceName'),
  activeSourceMeta: document.getElementById('activeSourceMeta'),
  btnResetToLiveSource: document.getElementById('btnResetToLiveSource'),
  
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
  btnToggleNotepadView: document.getElementById('btnToggleNotepadView'),
  notepadViewToggleLabel: document.getElementById('notepadViewToggleLabel'),
  btnCopyAIResult: document.getElementById('btnCopyAIResult'),
  btnClearAIResult: document.getElementById('btnClearAIResult'),
  btnApplyPolishToTranscript: document.getElementById('btnApplyPolishToTranscript'),
  autoPolishToggle: document.getElementById('autoPolishToggle'),
  
  // Temp Summary Historical Elements (Folder Temp)
  btnOpenSummaryHistory: document.getElementById('btnOpenSummaryHistory'),
  btnOpenTempFolder: document.getElementById('btnOpenTempFolder'),
  tempSummaryCountBadge: document.getElementById('tempSummaryCountBadge'),
  summaryHistoryModal: document.getElementById('summaryHistoryModal'),
  btnCloseSummaryHistory: document.getElementById('btnCloseSummaryHistory'),
  btnOpenFolderFromModal: document.getElementById('btnOpenFolderFromModal'),
  btnRefreshTempSummaries: document.getElementById('btnRefreshTempSummaries'),
  tempSummarySearchInput: document.getElementById('tempSummarySearchInput'),
  tempSummaryCountTotal: document.getElementById('tempSummaryCountTotal'),
  tempSummaryListContainer: document.getElementById('tempSummaryListContainer'),

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
  btnUseLastRecordingInUpload: document.getElementById('btnUseLastRecordingInUpload'),
  btnOpenRecordingsFolder: document.getElementById('btnOpenRecordingsFolder'),
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
  historyBatchActionBar: document.getElementById('historyBatchActionBar'),
  chkSelectAllHistory: document.getElementById('chkSelectAllHistory'),
  historySelectedCountBadge: document.getElementById('historySelectedCountBadge'),
  btnBatchSummarizeHistory: document.getElementById('btnBatchSummarizeHistory'),
  btnBatchExportHistory: document.getElementById('btnBatchExportHistory'),
  btnBatchDeleteHistory: document.getElementById('btnBatchDeleteHistory'),
  
  // Global Settings Modal
  settingsModal: document.getElementById('settingsModal'),
  btnCloseSettings: document.getElementById('btnCloseSettings'),
  btnSaveSettings: document.getElementById('btnSaveSettings'),
  btnResetSettings: document.getElementById('btnResetSettings'),
  geminiApiKey: document.getElementById('geminiApiKey'),
  geminiDefaultModel: document.getElementById('geminiDefaultModel'),
  cfrouterBaseUrl: document.getElementById('cfrouterBaseUrl'),
  cfrouterApiKey: document.getElementById('cfrouterApiKey'),
  customModelNameInput: document.getElementById('customModelNameInput'),
  omniBaseUrl: document.getElementById('omniBaseUrl'),
  btnResetOmniUrl: document.getElementById('btnResetOmniUrl'),
  omniApiKey: document.getElementById('omniApiKey'),
  btnAutoDetectOmniKey: document.getElementById('btnAutoDetectOmniKey'),
  omniDefaultModel: document.getElementById('omniDefaultModel'),
  btnTestOmniConnection: document.getElementById('btnTestOmniConnection'),
  omniConnectionStatus: document.getElementById('omniConnectionStatus'),

  // Individual Agent Config Modal
  agentConfigModal: document.getElementById('agentConfigModal'),
  btnCloseAgentConfig: document.getElementById('btnCloseAgentConfig'),
  btnCancelAgentConfig: document.getElementById('btnCancelAgentConfig'),
  btnSaveAgentConfig: document.getElementById('btnSaveAgentConfig'),
  agentConfigModalTitle: document.getElementById('agentConfigModalTitle'),
  agentConfigTargetName: document.getElementById('agentConfigTargetName'),
  agentConfigUseDefault: document.getElementById('agentConfigUseDefault'),
  agentCustomFields: document.getElementById('agentCustomFields'),
  agentCustomBaseUrl: document.getElementById('agentCustomBaseUrl'),
  agentCustomApiKey: document.getElementById('agentCustomApiKey'),
  
  // Export Modal
  exportModal: document.getElementById('exportModal'),
  btnCloseExport: document.getElementById('btnCloseExport'),
  btnExportAudioRecording: document.getElementById('btnExportAudioRecording'),

  // API Usage & Quota Modal Elements
  btnOpenApiUsage: document.getElementById('btnOpenApiUsage'),
  apiUsageBadge: document.getElementById('apiUsageBadge'),
  apiUsageModal: document.getElementById('apiUsageModal'),
  btnCloseApiUsage: document.getElementById('btnCloseApiUsage'),
  btnExportApiLogsCsv: document.getElementById('btnExportApiLogsCsv'),
  btnClearApiUsageStats: document.getElementById('btnClearApiUsageStats'),
  apiModelStatsContainer: document.getElementById('apiModelStatsContainer'),
  apiLogsTableBody: document.getElementById('apiLogsTableBody'),
  apiLogsTotalCountBadge: document.getElementById('apiLogsTotalCountBadge'),

  // History Detail Modal Elements
  historyDetailModal: document.getElementById('historyDetailModal'),
  historyDetailTitle: document.getElementById('historyDetailTitle'),
  historyDetailMeta: document.getElementById('historyDetailMeta'),
  historyDetailAnalysisBox: document.getElementById('historyDetailAnalysisBox'),
  historyDetailAnalysisContent: document.getElementById('historyDetailAnalysisContent'),
  historyDetailSegmentsContainer: document.getElementById('historyDetailSegmentsContainer'),
  btnLoadHistoryToLive: document.getElementById('btnLoadHistoryToLive'),
  btnCopyHistoryDetail: document.getElementById('btnCopyHistoryDetail'),
  btnExportHistoryDetail: document.getElementById('btnExportHistoryDetail'),
  btnCloseHistoryDetail: document.getElementById('btnCloseHistoryDetail'),

  toastContainer: document.getElementById('toastContainer')
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
  loadConfig();
  initLucideIcons();
  setupEventListeners();
  switchMode(state.activeMode || state.config.activeMode || 'live-speech', true);
  setupSpeechRecognition();
  updateModelUI();
  updateApiUsageBadge();
  enumerateMicrophones();
  await refreshHistoryList();
  await loadTempSummaryHistory(false);
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
      const parsed = JSON.parse(saved);
      state.config = {
        ...DEFAULT_CONFIG,
        ...parsed,
        transcriptAgent: { ...DEFAULT_CONFIG.transcriptAgent, ...(parsed.transcriptAgent || {}) },
        summaryAgent: { ...DEFAULT_CONFIG.summaryAgent, ...(parsed.summaryAgent || {}) }
      };
    }
  } catch (e) {
    console.error('Error loading config:', e);
  }
  
  state.activeMode = state.config.activeMode || 'live-speech';

  // Apply template defaults for CFRouter, Gemini & Omni Router if empty
  if (!state.config.cfrouterApiKey) {
    state.config.cfrouterApiKey = DEFAULT_CONFIG.cfrouterApiKey;
  }
  if (!state.config.cfrouterBaseUrl || state.config.cfrouterBaseUrl.includes('api.openai.com')) {
    state.config.cfrouterBaseUrl = DEFAULT_CONFIG.cfrouterBaseUrl;
  }
  if (!state.config.geminiApiKey || state.config.geminiApiKey.startsWith('GOCSPX') || state.config.geminiApiKey.includes('apps.googleusercontent.com')) {
    state.config.geminiApiKey = DEFAULT_CONFIG.geminiApiKey;
  }
  if (!state.config.omniBaseUrl) {
    state.config.omniBaseUrl = DEFAULT_CONFIG.omniBaseUrl;
  }
  if (!state.config.omniApiKey) {
    state.config.omniApiKey = DEFAULT_CONFIG.omniApiKey;
  }
  if (!state.config.omniModel) {
    state.config.omniModel = DEFAULT_CONFIG.omniModel;
  }
  
  // Apply saved values to UI inputs
  if (elements.geminiApiKey) elements.geminiApiKey.value = state.config.geminiApiKey || DEFAULT_CONFIG.geminiApiKey;
  if (elements.geminiDefaultModel) elements.geminiDefaultModel.value = state.config.geminiModel || DEFAULT_CONFIG.geminiModel;
  if (elements.cfrouterBaseUrl) elements.cfrouterBaseUrl.value = state.config.cfrouterBaseUrl || DEFAULT_CONFIG.cfrouterBaseUrl;
  if (elements.cfrouterApiKey) elements.cfrouterApiKey.value = state.config.cfrouterApiKey || DEFAULT_CONFIG.cfrouterApiKey;
  if (elements.omniBaseUrl) elements.omniBaseUrl.value = state.config.omniBaseUrl || DEFAULT_CONFIG.omniBaseUrl;
  if (elements.omniApiKey) elements.omniApiKey.value = state.config.omniApiKey || DEFAULT_CONFIG.omniApiKey;
  if (elements.omniDefaultModel) elements.omniDefaultModel.value = state.config.omniModel || DEFAULT_CONFIG.omniModel;
  if (elements.customModelNameInput) elements.customModelNameInput.value = state.config.customModelName || '';
  if (elements.speechLangSelect) elements.speechLangSelect.value = state.config.language || 'bilingual';
  if (elements.micGainSelect) elements.micGainSelect.value = state.config.micGain || '2.0';
  if (elements.autoPolishToggle) elements.autoPolishToggle.checked = !!state.config.autoPolish;
  updateNoiseGateUI();
  
  // Auto-migrate away from failing deepseek-v4-flash-0731 to combo-gratis
  if (!state.config.transcriptAgent || !state.config.transcriptAgent.model || state.config.transcriptAgent.model === 'deepseek-v4-flash-0731') {
    if (!state.config.transcriptAgent) state.config.transcriptAgent = { ...DEFAULT_CONFIG.transcriptAgent };
    state.config.transcriptAgent.model = 'combo-gratis';
  }
  if (!state.config.summaryAgent || !state.config.summaryAgent.model || state.config.summaryAgent.model === 'deepseek-v4-flash-0731') {
    if (!state.config.summaryAgent) state.config.summaryAgent = { ...DEFAULT_CONFIG.summaryAgent };
    state.config.summaryAgent.model = 'combo-gratis';
  }

  // Apply to Dual-Agent dropdowns
  if (elements.transcriptModelSelect && state.config.transcriptAgent?.model) {
    elements.transcriptModelSelect.value = state.config.transcriptAgent.model;
  }
  if (elements.summaryModelSelect && state.config.summaryAgent?.model) {
    elements.summaryModelSelect.value = state.config.summaryAgent.model;
  }

  // Backward compatibility for activeModelSelect if present
  if (elements.activeModelSelect && state.config.activeModel) {
    elements.activeModelSelect.value = state.config.activeModel;
  }

  // Apply to Gemini Audio-In model select
  if (elements.geminiAudioModelSelect) {
    const audioM = state.config.geminiModel || 'gemini-3.6-flash';
    elements.geminiAudioModelSelect.value = audioM;
  }
}

function getEffectiveGeminiKey() {
  let key = (state.config.geminiApiKey || '').trim();
  if (!key || key.startsWith('GOCSPX') || key.includes('apps.googleusercontent.com')) {
    key = DEFAULT_CONFIG.geminiApiKey;
  }
  return key;
}

function saveConfig() {
  const inputKey = elements.geminiApiKey?.value.trim() || '';
  if (inputKey.startsWith('GOCSPX') || inputKey.includes('apps.googleusercontent.com')) {
    showToast('Info: Client ID / Secret OAuth bukan Gemini API Key. Menggunakan Google AI Studio Key (AIzaSy...) yang aktif.', 'warning');
    state.config.geminiApiKey = DEFAULT_CONFIG.geminiApiKey;
    if (elements.geminiApiKey) elements.geminiApiKey.value = DEFAULT_CONFIG.geminiApiKey;
  } else {
    state.config.geminiApiKey = inputKey || DEFAULT_CONFIG.geminiApiKey;
  }

  const chosenGeminiModel = elements.geminiAudioModelSelect?.value || elements.geminiDefaultModel?.value || 'gemini-3.6-flash';
  state.config.geminiModel = chosenGeminiModel;
  if (elements.geminiDefaultModel) elements.geminiDefaultModel.value = chosenGeminiModel;
  if (elements.geminiAudioModelSelect) elements.geminiAudioModelSelect.value = chosenGeminiModel;

  state.config.cfrouterBaseUrl = elements.cfrouterBaseUrl?.value.trim().replace(/\/+$/, '') || DEFAULT_CONFIG.cfrouterBaseUrl;
  state.config.cfrouterApiKey = elements.cfrouterApiKey?.value.trim() || DEFAULT_CONFIG.cfrouterApiKey;
  state.config.omniBaseUrl = elements.omniBaseUrl?.value.trim().replace(/\/+$/, '') || DEFAULT_CONFIG.omniBaseUrl;
  state.config.omniApiKey = elements.omniApiKey?.value.trim() || DEFAULT_CONFIG.omniApiKey;
  state.config.omniModel = elements.omniDefaultModel?.value || DEFAULT_CONFIG.omniModel;
  state.config.customModelName = elements.customModelNameInput?.value.trim() || '';
  state.config.language = elements.speechLangSelect?.value || 'bilingual';
  state.config.micGain = elements.micGainSelect?.value || '2.0';
  state.config.browserNoiseSuppression = Boolean(elements.chkNoiseSuppression?.checked);
  state.config.autoPolish = elements.autoPolishToggle ? elements.autoPolishToggle.checked : false;
  
  if (elements.transcriptModelSelect) {
    state.config.transcriptAgent.model = elements.transcriptModelSelect.value;
  }
  if (elements.summaryModelSelect) {
    state.config.summaryAgent.model = elements.summaryModelSelect.value;
  }
  
  localStorage.setItem('livevoice_config', JSON.stringify(state.config));
  updateModelUI();
  showToast('Pengaturan berhasil disimpan!', 'success');
}

// --- AGENT INDIVIDUAL CONFIGURATION MODAL ---
function openAgentConfigModal(agentType) {
  state.activeConfigTargetAgent = agentType;
  const isTranscript = agentType === 'transcript';
  const agentCfg = isTranscript ? state.config.transcriptAgent : state.config.summaryAgent;
  
  if (elements.agentConfigModalTitle) {
    elements.agentConfigModalTitle.textContent = isTranscript ? 'Konfigurasi Transcript Agent' : 'Konfigurasi Summary & Notula Agent';
  }
  if (elements.agentConfigTargetName) {
    elements.agentConfigTargetName.textContent = isTranscript ? 'Transcript & Polish Agent (Panel Kiri)' : 'Summary & Intelligence Agent (Panel Kanan)';
  }
  
  if (elements.agentConfigUseDefault) {
    elements.agentConfigUseDefault.checked = agentCfg ? !!agentCfg.useDefault : true;
  }
  if (elements.agentCustomBaseUrl) {
    elements.agentCustomBaseUrl.value = agentCfg?.baseUrl || '';
  }
  if (elements.agentCustomApiKey) {
    elements.agentCustomApiKey.value = agentCfg?.apiKey || '';
  }
  
  toggleAgentCustomFields();
  elements.agentConfigModal?.classList.remove('hidden');
}

function closeAgentConfigModal() {
  elements.agentConfigModal?.classList.add('hidden');
}

function toggleAgentCustomFields() {
  const useDefault = elements.agentConfigUseDefault ? elements.agentConfigUseDefault.checked : true;
  if (elements.agentCustomFields) {
    if (useDefault) {
      elements.agentCustomFields.classList.add('disabled');
    } else {
      elements.agentCustomFields.classList.remove('disabled');
    }
  }
}

function saveAgentConfig() {
  const agentType = state.activeConfigTargetAgent;
  const isTranscript = agentType === 'transcript';
  const targetObj = isTranscript ? state.config.transcriptAgent : state.config.summaryAgent;
  
  if (elements.agentConfigUseDefault) {
    targetObj.useDefault = elements.agentConfigUseDefault.checked;
  }
  if (elements.agentCustomBaseUrl) {
    targetObj.baseUrl = elements.agentCustomBaseUrl.value.trim().replace(/\/+$/, '');
  }
  if (elements.agentCustomApiKey) {
    targetObj.apiKey = elements.agentCustomApiKey.value.trim();
  }
  
  localStorage.setItem('livevoice_config', JSON.stringify(state.config));
  closeAgentConfigModal();
  showToast(`Pengaturan khusus ${isTranscript ? 'Transcript Agent' : 'Summary Agent'} berhasil disimpan!`, 'success');
}

function getAgentConfig(agentType) {
  const isTranscript = agentType === 'transcript';
  const agentSpec = isTranscript ? state.config.transcriptAgent : state.config.summaryAgent;
  const model = isTranscript 
    ? (elements.transcriptModelSelect?.value || agentSpec?.model || 'combo-gratis')
    : (elements.summaryModelSelect?.value || agentSpec?.model || 'combo-gratis');
    
  const isGoogle = isGoogleModel(model);
  const isOmni = isOmniModel(model);
  
  let baseUrl = state.config.cfrouterBaseUrl || DEFAULT_CONFIG.cfrouterBaseUrl;
  let apiKey = isGoogle ? state.config.geminiApiKey : (state.config.cfrouterApiKey || DEFAULT_CONFIG.cfrouterApiKey);

  if (isOmni) {
    baseUrl = state.config.omniBaseUrl || DEFAULT_CONFIG.omniBaseUrl;
    apiKey = state.config.omniApiKey || DEFAULT_CONFIG.omniApiKey;
  }
  
  // If agent has custom override and useDefault is false
  if (agentSpec && !agentSpec.useDefault) {
    if (agentSpec.baseUrl) baseUrl = agentSpec.baseUrl;
    if (agentSpec.apiKey) apiKey = agentSpec.apiKey;
  }
  
  return { model, isGoogle, isOmni, baseUrl, apiKey };
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
    views[key].btn?.classList.toggle('active', isTarget);
    views[key].el?.classList.toggle('active', isTarget);
    views[key].el?.classList.toggle('hidden', !isTarget);
  });

  if (viewName === 'viewHistory') {
    refreshHistoryList();
  }
  initLucideIcons();
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
  // Top App Navigation Tabs
  elements.tabNavLive?.addEventListener('click', () => switchView('viewLiveTranscribe'));
  elements.tabNavUpload?.addEventListener('click', () => switchView('viewUploadAudio'));
  elements.tabNavHistory?.addEventListener('click', () => switchView('viewHistory'));

  // Audio Source Type Pills
  elements.srcTypeMic?.addEventListener('click', () => switchAudioSourceType('mic'));
  elements.srcTypeDesktop?.addEventListener('click', () => switchAudioSourceType('desktop'));
  elements.srcTypeMix?.addEventListener('click', () => switchAudioSourceType('mix'));

  // Mic Device Dropdown & Refresh
  elements.micDeviceSelect?.addEventListener('change', (e) => {
    state.selectedMicDeviceId = e.target.value;
    showToast(`Driver mikrofon dipilih: ${elements.micDeviceSelect.selectedOptions[0]?.text || 'Default'}`, 'info');
    if (state.isRecording) {
      restartAudioCaptureOnDeviceChange();
    }
  });
  elements.btnRefreshAudioDevices?.addEventListener('click', () => {
    enumerateMicrophones(true);
  });

  // Desktop Sound Picker Button
  elements.btnSelectDesktopAudio?.addEventListener('click', selectDesktopAudioSource);

  // Toggle Recording
  elements.btnToggleRecord?.addEventListener('click', toggleRecording);
  
  // Dual-Agent Model Selectors
  elements.transcriptModelSelect?.addEventListener('change', (e) => {
    state.config.transcriptAgent.model = e.target.value;
    saveConfig();
    showToast(`Transcript Agent diubah ke ${e.target.value}`, 'info');
  });

  elements.summaryModelSelect?.addEventListener('change', (e) => {
    state.config.summaryAgent.model = e.target.value;
    saveConfig();
    updateModelUI();
    showToast(`Summary Agent diubah ke ${e.target.value}`, 'info');
  });

  // Top Active Model Quick Selector Listener
  elements.activeModelSelect?.addEventListener('change', (e) => {
    const selected = e.target.value;
    state.config.activeModel = selected;
    if (isGoogleModel(selected)) {
      state.config.geminiModel = selected;
      if (elements.geminiAudioModelSelect) {
        elements.geminiAudioModelSelect.value = selected;
      }
      if (elements.geminiDefaultModel) {
        elements.geminiDefaultModel.value = selected;
      }
    }
    // Also sync Summary Agent if model exists in options
    if (elements.summaryModelSelect && Array.from(elements.summaryModelSelect.options).some(o => o.value === selected)) {
      elements.summaryModelSelect.value = selected;
      state.config.summaryAgent.model = selected;
    }
    saveConfig();
    updateModelUI();
    showToast(`Active Model diubah ke: ${selected}`, 'info');
  });

  // Dedicated Gemini Audio-In Model Selector Listener
  elements.geminiAudioModelSelect?.addEventListener('change', (e) => {
    const chosen = e.target.value;
    if (chosen === 'gemini-3.5-transcribe-live' || chosen === 'gemini-3.5-live-translate-preview') {
      switchMode('gemini-live');
      if (elements.geminiLiveModelSelect) {
        elements.geminiLiveModelSelect.value = chosen;
      }
      showToast(`⚡ Model ${chosen} khusus WebSocket Streaming. Beralih otomatis ke mode Gemini Live (WS)!`, 'info');
      return;
    }
    state.config.geminiModel = chosen;
    if (elements.geminiDefaultModel) {
      elements.geminiDefaultModel.value = chosen;
    }
    saveConfig();
    updateModelUI();
    showToast(`Model Gemini Audio-In diubah ke: ${chosen}`, 'info');
  });

  elements.geminiLiveModelSelect?.addEventListener('change', (e) => {
    const chosen = e.target.value;
    showToast(`Model Gemini Live Streaming diubah ke: ${chosen}`, 'info');
  });

  // Dual-Agent Config Modal Triggers
  elements.btnTranscriptAgentConfig?.addEventListener('click', () => openAgentConfigModal('transcript'));
  elements.btnSummaryAgentConfig?.addEventListener('click', () => openAgentConfigModal('summary'));
  elements.btnCloseAgentConfig?.addEventListener('click', closeAgentConfigModal);
  elements.btnCancelAgentConfig?.addEventListener('click', closeAgentConfigModal);
  elements.btnSaveAgentConfig?.addEventListener('click', saveAgentConfig);
  elements.agentConfigUseDefault?.addEventListener('change', toggleAgentCustomFields);
  
  // Language Change (Bilingual ID+EN or specific language)
  elements.speechLangSelect?.addEventListener('change', (e) => {
    state.config.language = e.target.value;
    if (state.speechRecognition) {
      state.speechRecognition.lang = getSpeechRecognitionLang();
    }
    saveConfig();
    showToast(`Bahasa diubah ke ${elements.speechLangSelect.selectedOptions[0]?.text || e.target.value}`, 'info');
  });

  // Mic Preamp & Whisper Boost Change
  elements.micGainSelect?.addEventListener('change', (e) => {
    const gainVal = parseFloat(e.target.value) || 1.0;
    state.config.micGain = e.target.value;
    if (state.gainNode && state.audioContext) {
      state.gainNode.gain.setValueAtTime(gainVal, state.audioContext.currentTime);
    }
    saveConfig();
    showToast(`Sensitivitas suara diatur ke: ${elements.micGainSelect.selectedOptions[0]?.text || e.target.value}`, 'info');
  });

  // Browser Noise Gate (Noise Suppression) Toggle
  elements.chkNoiseSuppression?.addEventListener('change', async (e) => {
    const isEnabled = e.target.checked;
    state.config.browserNoiseSuppression = isEnabled;
    updateNoiseGateUI();
    saveConfig();

    // Dynamically apply constraint if mic stream is live
    if (state.micStream) {
      const track = state.micStream.getAudioTracks()[0];
      if (track && typeof track.applyConstraints === 'function') {
        try {
          await track.applyConstraints({
            noiseSuppression: isEnabled
          });
        } catch (err) {
          console.warn('Gagal applyConstraints noiseSuppression, restart capture:', err);
          restartAudioCaptureOnDeviceChange();
        }
      }
    }

    if (isEnabled) {
      showToast('Noise Gate Browser: AKTIF (Derau/bising disaring, suara pelan/bisikan mungkin terpotong)', 'info');
    } else {
      showToast('Noise Gate Browser: NONAKTIF (Sensitivitas penuh, suara pelan/bisikan tertangkap jelas)', 'success');
    }
  });

  // Mode Selection Pills
  elements.modeLiveSpeech?.addEventListener('click', () => switchMode('live-speech'));
  elements.modeDirectAudio?.addEventListener('click', () => switchMode('direct-audio'));
  elements.modeGeminiLive?.addEventListener('click', () => switchMode('gemini-live'));

  // Quick Action Buttons
  elements.btnSaveLiveToHistory?.addEventListener('click', () => saveCurrentLiveSessionToHistory());
  elements.btnClearTranscript?.addEventListener('click', clearTranscript);
  elements.btnCopyTranscript?.addEventListener('click', copyTranscript);
  elements.btnExportTranscript?.addEventListener('click', openExportModal);
  elements.btnProcessDirectAudio?.addEventListener('click', processDirectAudioWithGemini);

  // AI Action Buttons (Right Panel - Summary & Intelligence)
  elements.btnPolishText?.addEventListener('click', () => handleAIAction('polish', null, false, 'summary'));
  elements.btnSummarize?.addEventListener('click', () => handleAIAction('summarize', null, false, 'summary'));
  elements.btnActionItems?.addEventListener('click', () => handleAIAction('action-items', null, false, 'summary'));
  elements.btnCustomPrompt?.addEventListener('click', () => {
    elements.customPromptBox?.classList.toggle('hidden');
    if (!elements.customPromptBox?.classList.contains('hidden')) {
      elements.customPromptInput?.focus();
    }
  });
  elements.btnRunCustomPrompt?.addEventListener('click', () => {
    const prompt = elements.customPromptInput?.value.trim();
    if (!prompt) {
      showToast('Ketik instruksi prompt terlebih dahulu.', 'error');
      return;
    }
    handleAIAction('custom', prompt, false, 'summary');
  });

  // AI Output Card Actions
  elements.btnToggleNotepadView?.addEventListener('click', toggleNotepadView);
  elements.btnCopyAIResult?.addEventListener('click', copyAIResult);
  elements.btnClearAIResult?.addEventListener('click', clearAIResult);
  elements.btnApplyPolishToTranscript?.addEventListener('click', applyPolishToTranscript);
  elements.autoPolishToggle?.addEventListener('change', (e) => {
    state.config.autoPolish = e.target.checked;
    saveConfig();
  });

  // Upload View Setup
  setupUploadEventListeners();

  // History Search & Clear
  elements.historySearchInput?.addEventListener('input', (e) => {
    renderHistoryCards(e.target.value.trim().toLowerCase());
  });
  elements.btnClearAllHistory?.addEventListener('click', clearAllHistory);

  // Toolbar Quick Actions
  elements.btnDownloadRecordedAudio?.addEventListener('click', downloadRecordedAudio);

  // Settings Modal Events
  elements.btnOpenSettings?.addEventListener('click', () => openSettingsModal());
  elements.btnCloseSettings?.addEventListener('click', closeSettingsModal);
  elements.btnSaveSettings?.addEventListener('click', () => {
    saveConfig();
    closeSettingsModal();
  });
  elements.btnResetSettings?.addEventListener('click', resetSettingsToDefault);

  // API Usage & Quota Modal Events
  elements.btnOpenApiUsage?.addEventListener('click', openApiUsageModal);
  elements.btnCloseApiUsage?.addEventListener('click', closeApiUsageModal);
  elements.btnClearApiUsageStats?.addEventListener('click', clearApiUsageStats);
  elements.btnExportApiLogsCsv?.addEventListener('click', exportApiLogsToCsv);

  // Localhost Omni Router Settings Actions
  elements.btnResetOmniUrl?.addEventListener('click', () => {
    if (elements.omniBaseUrl) elements.omniBaseUrl.value = DEFAULT_CONFIG.omniBaseUrl;
    state.config.omniBaseUrl = DEFAULT_CONFIG.omniBaseUrl;
    showToast('Base URL Omni Router direset ke default (http://localhost:20128/v1)', 'info');
  });
  elements.btnAutoDetectOmniKey?.addEventListener('click', autoDetectOmniKey);
  elements.btnTestOmniConnection?.addEventListener('click', testOmniConnection);

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

  // Windows Voice Recorder Style Audio Marker Button & Shortcut (M)
  elements.btnAddAudioMarker?.addEventListener('click', () => addAudioMarker());
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'm' || e.key === 'M') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      if (state.isRecording) {
        e.preventDefault();
        addAudioMarker();
      }
    }
  });

  // Export Modal Events
  elements.btnCloseExport?.addEventListener('click', closeExportModal);
  document.querySelectorAll('.export-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const format = btn.getAttribute('data-format');
      exportTranscript(format);
      closeExportModal();
    });
  });

  // Temp Summary Modal Events
  elements.btnOpenSummaryHistory?.addEventListener('click', openSummaryHistoryModal);
  elements.btnCloseSummaryHistory?.addEventListener('click', closeSummaryHistoryModal);
  elements.btnOpenTempFolder?.addEventListener('click', openTempFolderInWindowsExplorer);
  elements.btnOpenFolderFromModal?.addEventListener('click', openTempFolderInWindowsExplorer);
  elements.btnRefreshTempSummaries?.addEventListener('click', () => loadTempSummaryHistory(true));
  elements.tempSummarySearchInput?.addEventListener('input', (e) => {
    filterTempSummaryCards(e.target.value.trim().toLowerCase());
  });

  // Collapsible Audio Banner, Logs, and Audio-In History Modal Events
  elements.btnToggleAudioBanner?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleAudioBannerCollapse();
  });
  elements.audioBannerTopBar?.addEventListener('click', () => {
    if (elements.directAudioProgress?.classList.contains('is-collapsed')) {
      toggleAudioBannerCollapse();
    }
  });
  elements.btnViewGeminiAudioLogs?.addEventListener('click', openGeminiLogsModal);
  elements.btnCloseGeminiLogs?.addEventListener('click', closeGeminiLogsModal);
  elements.btnRefreshGeminiLogs?.addEventListener('click', openGeminiLogsModal);

  elements.btnViewAudioInHistory?.addEventListener('click', openAudioInHistoryModal);
  elements.btnOpenAudioInFolderQuick?.addEventListener('click', openAudioInTempFolderInExplorer);
  elements.btnCloseAudioInHistory?.addEventListener('click', closeAudioInHistoryModal);
  elements.btnRefreshAudioInHistory?.addEventListener('click', () => openAudioInHistoryModal());
  elements.btnOpenAudioInFolderFromModal?.addEventListener('click', openAudioInTempFolderInExplorer);
  elements.audioInSearchInput?.addEventListener('input', (e) => {
    renderAudioInHistoryCards(e.target.value.trim().toLowerCase());
  });

  // Auto-Send Toggle and Interval Selection Events
  elements.chkAutoSendGeminiAudio?.addEventListener('change', (e) => {
    updateAudioStreamProgress(0, e.target.checked);
  });
  elements.autoStreamIntervalSelect?.addEventListener('change', (e) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 10) {
      state.autoStreamIntervalSec = val;
      showToast(`Interval auto-stream Gemini diatur ke ${val} detik.`, 'info');
      updateAudioStreamProgress(0, elements.chkAutoSendGeminiAudio ? elements.chkAutoSendGeminiAudio.checked : true);
    }
  });

  // Summary Input Source Selector Events
  elements.srcTabLive?.addEventListener('click', () => setSummarySourceTab('live'));
  elements.srcTabFile?.addEventListener('click', () => setSummarySourceTab('file'));
  elements.srcTabRecent?.addEventListener('click', () => setSummarySourceTab('recent'));

  elements.btnBrowseSummaryFile?.addEventListener('click', () => elements.summaryFileInput?.click());
  elements.summaryDropzone?.addEventListener('click', (e) => {
    if (e.target !== elements.btnBrowseSummaryFile && !elements.btnBrowseSummaryFile?.contains(e.target)) {
      elements.summaryFileInput?.click();
    }
  });

  elements.summaryFileInput?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleSummaryFilesUpload(e.target.files);
    }
  });

  // Drag & drop for summary files
  elements.summaryDropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.summaryDropzone.classList.add('drag-over');
  });
  elements.summaryDropzone?.addEventListener('dragleave', () => {
    elements.summaryDropzone.classList.remove('drag-over');
  });
  elements.summaryDropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.summaryDropzone.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleSummaryFilesUpload(e.dataTransfer.files);
    }
  });

  // Recent Sessions Checklist Multi-Select Events
  elements.recentSessionSearch?.addEventListener('input', (e) => {
    populateRecentSessionsChecklist(e.target.value.trim());
  });
  elements.btnSelectAllRecent?.addEventListener('click', () => {
    (state.historyList || []).forEach(s => state.selectedRecentSessionIds.add(s.id));
    populateRecentSessionsChecklist(elements.recentSessionSearch?.value.trim() || '');
    applyRecentSessionsSource();
  });
  elements.btnClearRecentSelection?.addEventListener('click', () => {
    state.selectedRecentSessionIds.clear();
    populateRecentSessionsChecklist(elements.recentSessionSearch?.value.trim() || '');
    applyRecentSessionsSource();
  });
  elements.btnRefreshRecentSessions?.addEventListener('click', () => {
    populateRecentSessionsChecklist(elements.recentSessionSearch?.value.trim() || '');
  });
  elements.btnApplyRecentSelection?.addEventListener('click', () => {
    applyRecentSessionsSource();
    showToast('Sesi riwayat terpilih siap diolah AI!', 'success');
  });
  elements.btnResetToLiveSource?.addEventListener('click', () => {
    resetSummarySourceToLive();
  });

  // History View Batch Actions
  elements.chkSelectAllHistory?.addEventListener('change', (e) => {
    toggleSelectAllHistoryCards(e.target.checked);
  });
  elements.btnBatchSummarizeHistory?.addEventListener('click', batchSummarizeSelectedHistory);
  elements.btnBatchExportHistory?.addEventListener('click', batchExportSelectedHistory);
  elements.btnBatchDeleteHistory?.addEventListener('click', batchDeleteSelectedHistory);

  function syncLiveSessionImmediately() {
    if (!state.transcriptSegments || state.transcriptSegments.length === 0) return;
    const fullText = getFullTranscriptText().trim();
    if (!fullText) return;
    const now = new Date();
    if (!state.currentSessionId) {
      state.currentSessionId = 'live_' + Date.now();
      state.currentSessionTitle = `Live Session — ${now.toLocaleDateString('id-ID')}`;
      state.currentSessionCreatedAt = now.toISOString();
    }
    const entry = {
      id: state.currentSessionId,
      title: state.currentSessionTitle,
      sourceType: 'live',
      createdAt: state.currentSessionCreatedAt,
      updatedAt: now.toISOString(),
      model: getEffectiveModel(),
      duration: elements.recordTimer?.textContent || '00:00',
      transcriptText: fullText,
      segments: [...state.transcriptSegments],
      markers: [...state.audioMarkers],
      aiAnalysis: state.lastAIResult || null
    };
    try {
      const history = JSON.parse(localStorage.getItem('livevoice_history') || '[]');
      const idx = history.findIndex(h => h.id === entry.id);
      if (idx >= 0) {
        history[idx] = entry;
      } else {
        history.unshift(entry);
      }
      localStorage.setItem('livevoice_history', JSON.stringify(history.slice(0, 60)));
    } catch (e) {}
  }

  // Auto-save live session before page unload or hidden
  window.addEventListener('beforeunload', () => {
    syncLiveSessionImmediately();
    saveCurrentLiveSessionToHistory(true);
  });
  window.addEventListener('pagehide', () => {
    syncLiveSessionImmediately();
    saveCurrentLiveSessionToHistory(true);
  });

  // History Detail Modal Events
  elements.btnLoadHistoryToLive?.addEventListener('click', () => {
    if (state.activeDetailHistoryId) {
      loadHistoryItemToEditor(state.activeDetailHistoryId);
      closeHistoryDetailModal();
    }
  });
  elements.btnCopyHistoryDetail?.addEventListener('click', () => {
    if (state.activeDetailHistoryId) {
      copyHistoryItem(state.activeDetailHistoryId);
    }
  });
  elements.btnExportHistoryDetail?.addEventListener('click', () => {
    if (state.activeDetailHistoryId) {
      exportHistoryItem(state.activeDetailHistoryId);
    }
  });
  elements.btnCloseHistoryDetail?.addEventListener('click', closeHistoryDetailModal);

  // Close modals on backdrop click
  window.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) closeSettingsModal();
    if (e.target === elements.exportModal) closeExportModal();
    if (e.target === elements.agentConfigModal) closeAgentConfigModal();
    if (e.target === elements.summaryHistoryModal) closeSummaryHistoryModal();
    if (e.target === elements.geminiLogsModal) closeGeminiLogsModal();
    if (e.target === elements.audioInHistoryModal) closeAudioInHistoryModal();
    if (e.target === elements.apiUsageModal) closeApiUsageModal();
    if (e.target === elements.historyDetailModal) closeHistoryDetailModal();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeHistoryDetailModal();
    }
  });
}

// --- WINDOWS VOICE RECORDER STYLE AUDIO MARKER SYSTEM ---

function addAudioMarker(customLabel = null) {
  const elapsed = elements.recordTimer ? elements.recordTimer.textContent : '00:00';
  const timeStr = new Date().toTimeString().substring(0, 8);
  const markerId = 'marker_' + Date.now();
  
  state.markersCount = (state.markersCount || 0) + 1;
  const label = customLabel || `Penanda #${state.markersCount}`;
  
  const markerObj = {
    id: markerId,
    elapsed: elapsed,
    time: timeStr,
    label: label
  };

  state.audioMarkers.push(markerObj);

  // Insert marker segment into transcript stream
  state.transcriptSegments.push({
    id: markerId,
    isMarker: true,
    elapsed: elapsed,
    time: timeStr,
    text: label
  });

  renderTranscript();
  renderMarkerChips();
  
  if (elements.audioMarkerStrip) {
    elements.audioMarkerStrip.classList.remove('hidden');
  }

  showToast(`🚩 Penanda audio ditambahkan pada ${elapsed} (${label})`, 'success');
}

function renderMarkerChips() {
  if (!elements.markerChipsList) return;

  if (state.audioMarkers.length === 0) {
    elements.markerChipsList.innerHTML = '<span class="text-muted" style="font-size: 0.72rem; padding: 2px 6px;">Belum ada penanda</span>';
    return;
  }

  let html = '';
  state.audioMarkers.forEach(m => {
    html += `
      <button class="marker-chip" onclick="window.scrollToMarker('${m.id}')" title="Lompat ke penanda ${m.elapsed} di transkrip">
        <i data-lucide="flag" class="icon-xs"></i>
        <span>${m.elapsed} · ${escapeHtml(m.label)}</span>
      </button>
    `;
  });

  elements.markerChipsList.innerHTML = html;
  initLucideIcons();
}

window.scrollToMarker = function(markerId) {
  const el = document.getElementById(`marker-${markerId}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const badge = el.querySelector('.chat-marker-badge') || el;
    badge.classList.remove('flash-highlight');
    void badge.offsetWidth; // trigger reflow
    badge.classList.add('flash-highlight');
  } else {
    showToast('Posisi penanda tidak ditemukan di transkrip.', 'info');
  }
};

window.editMarkerLabel = function(markerId) {
  const marker = state.audioMarkers.find(m => String(m.id) === String(markerId));
  const seg = state.transcriptSegments.find(s => String(s.id) === String(markerId));
  const current = marker ? marker.label : (seg ? seg.text : '');
  
  const newLabel = prompt('Ubah catatan / label penanda ini:', current);
  if (newLabel !== null && newLabel.trim()) {
    const cleanLabel = newLabel.trim();
    if (marker) marker.label = cleanLabel;
    if (seg) seg.text = cleanLabel;
    renderTranscript();
    renderMarkerChips();
    showToast('Label penanda berhasil diperbarui!', 'success');
  }
};

window.deleteMarker = function(markerId) {
  state.audioMarkers = state.audioMarkers.filter(m => String(m.id) !== String(markerId));
  state.transcriptSegments = state.transcriptSegments.filter(s => String(s.id) !== String(markerId));
  renderTranscript();
  renderMarkerChips();
  showToast('Penanda dihapus.', 'info');
};

function updateNoiseGateUI() {
  const isSuppressionOn = Boolean(state.config.browserNoiseSuppression);
  if (elements.chkNoiseSuppression) {
    elements.chkNoiseSuppression.checked = isSuppressionOn;
  }
  if (elements.noiseGateStatusLabel) {
    elements.noiseGateStatusLabel.textContent = isSuppressionOn
      ? 'Noise Gate: ON (Filter Bising)'
      : 'Noise Gate: OFF (Peka Bisikan)';
    elements.noiseGateStatusLabel.style.color = isSuppressionOn ? 'var(--text-secondary)' : '#38bdf8';
  }
}

function updateModelUI() {
  const summaryModel = elements.summaryModelSelect?.value || state.config.summaryAgent?.model || 'combo-gratis';
  const transcriptModel = elements.transcriptModelSelect?.value || state.config.transcriptAgent?.model || 'combo-gratis';
  const audioModel = elements.geminiAudioModelSelect?.value || state.config.geminiModel || 'gemini-3.6-flash';
  
  if (elements.headerTranscriptModelName) {
    elements.headerTranscriptModelName.textContent = transcriptModel;
  }
  if (elements.headerSummaryModelName) {
    elements.headerSummaryModelName.textContent = summaryModel;
  }

  if (elements.engineBadgeText) {
    elements.engineBadgeText.textContent = `Summary Agent: ${summaryModel}`;
  }
  if (elements.modelProviderBadge) {
    if (isOmniModel(summaryModel) || isOmniModel(transcriptModel)) {
      elements.modelProviderBadge.className = 'provider-badge omni';
      elements.modelProviderBadge.textContent = '⚡ Omni Router (:20128)';
    } else if (isGoogleModel(summaryModel)) {
      elements.modelProviderBadge.className = 'provider-badge google';
      elements.modelProviderBadge.textContent = 'Google Gemini Siap';
    } else {
      elements.modelProviderBadge.className = 'provider-badge cfrouter';
      elements.modelProviderBadge.textContent = 'CF Router Siap';
    }
  }
  if (elements.aiModelUsedBadge) {
    elements.aiModelUsedBadge.textContent = summaryModel;
  }
}

function isGoogleModel(modelName) {
  return typeof modelName === 'string' && (modelName.startsWith('gemini') || modelName.includes('google'));
}

function isOmniModel(modelName) {
  if (typeof modelName !== 'string') return false;
  return modelName.startsWith('combo-') || modelName.startsWith('auto/') || modelName.startsWith('dva/') || modelName.includes('omni');
}

function switchMode(mode, isSilent = false) {
  state.activeMode = mode;
  state.config.activeMode = mode;
  elements.modeLiveSpeech?.classList.toggle('active', mode === 'live-speech');
  elements.modeDirectAudio?.classList.toggle('active', mode === 'direct-audio');
  elements.modeGeminiLive?.classList.toggle('active', mode === 'gemini-live');

  if (mode === 'direct-audio') {
    elements.directAudioProgress?.classList.remove('hidden');
    elements.geminiLiveProgress?.classList.add('hidden');
    updateAudioStreamProgress(0, elements.chkAutoSendGeminiAudio ? elements.chkAutoSendGeminiAudio.checked : true);
    if (!isSilent) {
      showToast('Mode Gemini Audio-In: Merekam potongan WebM audio berkala untuk Gemini Multimodal.', 'info');
    }
  } else if (mode === 'gemini-live') {
    elements.directAudioProgress?.classList.add('hidden');
    elements.geminiLiveProgress?.classList.remove('hidden');
    updateGeminiLiveStatus('standby', 'Standby (Klik "Mulai Transkripsi" untuk menghubungkan WebSocket)');
    if (!isSilent) {
      showToast('Mode Gemini Live (WS): Streaming audio PCM 16kHz langsung tanpa jeda upload!', 'success');
    }
  } else {
    elements.directAudioProgress?.classList.add('hidden');
    elements.geminiLiveProgress?.classList.add('hidden');
    if (!isSilent) {
      showToast('Mode Realtime STT: Menggunakan browser Speech Recognition live.', 'info');
    }
  }
  updateModelUI();
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
    
    // Always provide Default system microphone option
    const defaultOpt = document.createElement('option');
    defaultOpt.value = 'default';
    defaultOpt.text = 'Default Microphone (Sistem)';
    if (!state.selectedMicDeviceId || state.selectedMicDeviceId === 'default') {
      defaultOpt.selected = true;
    }
    elements.micDeviceSelect.appendChild(defaultOpt);

    audioInputs.forEach((device, idx) => {
      const opt = document.createElement('option');
      opt.value = device.deviceId;
      opt.text = device.label || `Microphone ${idx + 1} (${device.deviceId.slice(0, 8)}...)`;
      if (device.deviceId === state.selectedMicDeviceId) {
        opt.selected = true;
      }
      elements.micDeviceSelect.appendChild(opt);
    });

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
    if (AudioContextClass) {
      if (!state.audioContext || state.audioContext.state === 'closed') {
        state.audioContext = new AudioContextClass();
      }
      if (state.audioContext.state === 'suspended') {
        await state.audioContext.resume();
      }
    }

    let finalStream = null;
    const type = state.audioSourceType;

    // 1. Capture Microphone if needed
    if (type === 'mic' || type === 'mix') {
      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: Boolean(state.config.browserNoiseSuppression),
        autoGainControl: true
      };
      
      if (state.selectedMicDeviceId && state.selectedMicDeviceId !== 'default') {
        audioConstraints.deviceId = { ideal: state.selectedMicDeviceId };
      }

      try {
        state.micStream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: false
        });
      } catch (micErr) {
        console.warn('Gagal dengan audioConstraints khusus, mencoba audio dasar:', micErr);
        state.micStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false
        });
      }
    }

    // 2. Capture or Verify Desktop Stream if needed
    if (type === 'desktop' || type === 'mix') {
      if (!state.desktopStream || state.desktopStream.getAudioTracks().length === 0) {
        showToast('Pilih layar atau aplikasi yang ingin diambil suaranya...', 'info');
        await selectDesktopAudioSource();
        if (!state.desktopStream || state.desktopStream.getAudioTracks().length === 0) {
          throw new Error('Suara desktop belum dipilih atau tidak memiliki audio. Centang "Bagikan audio".');
        }
      }
    }

    // 3. Routing Streams & Preamp Dynamics Processor (Penguat Suara Pelan & Bisikan)
    if (!state.audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) state.audioContext = new AudioContextClass();
    }

    const currentGainVal = parseFloat(state.config.micGain || '2.0') || 2.0;

    if (state.audioContext) {
      if (state.audioContext.state === 'suspended') {
        await state.audioContext.resume();
      }
      // Software Preamp Gain Node
      state.gainNode = state.audioContext.createGain();
      state.gainNode.gain.setValueAtTime(currentGainVal, state.audioContext.currentTime);

      // Dynamics Compressor: mengangkat suara bisikan/pelan dan mencegah clipping pada suara keras
      state.compressorNode = state.audioContext.createDynamicsCompressor();
      state.compressorNode.threshold.setValueAtTime(-45, state.audioContext.currentTime);
      state.compressorNode.knee.setValueAtTime(20, state.audioContext.currentTime);
      state.compressorNode.ratio.setValueAtTime(8, state.audioContext.currentTime);
      state.compressorNode.attack.setValueAtTime(0.003, state.audioContext.currentTime);
      state.compressorNode.release.setValueAtTime(0.25, state.audioContext.currentTime);
    }

    if (type === 'mic') {
      if (state.audioContext && state.micStream && state.micStream.getAudioTracks().length > 0) {
        const destination = state.audioContext.createMediaStreamDestination();
        state.micSourceNode = state.audioContext.createMediaStreamSource(state.micStream);
        
        state.micSourceNode.connect(state.gainNode);
        state.gainNode.connect(state.compressorNode);
        state.compressorNode.connect(destination);
        
        finalStream = destination.stream;
      } else {
        finalStream = state.micStream;
      }
    } else if (type === 'desktop') {
      finalStream = new MediaStream(state.desktopStream.getAudioTracks());
    } else if (type === 'mix') {
      if (!state.audioContext) {
        throw new Error('AudioContext tidak tersedia untuk pencampuran (MIX) audio.');
      }
      const destination = state.audioContext.createMediaStreamDestination();
      
      if (state.micStream && state.micStream.getAudioTracks().length > 0) {
        state.micSourceNode = state.audioContext.createMediaStreamSource(state.micStream);
        state.micSourceNode.connect(state.gainNode);
        state.gainNode.connect(state.compressorNode);
        state.compressorNode.connect(destination);
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

    if (!finalStream || finalStream.getAudioTracks().length === 0) {
      throw new Error('Tidak ada input audio aktif dari mikrofon atau sistem yang terdeteksi.');
    }

    state.mediaStream = finalStream;

    // Connect visualizer & audio analyser
    if (state.audioContext) {
      if (state.audioContext.state === 'suspended') {
        await state.audioContext.resume();
      }
      const sourceNode = state.audioContext.createMediaStreamSource(finalStream);
      state.analyser = state.audioContext.createAnalyser();
      state.analyser.fftSize = 256;
      sourceNode.connect(state.analyser);
      drawVisualizer();
    }

    // Setup MediaRecorder for audio recording
    startNewMediaRecorderSegment();
    return true;
  } catch (err) {
    console.error('Error starting audio capture pipeline:', err);
    showToast('Gagal memulai audio: ' + (err.message || err.name || 'Akses ditolak'), 'error');
    stopAudioCapture();
    return false;
  }
}

function startNewMediaRecorderSegment() {
  if (!state.mediaStream || typeof MediaRecorder === 'undefined') return;

  let recorderOptions = {};
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    recorderOptions = { mimeType: 'audio/webm;codecs=opus' };
  } else if (MediaRecorder.isTypeSupported('audio/webm')) {
    recorderOptions = { mimeType: 'audio/webm' };
  } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
    recorderOptions = { mimeType: 'audio/mp4' };
  } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
    recorderOptions = { mimeType: 'audio/ogg' };
  }

  state.audioChunks = [];
  try {
    state.mediaRecorder = new MediaRecorder(state.mediaStream, recorderOptions);
  } catch (e) {
    state.mediaRecorder = new MediaRecorder(state.mediaStream);
  }
  state.recordedMimeType = state.mediaRecorder.mimeType || 'audio/webm';

  state.mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      state.audioChunks.push(e.data);
      if (!state.fullSessionAudioChunks) state.fullSessionAudioChunks = [];
      state.fullSessionAudioChunks.push(e.data);
    }
  };

  state.mediaRecorder.start(1000);
}

function captureValidAudioSegmentBlob() {
  return new Promise((resolve) => {
    if (!state.mediaRecorder || state.mediaRecorder.state === 'inactive') {
      if (state.audioChunks && state.audioChunks.length > 0) {
        const type = state.recordedMimeType || 'audio/webm';
        const blob = new Blob(state.audioChunks, { type });
        state.audioChunks = [];
        resolve(blob);
      } else {
        resolve(null);
      }
      return;
    }

    state.mediaRecorder.addEventListener('stop', () => {
      const type = state.recordedMimeType || 'audio/webm';
      const blob = new Blob(state.audioChunks, { type });
      state.audioChunks = [];

      // If user is still actively recording, restart next clean segment immediately with fresh EBML header!
      if (state.isRecording && state.mediaStream) {
        startNewMediaRecorderSegment();
      }

      resolve(blob);
    }, { once: true });

    try {
      if (typeof state.mediaRecorder.requestData === 'function') {
        state.mediaRecorder.requestData();
      }
      state.mediaRecorder.stop();
    } catch (e) {
      resolve(null);
    }
  });
}

function stopAudioCapture() {
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    try {
      if (typeof state.mediaRecorder.requestData === 'function') {
        state.mediaRecorder.requestData();
      }
      state.mediaRecorder.stop();
    } catch (e) {}
  }
  if (state.micStream) {
    state.micStream.getTracks().forEach(t => t.stop());
    state.micStream = null;
  }
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach(t => t.stop());
    state.mediaStream = null;
  }
  if (state.visualizerAnimId) {
    cancelAnimationFrame(state.visualizerAnimId);
    state.visualizerAnimId = null;
  }
  if (state.audioContext && state.audioContext.state !== 'closed') {
    try { state.audioContext.close(); } catch (e) {}
    state.audioContext = null;
  }
  if (elements.volumeLevelBar) elements.volumeLevelBar.style.width = '0%';
  if (elements.audioDbLevelText) elements.audioDbLevelText.textContent = '-∞ dB';
  if (elements.audioLiveStatusBadge) {
    elements.audioLiveStatusBadge.className = 'audio-detect-badge standby';
  }
  if (elements.audioLiveStatusText) {
    elements.audioLiveStatusText.textContent = 'Mikrofon Standby';
  }
  if (elements.audioVisualizer) {
    const ctx = elements.audioVisualizer.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, elements.audioVisualizer.width, elements.audioVisualizer.height);
  }
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
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  canvas.width = canvas.offsetWidth || 340;
  canvas.height = canvas.offsetHeight || 60;
  
  if (state.analyser) {
    state.analyser.fftSize = 512;
  }
  
  const bufferLength = state.analyser ? state.analyser.frequencyBinCount : 0;
  const timeData = new Uint8Array(bufferLength);
  const freqData = new Uint8Array(bufferLength);

  if (state.visualizerAnimId) {
    cancelAnimationFrame(state.visualizerAnimId);
    state.visualizerAnimId = null;
  }

  function renderFrame() {
    if (!state.isRecording) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (elements.volumeLevelBar) elements.volumeLevelBar.style.width = '0%';
      if (elements.audioDbLevelText) elements.audioDbLevelText.textContent = '-∞ dB';
      if (elements.audioLiveStatusBadge) elements.audioLiveStatusBadge.className = 'audio-detect-badge standby';
      if (elements.audioLiveStatusText) elements.audioLiveStatusText.textContent = 'Mikrofon Standby';
      return;
    }
    
    state.visualizerAnimId = requestAnimationFrame(renderFrame);
    if (!state.analyser) return;

    state.analyser.getByteTimeDomainData(timeData);
    state.analyser.getByteFrequencyData(freqData);
    
    // Calculate RMS and Decibels (dB)
    let sumSquares = 0;
    for (let i = 0; i < bufferLength; i++) {
      const norm = (timeData[i] - 128) / 128;
      sumSquares += norm * norm;
    }
    const rms = Math.sqrt(sumSquares / bufferLength);
    const volumePercent = Math.min(100, Math.round(rms * 280));
    
    if (elements.volumeLevelBar) {
      elements.volumeLevelBar.style.width = `${volumePercent}%`;
    }

    let db = -60;
    if (rms > 0.0005) {
      db = Math.max(-60, Math.min(0, Math.round(20 * Math.log10(rms))));
    }

    if (elements.audioDbLevelText) {
      elements.audioDbLevelText.textContent = (db <= -50 || volumePercent <= 2) ? '-∞ dB' : `${db} dB`;
    }

    // Update Live Input Status Badge (Speaking vs Listening)
    if (elements.audioLiveStatusBadge && elements.audioLiveStatusText) {
      if (volumePercent > 6) {
        elements.audioLiveStatusBadge.className = 'audio-detect-badge speaking';
        elements.audioLiveStatusText.textContent = `Suara Masuk (${db} dB)`;
      } else {
        elements.audioLiveStatusBadge.className = 'audio-detect-badge listening';
        elements.audioLiveStatusText.textContent = 'Mendengarkan Mic...';
      }
    }

    // Render wave only if canvas is visible in DOM
    if (canvas && canvas.offsetParent !== null) {
      // Clear Canvas with subtle dark fade
      ctx.fillStyle = 'rgba(8, 12, 20, 0.4)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw Background Frequency Bars (soft luminescence)
      const barWidth = (canvas.width / (bufferLength / 2)) * 1.8;
      let barX = 0;
      for (let i = 0; i < bufferLength / 2; i++) {
        const barH = (freqData[i] / 255) * (canvas.height * 0.75);
        ctx.fillStyle = 'rgba(99, 102, 241, 0.09)';
        ctx.fillRect(barX, canvas.height - barH, barWidth - 1, barH);
        barX += barWidth;
        if (barX > canvas.width) break;
      }

      // Draw Realtime Oscilloscope Sine Wave
      ctx.lineWidth = 2.5;
      const waveGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
      waveGrad.addColorStop(0, '#06b6d4');
      waveGrad.addColorStop(0.5, '#38bdf8');
      waveGrad.addColorStop(0.8, '#6366f1');
      waveGrad.addColorStop(1, '#a855f7');
      
      ctx.strokeStyle = waveGrad;
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 8;
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = timeData[i] / 128.0;
        const y = (v * (canvas.height / 2));

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.stroke();
      ctx.shadowBlur = 0; // Reset shadow for performance
    }
  }

  renderFrame();
}

// Helper: SpeechRecognition API requires a valid BCP-47 language tag
function getSpeechRecognitionLang() {
  const lang = state.config.language || 'bilingual';
  // If user selected 'bilingual' (Indo + English), use 'id-ID' as base recognition grammar.
  // The Gemini AI Polish / Auto-Polish Agent will handle code-switching and English terms.
  if (lang === 'bilingual' || !lang) return 'id-ID';
  return lang;
}

// --- SPEECH RECOGNITION (WEB SPEECH API) ---
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    console.warn('SpeechRecognition API is not supported in this browser.');
    return null;
  }

  // Clean up any existing instance
  if (state.speechRecognition) {
    try {
      state.speechRecognition.onresult = null;
      state.speechRecognition.onerror = null;
      state.speechRecognition.onend = null;
      state.speechRecognition.abort();
    } catch (e) {}
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = getSpeechRecognitionLang();

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
    console.warn('Speech recognition event error:', event.error);
    if (event.error === 'not-allowed') {
      showToast('Izin mikrofon ditolak oleh browser. Izinkan akses mikrofon di pengaturan browser.', 'error');
      stopRecording();
    } else if (event.error === 'audio-capture') {
      showToast('Gagal menangkap input audio. Periksa apakah mikrofon aktif dan tidak digunakan aplikasi lain.', 'error');
    } else if (event.error === 'network') {
      showToast('Koneksi layanan Speech Recognition browser bermasalah. Periksa koneksi internet Anda.', 'warning');
    }
  };

  recognition.onend = () => {
    const mode = state.activeMode || state.config.activeMode || 'live-speech';
    if (state.isRecording && mode === 'live-speech') {
      setTimeout(() => {
        if (state.isRecording && (state.activeMode || state.config.activeMode || 'live-speech') === 'live-speech') {
          try {
            recognition.start();
          } catch (e) {
            console.log('Recognition restart deferred:', e);
          }
        }
      }, 250);
    }
  };

  state.speechRecognition = recognition;
  return recognition;
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
      handleAIAction('auto-polish', null, true, 'transcript');
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
  state.isRecording = true;
  state.fullSessionAudioChunks = [];
  const micReady = await startAudioCapture();
  if (!micReady) {
    state.isRecording = false;
    return;
  }

  drawVisualizer();
  state.startTime = Date.now();

  const mode = state.activeMode || state.config.activeMode || 'live-speech';
  if (mode === 'live-speech') {
    if (!state.speechRecognition) {
      setupSpeechRecognition();
    }
    if (state.speechRecognition) {
      try {
        state.speechRecognition.lang = getSpeechRecognitionLang();
        state.speechRecognition.start();
      } catch (e) {
        console.warn('SpeechRecognition start attempt:', e);
      }
    } else {
      showToast('Browser ini tidak mendukung Speech Recognition langsung. Silakan gunakan Google Chrome / MS Edge, atau beralih ke mode Gemini Audio-In.', 'warning');
    }
  } else if (mode === 'gemini-live') {
    startGeminiLiveStreaming();
  }

  elements.btnToggleRecord.classList.add('recording');
  elements.recordBtnText.textContent = 'Hentikan Transkripsi';
  elements.recordIcon.setAttribute('data-lucide', 'square');
  elements.liveStatusBadge.className = 'status-badge recording';
  elements.liveStatusBadge.innerHTML = '<span class="status-indicator"></span> Merekam Live...';
  
  // Activate Marker Button (Windows Voice Recorder Style)
  if (elements.btnAddAudioMarker) {
    elements.btnAddAudioMarker.disabled = false;
  }
  if (elements.audioMarkerStrip && state.audioMarkers.length > 0) {
    elements.audioMarkerStrip.classList.remove('hidden');
  }

  initLucideIcons();

  startTimer();
  showToast('Mikrofon/Audio aktif. Silakan mulai berbicara... (Tekan M untuk Menandai)', 'info');
}

function stopRecording() {
  state.isRecording = false;
  
  if (state.speechRecognition) {
    try {
      state.speechRecognition.stop();
    } catch (e) {}
  }

  if (state.activeMode === 'gemini-live') {
    stopGeminiLiveStreaming();
  }

  stopAudioCapture();
  stopTimer();

  // Deactivate Marker Button
  if (elements.btnAddAudioMarker) {
    elements.btnAddAudioMarker.disabled = true;
  }
  if (elements.markerBtnLabel) {
    elements.markerBtnLabel.textContent = 'Tandai';
  }

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

function updateAudioStreamProgress(elapsed = 0, autoStream = true) {
  const STREAM_INTERVAL = state.autoStreamIntervalSec || 30;
  const CIRCLE_CIRCUMFERENCE = 47.1;

  if (state.isSendingAudioChunk) {
    elements.streamPulseDot?.classList.add('sending');
    elements.audioStreamCountdownText?.classList.add('sending');
    elements.audioStreamProgressBar?.classList.add('sending');
    if (elements.audioStreamStatusText) {
      elements.audioStreamStatusText.textContent = '⚡ Mengirim potongan suara ke Gemini...';
    }
    if (elements.audioStreamCountdownText) {
      elements.audioStreamCountdownText.textContent = 'Mengirim...';
    }
    if (elements.audioStreamProgressBar) {
      elements.audioStreamProgressBar.style.width = '100%';
    }
    // Mini Circle meter update when sending
    if (elements.streamCircleMeter) {
      elements.streamCircleMeter.classList.add('sending');
      elements.streamCircleMeter.style.strokeDashoffset = '0px';
    }
    if (elements.streamMiniCountdown) {
      elements.streamMiniCountdown.classList.add('sending');
      elements.streamMiniCountdown.textContent = '⚡';
    }
    return;
  }

  elements.streamPulseDot?.classList.remove('sending');
  elements.audioStreamCountdownText?.classList.remove('sending');
  elements.audioStreamProgressBar?.classList.remove('sending');
  elements.streamCircleMeter?.classList.remove('sending');
  elements.streamMiniCountdown?.classList.remove('sending');

  if (!autoStream) {
    if (elements.audioStreamProgressBar) elements.audioStreamProgressBar.style.width = '0%';
    if (elements.audioStreamStatusText) {
      elements.audioStreamStatusText.textContent = 'Auto-Stream dijeda (klik "Kirim" manual)';
    }
    if (elements.audioStreamCountdownText) {
      elements.audioStreamCountdownText.textContent = 'Dijeda';
    }
    if (elements.streamCircleMeter) elements.streamCircleMeter.style.strokeDashoffset = `${CIRCLE_CIRCUMFERENCE}px`;
    if (elements.streamMiniCountdown) elements.streamMiniCountdown.textContent = 'Off';
    return;
  }

  if (!state.isRecording) {
    if (elements.audioStreamProgressBar) elements.audioStreamProgressBar.style.width = '0%';
    if (elements.audioStreamStatusText) {
      elements.audioStreamStatusText.textContent = `Mikrofon Standby (Auto-Stream siap ${STREAM_INTERVAL} detik)`;
    }
    if (elements.audioStreamCountdownText) {
      elements.audioStreamCountdownText.textContent = `${STREAM_INTERVAL}s`;
    }
    if (elements.streamCircleMeter) elements.streamCircleMeter.style.strokeDashoffset = `${CIRCLE_CIRCUMFERENCE}px`;
    if (elements.streamMiniCountdown) elements.streamMiniCountdown.textContent = `${STREAM_INTERVAL}s`;
    return;
  }

  const cycleElapsed = elapsed % STREAM_INTERVAL;
  const remainingSec = cycleElapsed === 0 && elapsed > 0 ? 0 : (STREAM_INTERVAL - cycleElapsed);
  const fillSec = cycleElapsed === 0 && elapsed > 0 ? STREAM_INTERVAL : cycleElapsed;
  const pct = Math.min(100, Math.round((fillSec / STREAM_INTERVAL) * 100));

  if (elements.audioStreamProgressBar) {
    elements.audioStreamProgressBar.style.width = `${pct}%`;
  }

  // Update mini circular progress bar (circumference = 47.1px)
  if (elements.streamCircleMeter) {
    const offset = Math.max(0, CIRCLE_CIRCUMFERENCE * (1 - (pct / 100)));
    elements.streamCircleMeter.style.strokeDashoffset = `${offset.toFixed(1)}px`;
  }

  if (elements.streamMiniCountdown) {
    elements.streamMiniCountdown.textContent = remainingSec > 0 ? `${remainingSec}s` : '⚡';
  }
  
  if (remainingSec === 0 || remainingSec === STREAM_INTERVAL) {
    if (elements.audioStreamCountdownText) elements.audioStreamCountdownText.textContent = 'Mengirim!';
    if (elements.audioStreamStatusText) elements.audioStreamStatusText.textContent = 'Memotong audio & mengirim ke Gemini...';
  } else {
    if (elements.audioStreamCountdownText) elements.audioStreamCountdownText.textContent = `${remainingSec}s lagi`;
    if (elements.audioStreamStatusText) elements.audioStreamStatusText.textContent = `Merekam audio (kirim ke Gemini dalam ${remainingSec}s)...`;
  }
}

function startTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    elements.recordTimer.textContent = `${mins}:${secs}`;
    if (elements.markerBtnLabel) {
      elements.markerBtnLabel.textContent = `Tandai (${mins}:${secs})`;
    }

    // Auto-stream Gemini Audio-In continuous chunking dynamically with state.autoStreamIntervalSec
    const isDirectAudio = (state.activeMode || state.config.activeMode) === 'direct-audio';
    const autoStream = elements.chkAutoSendGeminiAudio ? elements.chkAutoSendGeminiAudio.checked : true;
    const intervalSec = state.autoStreamIntervalSec || 30;
    
    if (isDirectAudio) {
      updateAudioStreamProgress(elapsed, autoStream);
      if (autoStream && elapsed > 0 && elapsed % intervalSec === 0 && state.audioChunks.length > 0 && !state.isProcessingAI && !state.isSendingAudioChunk) {
        processDirectAudioWithGemini(true);
      }
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(state.timerInterval);
  const autoStream = elements.chkAutoSendGeminiAudio ? elements.chkAutoSendGeminiAudio.checked : true;
  updateAudioStreamProgress(0, autoStream);
}

// --- TRANSCRIPT RENDERING & STATS (UNIFIED CONTINUOUS TEXT) ---
function renderTranscript() {
  const currentLive = (state.currentLiveSegmentText || state.rawInterimText || '').trim();
  const hasSegments = state.transcriptSegments.length > 0;

  if (!hasSegments && !currentLive) {
    elements.transcriptOutput.innerHTML = `
      <div class="empty-state" id="emptyStatePrompt">
        <div class="empty-icon-circle">
          <i data-lucide="file-text" class="empty-icon"></i>
        </div>
        <h3>Transkrip Suara Siap</h3>
        <p>Klik tombol <strong>"Mulai Transkripsi Live"</strong> dan mulailah berbicara. Hasil ucapan akan tertulis mengalir sebagai satu kesatuan teks utuh secara real-time.</p>
        <div class="quick-hints">
          <span>💡 <strong>Format Bersih:</strong> Semua percakapan menyatu langsung dalam satu teks tanpa bubble, rapi dan mudah disalin kapan saja.</span>
        </div>
      </div>
    `;
    initLucideIcons();
    return;
  }

  let unitsHtml = '';
  state.transcriptSegments.forEach(seg => {
    if (seg.isMarker) {
      unitsHtml += `<span class="transcript-inline-marker" id="marker-${seg.id}" data-id="${seg.id}" title="Penanda: ${seg.elapsed} (${seg.time})"><i data-lucide="flag" class="icon-tiny"></i> [${seg.elapsed}: ${escapeHtml(seg.text)}]</span> `;
      return;
    }

    if (seg.text && seg.text.trim()) {
      unitsHtml += `<span class="transcript-text-unit" data-id="${seg.id}">${escapeHtml(seg.text)} </span>`;
    }
  });

  if (currentLive) {
    unitsHtml += `<span class="transcript-live-interim" title="Sedang Mendengar Ucapan..."><span class="live-pulse-dot"></span>${escapeHtml(currentLive)}</span>`;
  }

  elements.transcriptOutput.innerHTML = `
    <div class="unified-transcript-paper">
      <div class="unified-transcript-body">
        ${unitsHtml}
      </div>
    </div>
  `;
  elements.transcriptOutput.scrollTop = elements.transcriptOutput.scrollHeight;
  initLucideIcons();
}

// Global copy handler for individual chat bubbles
window.copySegmentText = function(segmentId) {
  const seg = state.transcriptSegments.find(s => String(s.id) === String(segmentId));
  if (seg && seg.text) {
    navigator.clipboard.writeText(seg.text).then(() => {
      showToast('Teks obrolan disalin ke clipboard!', 'success');
    }).catch(() => {
      showToast('Gagal menyalin teks.', 'error');
    });
  }
};

// Global rename handler for speakers in chat bubbles
window.renameSpeakerPrompt = function(rawSpeakerName) {
  const currentAlias = state.speakerAliases[rawSpeakerName.toLowerCase()] || rawSpeakerName;
  const newName = prompt(`Ganti nama untuk pembicara "${currentAlias}":`, currentAlias);
  if (!newName || !newName.trim() || newName.trim() === currentAlias) return;

  const cleanNewName = newName.trim();
  state.speakerAliases[rawSpeakerName.toLowerCase()] = cleanNewName;
  state.speakerAliases[cleanNewName.toLowerCase()] = cleanNewName;

  // Update existing segments matching the old name or raw speaker
  state.transcriptSegments.forEach(seg => {
    if (!seg.isMarker && (seg.speaker === rawSpeakerName || seg.speaker === currentAlias)) {
      seg.speaker = cleanNewName;
    }
  });

  renderTranscript();
  updateStats();
  saveCurrentLiveSessionToHistory(true);
  showToast(`Nama pembicara berhasil diubah menjadi "${cleanNewName}". Semua balon obrolan diperbarui!`, 'success');
};

function getFullTranscriptText() {
  return state.transcriptSegments
    .map(s => s.isMarker ? `[Penanda ${s.elapsed}: ${s.text}]` : s.text)
    .join(' ') + (state.rawInterimText ? ' ' + state.rawInterimText : '');
}

function updateStats() {
  const fullText = getFullTranscriptText().trim();
  const words = fullText ? fullText.split(/\s+/).filter(Boolean).length : 0;
  const chars = fullText.length;
  
  if (elements.wordCountBadge) elements.wordCountBadge.textContent = words;
  if (elements.charCountBadge) elements.charCountBadge.textContent = chars;
}

function clearTranscript() {
  if (!confirm('Apakah Anda yakin ingin menghapus seluruh transkrip percakapan aktif?')) return;
  state.transcriptSegments = [];
  state.audioMarkers = [];
  state.markersCount = 0;
  state.rawInterimText = '';
  state.currentSessionId = null;
  state.currentSessionTitle = null;
  state.currentSessionCreatedAt = null;
  renderTranscript();
  renderMarkerChips();
  if (elements.audioMarkerStrip) {
    elements.audioMarkerStrip.classList.add('hidden');
  }
  updateStats();
  if (elements.lastProcessedBadge) elements.lastProcessedBadge.textContent = '-';
  showToast('Transkrip percakapan & penanda dibersihkan.', 'info');
}

function copyTranscript() {
  const text = getFullTranscriptText().trim();
  if (!text) {
    showToast('Tidak ada teks untuk disalin.', 'error');
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    showToast('Seluruh transkrip percakapan berhasil disalin!', 'success');
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

// --- SUMMARY INPUT SOURCE MANAGER (.MD / .TXT / RECENT TRANSCRIPTS) ---

function setSummarySourceTab(tab) {
  state.activeSummarySourceTab = tab;
  
  elements.srcTabLive?.classList.toggle('active', tab === 'live');
  elements.srcTabFile?.classList.toggle('active', tab === 'file');
  elements.srcTabRecent?.classList.toggle('active', tab === 'recent');

  elements.sourcePanelFile?.classList.toggle('hidden', tab !== 'file');
  elements.sourcePanelRecent?.classList.toggle('hidden', tab !== 'recent');

  if (tab === 'live') {
    state.customSummarySource = null;
    elements.activeSourceStatusPill?.classList.add('hidden');
  } else if (tab === 'recent') {
    populateRecentSessionsChecklist(elements.recentSessionSearch?.value.trim() || '');
  }
}

// MULTI-FILE UPLOAD LOGIC
async function handleSummaryFilesUpload(filesList) {
  if (!filesList || filesList.length === 0) return;
  const validExts = ['md', 'txt', 'markdown', 'log'];
  const newFiles = Array.from(filesList).filter(file => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    return validExts.includes(ext);
  });

  if (newFiles.length === 0) {
    showToast('Format berkas harus .md, .txt, .markdown, atau .log', 'error');
    return;
  }

  showToast(`Membaca ${newFiles.length} berkas...`, 'info');

  const readPromises = newFiles.map(file => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = (e.target.result || '').trim();
        const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
        resolve({
          name: file.name,
          size: file.size,
          text: text,
          words: words
        });
      };
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
  });

  const readResults = (await Promise.all(readPromises)).filter(Boolean);
  
  readResults.forEach(rf => {
    const exists = state.selectedSummaryFiles.some(f => f.name === rf.name && f.size === rf.size);
    if (!exists) {
      state.selectedSummaryFiles.push(rf);
    }
  });

  updateSummaryFilesSource();
  renderSummaryFilesChips();
  showToast(`${state.selectedSummaryFiles.length} berkas siap diolah oleh AI!`, 'success');
}

function renderSummaryFilesChips() {
  const container = elements.summaryFilesListContainer;
  if (!container) return;

  if (state.selectedSummaryFiles.length === 0) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = state.selectedSummaryFiles.map((file, idx) => {
    const sizeKb = (file.size / 1024).toFixed(1);
    return `
      <div class="summary-file-item" data-index="${idx}">
        <div class="summary-file-item-left">
          <i data-lucide="file-text" class="icon-tiny text-accent"></i>
          <span class="summary-file-item-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
          <span class="summary-file-item-meta">(${file.words} kata · ${sizeKb} KB)</span>
        </div>
        <button type="button" class="summary-file-item-remove" data-index="${idx}" title="Hapus berkas ini">
          <i data-lucide="x" class="icon-tiny"></i>
        </button>
      </div>
    `;
  }).join('');

  initLucideIcons();

  container.querySelectorAll('.summary-file-item-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      removeSummaryFile(idx);
    });
  });
}

function removeSummaryFile(index) {
  if (index >= 0 && index < state.selectedSummaryFiles.length) {
    const removedName = state.selectedSummaryFiles[index]?.name;
    state.selectedSummaryFiles.splice(index, 1);
    updateSummaryFilesSource();
    renderSummaryFilesChips();
    showToast(`Berkas "${removedName}" dihapus dari daftar pilihan.`, 'info');
  }
}

function updateSummaryFilesSource() {
  if (state.selectedSummaryFiles.length === 0) {
    state.customSummarySource = null;
    elements.activeSourceStatusPill?.classList.add('hidden');
    return;
  }

  const totalWords = state.selectedSummaryFiles.reduce((acc, f) => acc + f.words, 0);
  const totalBytes = state.selectedSummaryFiles.reduce((acc, f) => acc + f.size, 0);
  const totalKb = (totalBytes / 1024).toFixed(1);

  let combinedText = '';
  if (state.selectedSummaryFiles.length === 1) {
    combinedText = state.selectedSummaryFiles[0].text;
  } else {
    combinedText = state.selectedSummaryFiles.map((file, i) => {
      return `========================================\n=== [BERKAS ${i + 1}: ${file.name} (${file.words} kata)] ===\n========================================\n${file.text}`;
    }).join('\n\n');
  }

  const sourceName = state.selectedSummaryFiles.length === 1 
    ? state.selectedSummaryFiles[0].name 
    : `${state.selectedSummaryFiles.length} Berkas (${state.selectedSummaryFiles.map(f => f.name).join(', ')})`;

  state.customSummarySource = {
    type: 'file',
    name: sourceName,
    text: combinedText,
    files: [...state.selectedSummaryFiles]
  };

  updateSummarySourcePill('Berkas:', sourceName, `${totalWords} kata · ${totalKb} KB`);
}

// MULTI-HISTORY CHECKLIST LOGIC
async function populateRecentSessionsChecklist(searchQuery = '') {
  const container = elements.recentSessionsChecklist;
  if (!container) return;

  state.historyList = await getHistoryFromDatabase();
  let items = state.historyList || [];

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter(s => 
      (s.title && s.title.toLowerCase().includes(q)) ||
      (s.transcriptText && s.transcriptText.toLowerCase().includes(q)) ||
      (s.model && s.model.toLowerCase().includes(q))
    );
  }

  if (items.length === 0) {
    container.innerHTML = `
      <div class="recent-empty-state">
        <i data-lucide="inbox" class="icon-tiny text-muted"></i>
        <span>${searchQuery ? 'Tidak ada sesi yang cocok dengan kata kunci.' : 'Belum ada riwayat transkripsi tersimpan.'}</span>
      </div>
    `;
    initLucideIcons();
    updateRecentSelectionUI();
    return;
  }

  let html = '';
  items.forEach(session => {
    const isSelected = state.selectedRecentSessionIds.has(session.id);
    const dateStr = session.createdAt ? new Date(session.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
    const text = session.transcriptText || (session.segments || []).map(s => s.text).join(' ');
    const wordCount = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;

    html += `
      <label class="recent-check-item ${isSelected ? 'selected' : ''}" data-id="${session.id}">
        <input type="checkbox" class="recent-session-chk" value="${session.id}" ${isSelected ? 'checked' : ''}>
        <div class="recent-check-info">
          <span class="recent-check-title" title="${escapeHtml(session.title || 'Sesi Live')}">${escapeHtml(session.title || 'Sesi Live')}</span>
          <div class="recent-check-meta">
            <span>${dateStr}</span>
            <span>•</span>
            <span>${wordCount} kata</span>
            ${session.duration ? `<span>• ${session.duration}</span>` : ''}
          </div>
        </div>
      </label>
    `;
  });

  container.innerHTML = html;
  initLucideIcons();

  container.querySelectorAll('.recent-session-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const id = chk.value;
      if (chk.checked) {
        state.selectedRecentSessionIds.add(id);
      } else {
        state.selectedRecentSessionIds.delete(id);
      }
      chk.closest('.recent-check-item')?.classList.toggle('selected', chk.checked);
      updateRecentSelectionUI();
      applyRecentSessionsSource();
    });
  });

  updateRecentSelectionUI();
}

function updateRecentSelectionUI() {
  const count = state.selectedRecentSessionIds.size;
  const footer = elements.recentSelectionFooter;
  const label = elements.recentSelectionSummaryText;

  if (count === 0) {
    if (footer) footer.classList.add('hidden');
    return;
  }

  const selectedSessions = (state.historyList || []).filter(s => state.selectedRecentSessionIds.has(s.id));
  const totalWords = selectedSessions.reduce((acc, s) => {
    const text = s.transcriptText || (s.segments || []).map(seg => seg.text).join(' ');
    return acc + (text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0);
  }, 0);

  if (label) {
    label.textContent = `${count} sesi dipilih (${totalWords} kata)`;
  }
  if (footer) {
    footer.classList.remove('hidden');
  }
}

function applyRecentSessionsSource() {
  const selectedSessions = (state.historyList || []).filter(s => state.selectedRecentSessionIds.has(s.id));
  if (selectedSessions.length === 0) {
    state.customSummarySource = null;
    elements.activeSourceStatusPill?.classList.add('hidden');
    return;
  }

  const totalWords = selectedSessions.reduce((acc, s) => {
    const text = s.transcriptText || (s.segments || []).map(seg => seg.text).join(' ');
    return acc + (text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0);
  }, 0);

  let combinedText = '';
  if (selectedSessions.length === 1) {
    const s = selectedSessions[0];
    combinedText = (s.transcriptText || (s.segments || []).map(seg => `${seg.speaker || 'Pembicara'}: ${seg.text}`).join('\n')).trim();
  } else {
    combinedText = selectedSessions.map((s, idx) => {
      const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
      const text = (s.transcriptText || (s.segments || []).map(seg => `${seg.speaker || 'Pembicara'}: ${seg.text}`).join('\n')).trim();
      return `========================================\n=== [SESI ${idx + 1}: ${s.title || 'Sesi Live'} (${dateStr}) — ${s.model || 'Model'}] ===\n========================================\n${text}`;
    }).join('\n\n');
  }

  const sourceName = selectedSessions.length === 1 
    ? (selectedSessions[0].title || 'Sesi Riwayat') 
    : `${selectedSessions.length} Sesi Riwayat (${selectedSessions.map(s => s.title || 'Sesi').join(', ')})`;

  state.customSummarySource = {
    type: 'recent',
    name: sourceName,
    text: combinedText,
    sessionIds: Array.from(state.selectedRecentSessionIds)
  };

  updateSummarySourcePill('Riwayat:', sourceName, `${totalWords} kata`);
}

function updateSummarySourcePill(typeLabel, name, meta) {
  if (!elements.activeSourceStatusPill) return;
  elements.activeSourceStatusPill.classList.remove('hidden');
  if (elements.activeSourceType) elements.activeSourceType.textContent = typeLabel;
  if (elements.activeSourceName) {
    elements.activeSourceName.textContent = name;
    elements.activeSourceName.title = name;
  }
  if (elements.activeSourceMeta) elements.activeSourceMeta.textContent = meta;
  initLucideIcons();
}

function resetSummarySourceToLive() {
  state.customSummarySource = null;
  state.selectedSummaryFiles = [];
  state.selectedRecentSessionIds.clear();
  renderSummaryFilesChips();
  populateRecentSessionsChecklist();
  setSummarySourceTab('live');
  showToast('Kembali ke Transkrip Percakapan Aktif.', 'info');
}

// --- DUAL-AGENT AI INTELLIGENCE ROUTER (TRANSCRIPT AGENT VS SUMMARY AGENT) ---

async function handleAIAction(actionType, customPromptText = null, isSilent = false, forcedAgentType = null) {
  const isCustomSource = Boolean(actionType !== 'auto-polish' && state.customSummarySource && state.customSummarySource.text);
  const transcript = isCustomSource 
    ? state.customSummarySource.text.trim() 
    : getFullTranscriptText().trim();

  if (!transcript) {
    if (!isSilent) {
      showToast(isCustomSource ? 'Teks dari dokumen/riwayat yang dipilih kosong.' : 'Transkrip percakapan masih kosong. Bicaralah atau pilih dokumen .md/.txt.', 'error');
    }
    return;
  }

  // Consistent Agent Routing:
  // - If forcedAgentType is specified ('summary' or 'transcript'), respect it.
  // - All right-panel toolbar actions ('summarize', 'action-items', 'polish', 'custom') -> 'summary'
  // - Only auto-polish or silent background timers -> 'transcript'
  const agentType = forcedAgentType || (actionType === 'auto-polish' ? 'transcript' : 'summary');
  const { model, isGoogle, baseUrl, apiKey } = getAgentConfig(agentType);
  
  if (isGoogle && !apiKey) {
    if (!isSilent) {
      openSettingsModal('tab-gemini');
      showToast(`Silakan masukkan Google Gemini API Key untuk ${agentType === 'transcript' ? 'Transcript Agent' : 'Summary Agent'}.`, 'error');
    }
    return;
  }

  if (!isGoogle && !apiKey) {
    if (!isSilent) {
      openAgentConfigModal(agentType);
      showToast(`Silakan masukkan API Key untuk ${agentType === 'transcript' ? 'Transcript Agent' : 'Summary Agent'}.`, 'error');
    }
    return;
  }

  let systemInstruction = '';
  let userPrompt = '';
  let title = 'Hasil AI';
  const sourceContext = isCustomSource ? `Dokumen/Riwayat: ${state.customSummarySource.name}` : 'Transkrip Percakapan';

  switch (actionType) {
    case 'auto-polish':
    case 'polish':
      title = `Teks Dirapikan (${model})`;
      systemInstruction = 'Anda adalah asisten editor transkripsi ahli yang sangat fasih dalam percakapan dwibahasa (Bahasa Indonesia & Bahasa Inggris / Code-Switching) dan terminologi kerja/teknis modern.';
      userPrompt = `Berikut adalah draf teks transkrip suara (${sourceContext}):
"""
${transcript}
"""

Tugas Anda:
1. **Dukungan Dwibahasa (Campuran Indo + English)**: Obrolan sering mencampurkan Bahasa Indonesia dengan istilah teknis, bisnis, atau kosakata Bahasa Inggris (code-switching). Koreksi salah dengar kata (typo fonetik mesin STT) menjadi kata bahasa Inggris yang tepat (contoh: "ser skrin" -> "share screen", "miting" -> "meeting", "dedlin" -> "deadline", "apdet" -> "update", "bai de wei" -> "by the way", "konek" -> "connect", "rikues" -> "request", "follow up", "schedule", dll).
2. **Kompensasi Suara Pelan**: Jika ada bagian kalimat yang terpotong atau janggal karena suara pembicara terlalu pelan, hubungkan dan perbaiki secara logis dan mengalir sesuai konteks pembicaraan.
3. **Format & Keterbacaan**: Perbaiki tanda baca, huruf kapital, dan rapikan label pembicara (misal "Pembicara 1:", "Pembicara 2:").
4. Berikan HANYA teks hasil perbaikan secara langsung tanpa kata pengantar atau penutup.`;
      break;

    case 'summarize':
      title = `Ringkasan Eksekutif (${model})`;
      systemInstruction = 'Anda adalah asisten eksekutif untuk analisis dan ringkasan pertemuan.';
      userPrompt = `Berikut adalah teks (${sourceContext}):\n"""\n${transcript}\n"""\n\nBuatkan:\n1. **Ringkasan Eksekutif (Executive Summary)** (1-2 paragraf padat).\n2. **Poin-Poin Kunci Pembahasan** (Bullet points terstruktur).\n3. **Topik Utama yang Dibahas**.`;
      break;

    case 'action-items':
      title = `Notula Rapat & Action Items (${model})`;
      systemInstruction = 'Anda adalah sekretaris rapat profesional.';
      userPrompt = `Berikut adalah teks (${sourceContext}):\n"""\n${transcript}\n"""\n\nEkstrak dan buatkan notula terstruktur:\n1. **Daftar Tugas / Action Items** (dengan format [ ] Tugas - Penanggung Jawab jika ada).\n2. **Keputusan yang Diambil (Key Decisions)**.\n3. **Hal yang Perlu Ditindaklanjuti / Follow-up**.`;
      break;

    case 'custom':
      title = `Custom AI Prompt (${model})`;
      systemInstruction = 'Anda adalah asisten AI serbaguna.';
      userPrompt = `Konteks Teks (${sourceContext}):\n"""\n${transcript}\n"""\n\nInstruksi Pengguna:\n${customPromptText}`;
      break;
  }

  // If this is background auto-polish, do not disrupt the right panel's UI or loading state
  if (actionType === 'auto-polish') {
    try {
      let result = '';
      if (isGoogle) {
        result = await callGeminiAPI(model, systemInstruction, userPrompt, apiKey);
      } else {
        result = await callCFRouterAPI(model, systemInstruction, userPrompt, baseUrl, apiKey);
      }
      const polished = result ? result.replace(/^[#*-]+\s*/gm, '').trim() : '';
      if (polished && polished.length > 5) {
        state.transcriptSegments = [{
          id: Date.now(),
          time: new Date().toTimeString().substring(0, 8),
          text: polished
        }];
        renderTranscript();
        updateStats();
        showToast(`Auto-Polish (${model}): Transkrip dirapikan otomatis!`, 'info');
      }
    } catch (err) {
      console.warn('Auto-Polish silent error:', err);
    }
    return;
  }

  // Right Panel User-Initiated Action (Summary Agent)
  state.isProcessingAI = true;
  setAILoading(true, `[Summary Agent] Memproses dengan ${model}...`);
  if (elements.aiResultTitle) elements.aiResultTitle.textContent = title;
  if (elements.aiModelUsedBadge) elements.aiModelUsedBadge.textContent = model;

  try {
    let result = '';
    let usedModel = model;
    let fallbackCandidates = [];

    if (isGoogle) {
      fallbackCandidates = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-3.7-flash'].filter(m => m !== model);
    } else {
      fallbackCandidates = ['combo-mix', 'combo-cfr', 'Qwen3.8-27B', 'solar-pro4', 'combo-gratis'].filter(m => m !== model);
    }

    try {
      if (isGoogle) {
        result = await callGeminiAPI(usedModel, systemInstruction, userPrompt, apiKey);
      } else {
        result = await callCFRouterAPI(usedModel, systemInstruction, userPrompt, baseUrl, apiKey);
      }
    } catch (primaryErr) {
      const errStr = (primaryErr.message || '').toLowerCase();
      const isCapacityOrLimit = errStr.includes('503') || errStr.includes('unavailable') || errStr.includes('capacity') || errStr.includes('429') || errStr.includes('quota') || errStr.includes('resource_exhausted');

      if (isCapacityOrLimit && fallbackCandidates.length > 0) {
        let succeeded = false;
        for (const fallbackModel of fallbackCandidates) {
          showToast(`Model ${usedModel} 503/Kapasitas Habis. Otomatis beralih ke ${fallbackModel}...`, 'warning');
          try {
            setAILoading(true, `[Failover] Memproses dengan ${fallbackModel}...`);
            if (isGoogle) {
              result = await callGeminiAPI(fallbackModel, systemInstruction, userPrompt, apiKey);
            } else {
              result = await callCFRouterAPI(fallbackModel, systemInstruction, userPrompt, baseUrl, apiKey);
            }
            usedModel = fallbackModel;
            succeeded = true;
            if (elements.summaryModelSelect) elements.summaryModelSelect.value = fallbackModel;
            state.config.summaryAgent = state.config.summaryAgent || {};
            state.config.summaryAgent.model = fallbackModel;
            saveConfig();
            updateModelUI();
            showToast(`Berhasil diproses dengan model cadangan ${fallbackModel}!`, 'success');
            break;
          } catch (nextErr) {
            console.warn(`Fallback ${fallbackModel} juga gagal:`, nextErr.message);
          }
        }

        // If all local router models failed, but user has Google Gemini API Key, try Google Gemini direct!
        if (!succeeded && !isGoogle && getEffectiveGeminiKey()) {
          showToast(`Router lokal sibuk. Otomatis beralih ke Google Gemini 3.6 Flash...`, 'warning');
          setAILoading(true, `[Failover] Mencoba langsung ke Google Gemini 3.6 Flash...`);
          try {
            result = await callGeminiAPI('gemini-3.6-flash', systemInstruction, userPrompt);
            usedModel = 'gemini-3.6-flash';
            succeeded = true;
            if (elements.summaryModelSelect) elements.summaryModelSelect.value = 'gemini-3.6-flash';
            state.config.summaryAgent = state.config.summaryAgent || {};
            state.config.summaryAgent.model = 'gemini-3.6-flash';
            saveConfig();
            updateModelUI();
            showToast('Berhasil diproses langsung via Google Gemini!', 'success');
          } catch (gemErr) {
            console.warn('Direct Gemini failover failed:', gemErr.message);
          }
        }

        if (!succeeded) {
          throw primaryErr;
        }
      } else {
        throw primaryErr;
      }
    }

    state.lastAIResult = result;
    renderAIResult(result);
    if (elements.lastProcessedBadge) elements.lastProcessedBadge.textContent = new Date().toLocaleTimeString();
    if (elements.btnApplyPolishToTranscript) {
      elements.btnApplyPolishToTranscript.classList.toggle('hidden', actionType !== 'polish');
    }
    
    if (!isSilent) showToast(`Hasil dari Summary Agent (${usedModel}) siap!`, 'success');

    // Automatically save summary to temp folder
    autoSaveSummaryToTempFolder({
      taskType: actionType,
      model: usedModel,
      title: isCustomSource ? `${title} — ${state.customSummarySource.name}` : (title || 'Hasil Analisis AI'),
      content: result,
      sourceText: transcript
    });
  } catch (err) {
    console.error('AI Request Error:', err);
    if (elements.aiOutputContent) {
      elements.aiOutputContent.innerHTML = `
        <div class="info-alert" style="background: rgba(244,63,94,0.1); border-color: rgba(244,63,94,0.3); color: #fda4af;">
          <i data-lucide="alert-triangle"></i>
          <div>
            <strong>Gagal Memproses AI (${model}):</strong> ${escapeHtml(err.message)}
            <br><small>Kapasitas server model sedang penuh (503) atau kuota habis (429). Coba pilih model lain di dropdown sebelah kanan.</small>
          </div>
        </div>
      `;
      initLucideIcons();
    }
    showToast(`Error AI (${agentType}): ${err.message || 'Gagal memanggil model'}`, 'error');
  } finally {
    state.isProcessingAI = false;
    setAILoading(false);
  }
}

// --- API USAGE & QUOTA ANALYTICS TRACKER ---
const API_TRACKER_STORAGE_KEY = 'livevoice_api_tracker_v2';

const GEMINI_AUDIO_FALLBACK_CHAIN = [
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.7-flash',
  'gemini-3.1-flash-lite'
];

const MODEL_KNOWN_LIMITS = {
  'gemini-3.6-flash': { rpm: 15, rpd: 1500, provider: 'Google AI' },
  'gemini-3.5-flash-lite': { rpm: 15, rpd: 500, provider: 'Google AI' },
  'gemini-2.5-flash': { rpm: 15, rpd: 1500, provider: 'Google AI' },
  'gemini-3.7-flash': { rpm: 15, rpd: 1000, provider: 'Google AI' },
  'gemini-3.1-flash-lite': { rpm: 15, rpd: 500, provider: 'Google AI' },
  'gemini-3.5-transcribe': { rpm: 15, rpd: 500, provider: 'Google AI' },
  'gemini-3.5-transcribe-live': { rpm: 60, rpd: 20000, provider: 'Google Live API' },
  'gemini-3.5-live-translate-preview': { rpm: 60, rpd: 20000, provider: 'Google Live API' },
  'combo-gratis': { rpm: 60, rpd: 10000, provider: 'Localhost Omni' },
  'combo-mix': { rpm: 60, rpd: 10000, provider: 'Localhost Omni' },
  'combo-cfr': { rpm: 60, rpd: 10000, provider: 'Localhost Omni' },
  'solar-pro4': { rpm: 30, rpd: 2000, provider: 'CFRouter' },
  'Qwen3.8-27B': { rpm: 30, rpd: 2000, provider: 'CFRouter' },
  'Qwen3.8-Max': { rpm: 20, rpd: 1000, provider: 'CFRouter' }
};

function getApiTrackerData() {
  try {
    const raw = localStorage.getItem(API_TRACKER_STORAGE_KEY);
    if (!raw) return { transactions: [], modelStats: {} };
    return JSON.parse(raw);
  } catch (e) {
    return { transactions: [], modelStats: {} };
  }
}

function saveApiTrackerData(data) {
  try {
    if (data.transactions && data.transactions.length > 150) {
      data.transactions = data.transactions.slice(0, 150);
    }
    localStorage.setItem(API_TRACKER_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {}
}

function recordApiTransaction(tx) {
  try {
    const data = getApiTrackerData();
    const now = new Date();
    const timeStr = now.toTimeString().substring(0, 8);
    const dateStr = now.toISOString().substring(0, 10);
    const nowMs = Date.now();

    const transactionItem = {
      id: 'tx-' + nowMs + '-' + Math.random().toString(36).substr(2, 4),
      time: timeStr,
      date: dateStr,
      feature: tx.feature || 'API Call',
      provider: tx.provider || 'API Provider',
      model: tx.model || 'unknown',
      statusCode: tx.statusCode || 200,
      latencyMs: Math.round(tx.latencyMs || 0),
      payloadBytes: tx.payloadBytes || 0,
      tokensEstimate: tx.tokensEstimate || 0,
      success: Boolean(tx.success),
      message: tx.message || (tx.success ? 'Success' : 'Error')
    };

    if (!data.transactions) data.transactions = [];
    data.transactions.unshift(transactionItem);

    if (!data.modelStats) data.modelStats = {};
    const mKey = tx.model || 'unknown';
    if (!data.modelStats[mKey]) {
      data.modelStats[mKey] = {
        model: mKey,
        provider: tx.provider || 'Provider',
        totalCalls: 0,
        successCalls: 0,
        errorCalls: 0,
        totalBytes: 0,
        totalLatencyMs: 0,
        lastStatus: '200 OK',
        lastStatusCode: 200,
        lastError: '',
        lastUsed: timeStr,
        recentCallsTimestamps: [],
        todayCallsCount: 0,
        todayDateStr: dateStr
      };
    }

    const st = data.modelStats[mKey];
    st.totalCalls += 1;
    if (tx.success) {
      st.successCalls += 1;
      st.lastStatus = `${tx.statusCode || 200} OK`;
    } else {
      st.errorCalls += 1;
      st.lastStatus = `HTTP ${tx.statusCode || 500}`;
      st.lastError = tx.message || 'API Error';
    }

    st.totalBytes += (tx.payloadBytes || 0);
    st.totalLatencyMs += (tx.latencyMs || 0);
    st.lastStatusCode = tx.statusCode || (tx.success ? 200 : 500);
    st.lastUsed = `${dateStr} ${timeStr}`;

    if (st.todayDateStr !== dateStr) {
      st.todayDateStr = dateStr;
      st.todayCallsCount = 1;
    } else {
      st.todayCallsCount += 1;
    }

    st.recentCallsTimestamps = (st.recentCallsTimestamps || []).filter(t => (nowMs - t) < 60000);
    st.recentCallsTimestamps.push(nowMs);

    saveApiTrackerData(data);
    updateApiUsageBadge(data);
  } catch (err) {
    console.warn('Gagal merekam log API:', err);
  }
}

function updateApiUsageBadge(trackerData = null) {
  const data = trackerData || getApiTrackerData();
  const total = data.transactions?.length || 0;
  if (elements.apiUsageBadge) {
    elements.apiUsageBadge.textContent = String(total);
  }
}

function getNextGeminiAudioFallbackModel(currentModel) {
  const chain = GEMINI_AUDIO_FALLBACK_CHAIN;
  const idx = chain.indexOf(currentModel);
  if (idx === -1 || idx === chain.length - 1) {
    return chain[0];
  }
  return chain[idx + 1];
}

function renderApiUsageUI() {
  const data = getApiTrackerData();
  const nowMs = Date.now();
  const todayStr = new Date().toISOString().substring(0, 10);

  if (elements.apiModelStatsContainer) {
    const models = Object.keys(data.modelStats || {});
    if (models.length === 0) {
      elements.apiModelStatsContainer.innerHTML = `
        <div class="empty-state-text" style="grid-column: 1 / -1; padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.8rem;">
          Belum ada panggilan API yang tercatat dalam sesi ini.
        </div>
      `;
    } else {
      let cardsHtml = '';
      models.forEach(mKey => {
        const st = data.modelStats[mKey];
        const known = MODEL_KNOWN_LIMITS[mKey] || { rpm: 15, rpd: 500, provider: 'AI Model' };

        const recentCalls = (st.recentCallsTimestamps || []).filter(t => (nowMs - t) < 60000);
        const rpm = recentCalls.length;
        const rpmPct = Math.min(100, Math.round((rpm / (known.rpm || 15)) * 100));
        
        const rpd = (st.todayDateStr === todayStr) ? (st.todayCallsCount || 0) : 0;
        const rpdPct = Math.min(100, Math.round((rpd / (known.rpd || 500)) * 100));

        let statusTag = '<span class="api-status-tag success">🟢 Normal</span>';
        if (st.lastStatusCode === 429) {
          statusTag = '<span class="api-status-tag warning">🟡 Limit (429)</span>';
        } else if (st.lastStatusCode === 503) {
          statusTag = '<span class="api-status-tag error">🔴 Overload (503)</span>';
        } else if (st.errorCalls > 0 && st.successCalls === 0) {
          statusTag = '<span class="api-status-tag error">🔴 Error</span>';
        }

        const avgLat = st.totalCalls > 0 ? Math.round(st.totalLatencyMs / st.totalCalls) : 0;
        const totalMb = (st.totalBytes / (1024 * 1024)).toFixed(2);
        const successRate = st.totalCalls > 0 ? Math.round((st.successCalls / st.totalCalls) * 100) : 100;

        let providerClass = 'google';
        if ((st.provider && st.provider.toLowerCase().includes('omni')) || isOmniModel(mKey)) providerClass = 'omni';
        else if (st.provider && st.provider.toLowerCase().includes('cfrouter')) providerClass = 'cfrouter';

        cardsHtml += `
          <div class="api-model-card">
            <div class="api-model-card-header">
              <div class="api-model-card-title">${escapeHtml(mKey)}</div>
              <span class="api-model-provider-badge ${providerClass}">${escapeHtml(st.provider || known.provider)}</span>
            </div>
            
            <div style="display: flex; align-items: center; justify-content: space-between;">
              ${statusTag}
              <small style="color: var(--text-muted); font-size: 0.68rem;">Terakhir: ${escapeHtml(st.lastUsed.split(' ')[1] || st.lastUsed)}</small>
            </div>

            <div class="api-model-metrics-row">
              <div class="api-metric-item">
                <span class="api-metric-label">Panggilan</span>
                <span class="api-metric-value">${st.successCalls} / ${st.totalCalls} <span style="font-size: 0.65rem; color: #34d399;">(${successRate}%)</span></span>
              </div>
              <div class="api-metric-item">
                <span class="api-metric-label">Avg Latensi</span>
                <span class="api-metric-value">${avgLat} ms</span>
              </div>
              <div class="api-metric-item">
                <span class="api-metric-label">Total Data</span>
                <span class="api-metric-value">${totalMb} MB</span>
              </div>
              <div class="api-metric-item">
                <span class="api-metric-label">Status Terakhir</span>
                <span class="api-metric-value">${escapeHtml(st.lastStatus || '-')}</span>
              </div>
            </div>

            <div class="api-quota-progress-wrapper">
              <div class="api-quota-label-row">
                <span>RPM (Menit Ini): <strong>${rpm} / ${known.rpm || 15}</strong></span>
                <span>${rpmPct}%</span>
              </div>
              <div class="api-quota-progress-track">
                <div class="api-quota-progress-fill ${rpmPct > 80 ? 'danger' : (rpmPct > 50 ? 'warning' : '')}" style="width: ${rpmPct}%"></div>
              </div>
            </div>

            <div class="api-quota-progress-wrapper">
              <div class="api-quota-label-row">
                <span>RPD (Hari Ini): <strong>${rpd} / ${known.rpd || 500}</strong></span>
                <span>${rpdPct}%</span>
              </div>
              <div class="api-quota-progress-track">
                <div class="api-quota-progress-fill ${rpdPct > 85 ? 'danger' : (rpdPct > 60 ? 'warning' : '')}" style="width: ${rpdPct}%"></div>
              </div>
            </div>
          </div>
        `;
      });
      elements.apiModelStatsContainer.innerHTML = cardsHtml;
    }
  }

  if (elements.apiLogsTableBody) {
    const txs = data.transactions || [];
    if (elements.apiLogsTotalCountBadge) {
      elements.apiLogsTotalCountBadge.textContent = `${txs.length} Panggilan`;
    }

    if (txs.length === 0) {
      elements.apiLogsTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 18px;">
            Belum ada riwayat transaksi API. Mulai transkripsi atau summary untuk melihat log.
          </td>
        </tr>
      `;
    } else {
      let rowsHtml = '';
      txs.forEach(t => {
        let stClass = 'success';
        if (t.statusCode === 429) stClass = 'warning';
        else if (t.statusCode >= 400 || !t.success) stClass = 'error';

        const sizeStr = t.payloadBytes > 0 
          ? (t.payloadBytes > 1024 ? `${(t.payloadBytes / 1024).toFixed(1)} KB` : `${t.payloadBytes} B`) 
          : `${t.tokensEstimate || 0} tok`;

        rowsHtml += `
          <tr>
            <td style="font-family: var(--font-mono); color: var(--text-muted);">${escapeHtml(t.time)}</td>
            <td><strong>${escapeHtml(t.feature)}</strong></td>
            <td><code>${escapeHtml(t.model)}</code></td>
            <td><span class="api-status-tag ${stClass}">${t.statusCode || (t.success ? 200 : 'ERR')}</span></td>
            <td>${t.latencyMs} ms</td>
            <td>${sizeStr}</td>
            <td style="max-width: 260px; overflow: hidden; text-overflow: ellipsis; color: ${t.success ? 'var(--text-secondary)' : '#f87171'};" title="${escapeHtml(t.message)}">
              ${escapeHtml(t.message || '-')}
            </td>
          </tr>
        `;
      });
      elements.apiLogsTableBody.innerHTML = rowsHtml;
    }
  }
}

function openApiUsageModal() {
  renderApiUsageUI();
  if (elements.apiUsageModal) {
    elements.apiUsageModal.classList.remove('hidden');
    initLucideIcons();
  }
}

function closeApiUsageModal() {
  if (elements.apiUsageModal) {
    elements.apiUsageModal.classList.add('hidden');
  }
}

function clearApiUsageStats() {
  localStorage.removeItem(API_TRACKER_STORAGE_KEY);
  renderApiUsageUI();
  updateApiUsageBadge();
  showToast('Statistik penggunaan API berhasil di-reset.', 'info');
}

function exportApiLogsToCsv() {
  const data = getApiTrackerData();
  const txs = data.transactions || [];
  if (txs.length === 0) {
    showToast('Belum ada log transaksi API untuk diekspor.', 'warning');
    return;
  }

  let csv = 'ID,Waktu,Tanggal,Fitur,Provider,Model,Status Code,Sukses,Latensi (ms),Ukuran (bytes),Pesan/Error\n';
  txs.forEach(t => {
    const cleanMsg = (t.message || '').replace(/"/g, '""').replace(/\r?\n/g, ' ');
    csv += `"${t.id}","${t.time}","${t.date}","${t.feature}","${t.provider}","${t.model}",${t.statusCode || 0},${t.success},${t.latencyMs},${t.payloadBytes || 0},"${cleanMsg}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `livevoice_api_logs_${new Date().toISOString().substring(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Log transaksi API berhasil diunduh (.csv).', 'success');
}

// --- DIRECT GEMINI MULTIMODAL AUDIO TRANSCRIPTION (CONTINUOUS STREAM CAPABLE) ---
async function processDirectAudioWithGemini(isAutoStream = false) {
  const apiKey = getEffectiveGeminiKey();
  if (!apiKey) {
    openSettingsModal('tab-gemini');
    showToast('Masukkan Google Gemini API Key untuk menggunakan Gemini Audio-In.', 'error');
    return;
  }

  let model = elements.geminiAudioModelSelect?.value || state.config.geminiModel || 'gemini-3.5-transcribe';
  if (model.includes('-live') || model.includes('dialog') || model.includes('translate') || model === 'gemini-1.5-flash') {
    model = 'gemini-3.6-flash';
    if (elements.geminiAudioModelSelect) elements.geminiAudioModelSelect.value = 'gemini-3.6-flash';
  }

  // Harvest valid WebM blob containing proper EBML header
  const audioBlob = await captureValidAudioSegmentBlob();
  if (!audioBlob || audioBlob.size < 1500) {
    if (!isAutoStream) {
      showToast('Audio terlalu pendek atau belum ada suara masuk. Bicaralah lebih jelas.', 'warning');
    }
    await logGeminiAudioEvent('SKIP', 'Audio chunk too short (< 1.5 KB), skipped to avoid invalid argument.', audioBlob ? audioBlob.size : 0);
    return;
  }

  const cleanMimeType = (state.recordedMimeType || audioBlob.type || 'audio/webm').split(';')[0];
  const sizeKb = (audioBlob.size / 1024).toFixed(1);

  state.isSendingAudioChunk = true;
  updateAudioStreamProgress(0, elements.chkAutoSendGeminiAudio ? elements.chkAutoSendGeminiAudio.checked : true);

  await logGeminiAudioEvent('SENDING', `Mengirim potongan audio ${sizeKb} KB ke Gemini`, audioBlob.size, cleanMimeType);

  if (state.isRecording) {
    showToast(`Mengirim potongan suara (${sizeKb} KB) ke Gemini... Mic tetap aktif merekam!`, 'info');
  } else {
    setAILoading(true, `Mengirim rekaman (${sizeKb} KB) ke Google AI (${model})...`);
  }

  try {
    const base64Audio = await blobToBase64(audioBlob);
    const pureBase64 = base64Audio.includes(',') ? base64Audio.split(',')[1] : base64Audio;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: cleanMimeType,
                data: pureBase64
              }
            },
            {
              text: `Transkripsikan rekaman percakapan audio ini secara persis dan akurat apa adanya (verbatim).
Gunakan bahasa percakapan yang sesuai (Bahasa Indonesia campur istilah Bahasa Inggris / teknis jika diucapkan pembicara).
Deteksi dan berikan label pembicara [Pembicara 1], [Pembicara 2], dst di awal setiap giliran bicara jika ada pergantian orang.
Jika hanya ada derau/hening/noise tanpa kata-kata nyata, jawab tepat: <noise>
Keluarkan HANYA transkrip teks ucapan, tanpa komentar penjelasan tambahan apa pun.`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1
      }
    };

    let activeAudioModel = model;
    let successRespJson = null;
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const callStart = Date.now();
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${activeAudioModel}:generateContent?key=${apiKey}`;

      let response = null;
      let respJson = null;

      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        respJson = await response.json().catch(() => ({}));
      } catch (networkErr) {
        const callLat = Date.now() - callStart;
        recordApiTransaction({
          feature: 'Gemini Audio-In',
          provider: 'Google Gemini',
          model: activeAudioModel,
          statusCode: 0,
          latencyMs: callLat,
          payloadBytes: audioBlob.size,
          success: false,
          message: networkErr.message || 'Koneksi jaringan terputus'
        });
        throw networkErr;
      }

      const callLat = Date.now() - callStart;

      if (!response.ok) {
        const errLower = (respJson.error?.message || '').toLowerCase();
        const isUnavailable = response.status === 503 || 
                              (respJson.error?.status === 'UNAVAILABLE') || 
                              errLower.includes('unavailable') || 
                              errLower.includes('no capacity') || 
                              errLower.includes('overloaded') ||
                              errLower.includes('capacity available');
        const isRateLimited = response.status === 429 || 
                              (respJson.error?.status === 'RESOURCE_EXHAUSTED') || 
                              errLower.includes('quota') ||
                              errLower.includes('resource_exhausted') ||
                              errLower.includes('rate limit');
        const errMsg = respJson.error?.message || `HTTP ${response.status}: ${response.statusText}`;

        recordApiTransaction({
          feature: 'Gemini Audio-In',
          provider: 'Google Gemini',
          model: activeAudioModel,
          statusCode: response.status,
          latencyMs: callLat,
          payloadBytes: audioBlob.size,
          success: false,
          message: errMsg
        });

        await logGeminiAudioEvent('ERROR', `[HTTP ${response.status}] ${errMsg}`, audioBlob.size, cleanMimeType, respJson);

        // If Service Unavailable (503) or Quota/Rate Limit (429), automatically switch to next audio model!
        if ((isUnavailable || isRateLimited) && attempt < maxAttempts - 1) {
          const nextModel = getNextGeminiAudioFallbackModel(activeAudioModel);
          showToast(`Gemini Audio (${activeAudioModel}) ${isUnavailable ? 'Service Unavailable (503)' : 'Limit Habis (429)'}. Otomatis beralih ke ${nextModel}! Mencoba ulang...`, 'warning');
          
          activeAudioModel = nextModel;
          if (elements.geminiAudioModelSelect) elements.geminiAudioModelSelect.value = nextModel;
          state.config.geminiModel = nextModel;
          saveConfig();
          updateModelUI();
          
          continue;
        }

        throw new Error(errMsg);
      }

      // Success!
      recordApiTransaction({
        feature: 'Gemini Audio-In',
        provider: 'Google Gemini',
        model: activeAudioModel,
        statusCode: 200,
        latencyMs: callLat,
        payloadBytes: audioBlob.size,
        success: true,
        message: 'Transkripsi audio berhasil'
      });

      successRespJson = respJson;
      model = activeAudioModel;
      break;
    }

    const respJson = successRespJson || {};

    let resultText = respJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    
    // Clean and filter noise artifacts
    resultText = resultText.replace(/<noise>|\[noise\]|<silence>|\[silence\]|\(noise\)|\(hening\)/gi, '').trim();

    // If output is purely noise or empty, ignore it so it doesn't pollute the transcript!
    if (!resultText || resultText === '<noise>' || resultText.length < 2) {
      await logGeminiAudioEvent('IGNORED', 'Audio chunk berupa keheningan/derau latar, diabaikan dari transkrip chat.', audioBlob.size, cleanMimeType, { rawSnippet: respJson.candidates?.[0]?.content?.parts?.[0]?.text });
      return;
    }

    // Detect speaker if labeled
    let rawSpeaker = 'Pembicara';
    let displayText = resultText;
    const speakerMatch = resultText.match(/^\[?(Pembicara\s*\d+|Speaker\s*\d+|Orang\s*\d+)\]?:\s*(.*)/is);
    if (speakerMatch) {
      rawSpeaker = speakerMatch[1].trim();
      displayText = speakerMatch[2].trim();
    }

    // Filter out hallucinations where output is purely a speaker label without speech (e.g. "Pembicara 1:")
    if (!displayText || displayText.length < 2 || displayText === '<noise>') {
      await logGeminiAudioEvent('IGNORED', 'Audio chunk hanya berisi label pembicara atau keheningan tanpa perkataan nyata.', audioBlob.size, cleanMimeType, { rawSnippet: resultText });
      return;
    }

    await logGeminiAudioEvent('SUCCESS', `Transkripsi berhasil (${displayText.length} karakter)`, audioBlob.size, cleanMimeType, { snippet: displayText.slice(0, 100) });

    state.lastAIResult = displayText;

    // Apply alias if user already renamed this speaker
    const speaker = state.speakerAliases[rawSpeaker.toLowerCase()] || rawSpeaker;

    state.transcriptSegments.push({
      id: Date.now() + Math.random(),
      time: new Date().toTimeString().substring(0, 8),
      speaker: speaker,
      text: displayText
    });
    renderTranscript();
    updateStats();

    // Automatically save audio-in transcript to separate temp/audio_in folder
    autoSaveAudioInToTempFolder({
      model: model,
      title: `Transkripsi Audio (${speaker})`,
      content: displayText,
      speaker: speaker,
      size: audioBlob.size,
      timestamp: Date.now()
    });

    // Auto-update live transcript session history
    saveCurrentLiveSessionToHistory(true);

    showToast(`Transkripsi Gemini Audio (${speaker}) ditambahkan!`, 'success');
  } catch (err) {
    console.error('Gemini Audio Error:', err);
    showToast(`Error Gemini Audio: ${err.message}`, 'error');
  } finally {
    state.isSendingAudioChunk = false;
    setAILoading(false);
    updateAudioStreamProgress(0, elements.chkAutoSendGeminiAudio ? elements.chkAutoSendGeminiAudio.checked : true);
  }
}

async function logGeminiAudioEvent(status, message, payloadSize = 0, mimeType = '', details = null) {
  try {
    await fetch('/api/log-gemini-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        model: elements.geminiAudioModelSelect?.value || 'gemini-3.6-flash',
        message,
        size: payloadSize,
        mimeType,
        details
      })
    });
  } catch (e) {
    console.warn('Logging error:', e);
  }
}

function toggleAudioBannerCollapse() {
  if (elements.directAudioProgress) {
    elements.directAudioProgress.classList.toggle('is-collapsed');
    const isCollapsed = elements.directAudioProgress.classList.contains('is-collapsed');
    if (elements.audioBannerChevron) {
      elements.audioBannerChevron.setAttribute('data-lucide', isCollapsed ? 'chevron-down' : 'chevron-up');
      initLucideIcons();
    }
  }
}

async function openGeminiLogsModal() {
  if (elements.geminiLogsModal) {
    elements.geminiLogsModal.classList.remove('hidden');
    if (elements.geminiLogsOutputContent) {
      elements.geminiLogsOutputContent.textContent = 'Mengambil log terbaru dari temp/gemini_audio.log...';
      try {
        const res = await fetch('/api/get-gemini-audio-logs');
        const data = await res.json();
        elements.geminiLogsOutputContent.textContent = data.logs || 'Belum ada log aktivitas Gemini Audio.';
        elements.geminiLogsOutputContent.scrollTop = elements.geminiLogsOutputContent.scrollHeight;
      } catch (err) {
        elements.geminiLogsOutputContent.textContent = 'Gagal memuat log: ' + err.message;
      }
    }
    initLucideIcons();
  }
}

function closeGeminiLogsModal() {
  if (elements.geminiLogsModal) {
    elements.geminiLogsModal.classList.add('hidden');
  }
}

// --- GEMINI MULTIMODAL LIVE API (BIDIRECTIONAL WEBSOCKET STREAMING) ---

function updateGeminiLiveStatus(status, text) {
  if (elements.geminiLiveWsDot) {
    if (status === 'connected') {
      elements.geminiLiveWsDot.style.background = '#22c55e';
      elements.geminiLiveWsDot.className = 'stream-pulse-dot active';
    } else if (status === 'connecting') {
      elements.geminiLiveWsDot.style.background = '#eab308';
      elements.geminiLiveWsDot.className = 'stream-pulse-dot sending';
    } else if (status === 'error') {
      elements.geminiLiveWsDot.style.background = '#f43f5e';
      elements.geminiLiveWsDot.className = 'stream-pulse-dot';
    } else {
      elements.geminiLiveWsDot.style.background = '#64748b';
      elements.geminiLiveWsDot.className = 'stream-pulse-dot';
    }
  }
  if (elements.geminiLiveWsStatus) {
    elements.geminiLiveWsStatus.textContent = text;
    elements.geminiLiveWsStatus.style.color = status === 'connected' ? '#4ade80' : (status === 'connecting' ? '#fde047' : (status === 'error' ? '#fb7185' : '#94a3b8'));
  }
}

function startGeminiLiveStreaming() {
  const apiKey = getEffectiveGeminiKey();
  if (!apiKey) {
    openSettingsModal('tab-gemini');
    showToast('Masukkan Google Gemini API Key di Pengaturan untuk menggunakan Gemini Live Stream.', 'error');
    stopRecording();
    return;
  }

  const model = elements.geminiLiveModelSelect?.value || 'gemini-3.5-transcribe-live';
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

  updateGeminiLiveStatus('connecting', 'Menghubungkan WebSocket...');
  showToast(`Menghubungkan WebSocket ke ${model}...`, 'info');

  try {
    state.liveWs = new WebSocket(url);
  } catch (err) {
    showToast('Gagal membuat koneksi WebSocket: ' + err.message, 'error');
    updateGeminiLiveStatus('error', 'Gagal WebSocket');
    return;
  }

  state.liveWs.addEventListener('open', () => {
    updateGeminiLiveStatus('connecting', 'Inisialisasi Setup...');
    const isTranslate = model.includes('translate');
    const systemText = isTranslate
      ? 'Anda adalah penerjemah dan transkriber audio live real-time. Dengarkan suara ucapan pembicara dan langsung terjemahkan serta transkripsikan ke Bahasa Indonesia (atau terjemahkan ke Bahasa Inggris bila pembicara sudah berbahasa Indonesia). Hasilkan HANYA teks terjemahan ucapan seketika tanpa komentar tambahan.'
      : 'Anda adalah transkriber audio live real-time (verbatim speech-to-text). Transkripsikan semua perkataan yang diucapkan pembicara secara persis kata demi kata seketika (Bahasa Indonesia campur Bahasa Inggris / teknis). Jika hening atau derau latar belakang, jangan keluarkan teks apa pun. Keluarkan HANYA teks transkripsi percakapan.';

    const setupPayload = {
      setup: {
        model: `models/${model}`,
        generationConfig: {
          responseModalities: ['TEXT']
        },
        inputAudioTranscription: {
          mode: 'SMART'
        },
        systemInstruction: {
          parts: [
            {
              text: systemText
            }
          ]
        }
      }
    };
    state.liveWs.send(JSON.stringify(setupPayload));
  });

  state.liveWs.addEventListener('message', async (event) => {
    try {
      let rawStr = '';
      if (typeof event.data === 'string') {
        rawStr = event.data;
      } else if (event.data instanceof Blob) {
        rawStr = await event.data.text();
      } else if (event.data instanceof ArrayBuffer) {
        rawStr = new TextDecoder().decode(event.data);
      }

      const msg = JSON.parse(rawStr);

      if (msg.setupComplete) {
        updateGeminiLiveStatus('connected', 'Live Streaming Aktif');
        showToast(`⚡ Gemini Live (${model}) Terhubung! Suara dialirkan real-time...`, 'success');
        startPcmAudioStreaming();
        return;
      }

      // 1. Gemini 3.5 Transcribe Live real-time interim transcription (ASR streaming)
      const interimText = msg.serverContent?.interimInputTranscription?.text;
      if (interimText) {
        handleLiveStreamInterimText(interimText);
      }

      // 2. Completed phrase transcription
      const finalText = msg.serverContent?.inputTranscription?.text;
      if (finalText) {
        handleLiveStreamFinalText(finalText);
      }

      // 3. Conversational or translation model turn output
      const parts = msg.serverContent?.modelTurn?.parts;
      if (parts && parts.length > 0) {
        for (const part of parts) {
          if (part.text) {
            handleLiveStreamTextChunk(part.text);
          }
        }
      }

      // 4. Voice activity / Speech state indication
      if (msg.serverContent?.speechState === 'SPEECH' || msg.voiceActivity?.type === 'ACTIVITY_START') {
        updateGeminiLiveStatus('connected', 'Mendengar Ucapan...');
      } else if (msg.serverContent?.speechState === 'SILENCE' || msg.voiceActivity?.type === 'ACTIVITY_END') {
        updateGeminiLiveStatus('connected', 'Live Streaming Aktif');
        finalizeCurrentLiveSegment();
      }

      if (msg.serverContent?.turnComplete) {
        finalizeCurrentLiveSegment();
      }
    } catch (e) {
      console.warn('Error parsing Live WS message:', e);
    }
  });

  state.liveWs.addEventListener('error', (e) => {
    console.error('Gemini Live WS Error:', e);
    updateGeminiLiveStatus('error', 'Error WebSocket');
    showToast('Koneksi Gemini Live WebSocket terputus atau error.', 'error');
  });

  state.liveWs.addEventListener('close', (e) => {
    console.log('Gemini Live WS Closed:', e.code, e.reason);
    if (state.isRecording) {
      showToast(`Koneksi Live ditutup (${e.reason || e.code})`, 'warning');
    }
    updateGeminiLiveStatus('standby', 'Standby');
    stopPcmAudioStreaming();
  });
}

async function startPcmAudioStreaming() {
  if (!state.mediaStream || !state.liveWs || state.liveWs.readyState !== WebSocket.OPEN) return;

  if (!state.audioContext) {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (state.audioContext.state === 'suspended') {
    try {
      await state.audioContext.resume();
    } catch (e) {
      console.warn('AudioContext resume error:', e);
    }
  }

  const sourceSampleRate = state.audioContext.sampleRate;
  const targetSampleRate = 16000;

  try {
    state.livePcmProcessor = state.audioContext.createScriptProcessor(4096, 1, 1);

    // Muted zero-gain node to keep processor active without speaker audio feedback
    state.liveMuteGain = state.audioContext.createGain();
    state.liveMuteGain.gain.value = 0;

    // Connect from compressor node directly (with gain boost) or fallback to mediaStreamSource
    if (state.compressorNode) {
      state.compressorNode.connect(state.livePcmProcessor);
    } else if (state.mediaStream) {
      state.liveAudioSourceNode = state.audioContext.createMediaStreamSource(state.micStream || state.mediaStream);
      state.liveAudioSourceNode.connect(state.livePcmProcessor);
    }

    state.livePcmProcessor.onaudioprocess = (e) => {
      if (!state.isRecording || !state.liveWs || state.liveWs.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);

      // Convert Float32 to 16-bit Int PCM with downsampling to 16000 Hz
      let pcm16Data;
      if (sourceSampleRate === targetSampleRate) {
        pcm16Data = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
      } else {
        const ratio = sourceSampleRate / targetSampleRate;
        const newLength = Math.round(inputData.length / ratio);
        pcm16Data = new Int16Array(newLength);
        for (let i = 0; i < newLength; i++) {
          const originIdx = Math.min(Math.round(i * ratio), inputData.length - 1);
          const s = Math.max(-1, Math.min(1, inputData[originIdx]));
          pcm16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
      }

      let binary = '';
      const bytes = new Uint8Array(pcm16Data.buffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Audio = btoa(binary);

      state.liveWs.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: 'audio/pcm;rate=16000',
              data: base64Audio
            }
          ]
        }
      }));
    };

    state.livePcmProcessor.connect(state.liveMuteGain);
    state.liveMuteGain.connect(state.audioContext.destination);
  } catch (err) {
    console.error('Gagal memulai audio processing pipeline untuk Live WS:', err);
  }
}

function handleLiveStreamInterimText(text) {
  if (!text) return;
  const clean = text.replace(/<noise>|\[noise\]|<silence>/gi, '').trim();
  if (!clean) return;

  state.currentLiveSegmentText = clean;
  state.rawInterimText = clean;

  clearTimeout(state.liveDebounceTimer);
  state.liveDebounceTimer = setTimeout(() => {
    finalizeCurrentLiveSegment();
  }, 1800);

  renderTranscript();
  updateStats();
}

function handleLiveStreamFinalText(text) {
  if (!text) return;
  const clean = text.replace(/<noise>|\[noise\]|<silence>/gi, '').trim();
  if (!clean) return;

  clearTimeout(state.liveDebounceTimer);

  state.transcriptSegments.push({
    id: Date.now(),
    time: new Date().toTimeString().substring(0, 8),
    text: clean,
    isLiveStream: false
  });

  state.currentLiveSegmentId = null;
  state.currentLiveSegmentText = '';
  state.rawInterimText = '';
  renderTranscript();
  updateStats();
  saveCurrentLiveSessionToHistory(true);
}

function handleLiveStreamTextChunk(textChunk) {
  if (!textChunk) return;
  const clean = textChunk.replace(/<noise>|\[noise\]|<silence>/gi, '');
  if (!clean) return;

  state.currentLiveSegmentText = (state.currentLiveSegmentText || '') + clean;
  state.rawInterimText = state.currentLiveSegmentText;

  clearTimeout(state.liveDebounceTimer);
  state.liveDebounceTimer = setTimeout(() => {
    finalizeCurrentLiveSegment();
  }, 1800);

  renderTranscript();
  updateStats();
}

function finalizeCurrentLiveSegment() {
  clearTimeout(state.liveDebounceTimer);
  const text = (state.currentLiveSegmentText || state.rawInterimText || '').trim();
  if (text) {
    state.transcriptSegments.push({
      id: Date.now(),
      time: new Date().toTimeString().substring(0, 8),
      text: text,
      isLiveStream: false
    });
  }
  state.currentLiveSegmentId = null;
  state.currentLiveSegmentText = '';
  state.rawInterimText = '';
  renderTranscript();
  updateStats();
  saveCurrentLiveSessionToHistory(true);
}

function stopPcmAudioStreaming() {
  if (state.compressorNode && state.livePcmProcessor) {
    try {
      state.compressorNode.disconnect(state.livePcmProcessor);
    } catch (e) {}
  }
  if (state.liveMuteGain) {
    try {
      state.liveMuteGain.disconnect();
    } catch (e) {}
    state.liveMuteGain = null;
  }
  if (state.livePcmProcessor) {
    try {
      state.livePcmProcessor.disconnect();
      state.livePcmProcessor.onaudioprocess = null;
    } catch (e) {}
    state.livePcmProcessor = null;
  }
  if (state.liveAudioSourceNode) {
    try {
      state.liveAudioSourceNode.disconnect();
    } catch (e) {}
    state.liveAudioSourceNode = null;
  }
}

function stopGeminiLiveStreaming() {
  stopPcmAudioStreaming();
  finalizeCurrentLiveSegment();
  if (state.liveWs) {
    try {
      if (state.liveWs.readyState === WebSocket.OPEN || state.liveWs.readyState === WebSocket.CONNECTING) {
        state.liveWs.close();
      }
    } catch (e) {}
    state.liveWs = null;
  }
  updateGeminiLiveStatus('standby', 'Standby');
}

// --- API CALL IMPLEMENTATIONS WITH PER-AGENT CREDENTIALS ---

async function callGeminiAPI(modelName, systemInstruction, userPrompt, customApiKey = null) {
  const apiKey = customApiKey || getEffectiveGeminiKey();
  let safeModel = modelName || 'gemini-3.6-flash';
  if (safeModel === 'gemini-1.5-flash') {
    safeModel = 'gemini-3.6-flash';
  }
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent?key=${apiKey}`;

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

  const callStart = Date.now();
  let res, data;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    data = await res.json().catch(() => ({}));
  } catch (netErr) {
    const callLat = Date.now() - callStart;
    recordApiTransaction({
      feature: 'Text Agent',
      provider: 'Google Gemini',
      model: safeModel,
      statusCode: 0,
      latencyMs: callLat,
      payloadBytes: userPrompt.length,
      tokensEstimate: Math.round(userPrompt.length / 4),
      success: false,
      message: netErr.message || 'Koneksi gagal'
    });
    throw netErr;
  }

  const callLat = Date.now() - callStart;

  if (!res.ok) {
    const errMsg = data.error?.message || `Gemini API Error (HTTP ${res.status})`;
    recordApiTransaction({
      feature: 'Text Agent',
      provider: 'Google Gemini',
      model: safeModel,
      statusCode: res.status,
      latencyMs: callLat,
      payloadBytes: userPrompt.length,
      tokensEstimate: Math.round(userPrompt.length / 4),
      success: false,
      message: errMsg
    });
    throw new Error(errMsg);
  }

  recordApiTransaction({
    feature: 'Text Agent',
    provider: 'Google Gemini',
    model: safeModel,
    statusCode: 200,
    latencyMs: callLat,
    payloadBytes: userPrompt.length,
    tokensEstimate: Math.round(userPrompt.length / 4),
    success: true,
    message: 'OK'
  });

  return data.candidates?.[0]?.content?.parts?.[0]?.text || '(Respon kosong)';
}

async function callCFRouterAPI(modelName, systemInstruction, userPrompt, customBaseUrl = null, customApiKey = null) {
  const isOmni = isOmniModel(modelName);
  const defaultBaseUrl = isOmni ? (state.config.omniBaseUrl || DEFAULT_CONFIG.omniBaseUrl) : (state.config.cfrouterBaseUrl || DEFAULT_CONFIG.cfrouterBaseUrl);
  const defaultApiKey = isOmni ? (state.config.omniApiKey || DEFAULT_CONFIG.omniApiKey) : (state.config.cfrouterApiKey || DEFAULT_CONFIG.cfrouterApiKey);

  const baseUrl = customBaseUrl || defaultBaseUrl;
  const apiKey = customApiKey || defaultApiKey;
  const endpoint = `${baseUrl}/chat/completions`;
  const providerLabel = isOmni ? 'Localhost Omni' : 'CFRouter';

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

  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), 20000);
  const callStart = Date.now();

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutTimer);
    const callLat = Date.now() - callStart;

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const routerLabel = isOmni ? 'Omni Router (:20128)' : 'CFRouter';
      const errMsg = errorData.error?.message || `${routerLabel} API Error (HTTP ${res.status}): ${res.statusText}`;

      recordApiTransaction({
        feature: 'Text Agent',
        provider: providerLabel,
        model: modelName,
        statusCode: res.status,
        latencyMs: callLat,
        payloadBytes: userPrompt.length,
        tokensEstimate: Math.round(userPrompt.length / 4),
        success: false,
        message: errMsg
      });

      throw new Error(errMsg);
    }

    const data = await res.json();
    const resultText = data.choices?.[0]?.message?.content || '(Respon kosong)';

    recordApiTransaction({
      feature: 'Text Agent',
      provider: providerLabel,
      model: modelName,
      statusCode: 200,
      latencyMs: callLat,
      payloadBytes: userPrompt.length,
      tokensEstimate: Math.round(userPrompt.length / 4),
      success: true,
      message: 'OK'
    });

    return resultText;
  } catch (err) {
    clearTimeout(timeoutTimer);
    const callLat = Date.now() - callStart;
    const routerLabel = isOmni ? 'Omni Router (:20128)' : 'CFRouter';

    recordApiTransaction({
      feature: 'Text Agent',
      provider: providerLabel,
      model: modelName,
      statusCode: 0,
      latencyMs: callLat,
      payloadBytes: userPrompt.length,
      tokensEstimate: Math.round(userPrompt.length / 4),
      success: false,
      message: err.message || 'Error koneksi'
    });

    if (err.name === 'AbortError' || err.message?.includes('aborted')) {
      throw new Error(`Koneksi ke model '${modelName}' di ${routerLabel} timeout (>20s).`);
    }
    if (err.message === 'Failed to fetch') {
      if (isOmni || baseUrl.includes('20128') || baseUrl.includes('localhost')) {
        throw new Error(`Koneksi ke Omni Router (${baseUrl}) gagal (Failed to fetch). Pastikan Omni Router aktif di port 20128 atau periksa API Key.`);
      }
      throw new Error(`Koneksi ke CFRouter (${baseUrl}) gagal (Failed to fetch). Periksa koneksi internet Anda atau gunakan model Google Gemini.`);
    }
    throw err;
  }
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
  elements.btnUseLastRecordingInUpload?.addEventListener('click', useLastRecordingInUploadTab);
  elements.btnOpenRecordingsFolder?.addEventListener('click', openRecordingsFolderInExplorer);
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

  const apiKey = getEffectiveGeminiKey();
  if (!apiKey) {
    openSettingsModal('tab-gemini');
    showToast('Masukkan Google Gemini API Key Anda di Pengaturan.', 'error');
    return;
  }

  let model = elements.uploadModelSelect?.value || 'gemini-3.5-transcribe';
  if (model === 'gemini-1.5-flash') {
    model = 'gemini-3.6-flash';
  }
  const taskMode = elements.uploadTaskModeSelect.value;
  
  const bilingualGuideline = '\nCatatan: Percakapan dapat mencampurkan Bahasa Indonesia dan Bahasa Inggris (code-switching). Tuliskan kosakata atau istilah teknis/bisnis bahasa Inggris dengan ejaan bahasa Inggris yang benar (misal: "share screen", "meeting", "update"). Tangkap juga suara yang pelan atau berbisik secara akurat.';
  let promptText = '';
  if (taskMode === 'full-diarize') {
    promptText = 'Dengarkan berkas audio ini dengan teliti. Transkripsikan setiap percakapan secara lengkap dan akurat dalam bahasa aslinya. Jika ada beberapa pembicara, beri label jelas seperti Speaker 1, Speaker 2, dst beserta timestamp. Setelah transkrip lengkap selesai, buatkan ringkasan eksekutif poin pentingnya.' + bilingualGuideline;
  } else if (taskMode === 'verbatim') {
    promptText = 'Transkripsikan seluruh isi audio ini secara verbatim tepat kata per kata tanpa ada yang dilewati. Format dengan paragraf yang rapi.' + bilingualGuideline;
  } else if (taskMode === 'meeting-notes') {
    promptText = 'Transkripsikan rekaman percakapan rapat ini secara utuh, lalu sajikan: 1. Transkrip Percakapan Rapat, 2. Ringkasan Eksekutif, 3. Notula & Daftar Tugas (Action Items) beserta penanggung jawab, 4. Keputusan yang Disepakati.' + bilingualGuideline;
  } else if (taskMode === 'summary-only') {
    promptText = 'Dengarkan audio ini dan susun ringkasan eksekutif komprehensif serta poin-poin keputusan utamanya.' + bilingualGuideline;
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
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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

    const callStart = Date.now();
    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
    } catch (netErr) {
      const callLat = Date.now() - callStart;
      recordApiTransaction({
        feature: 'Unggah Berkas Audio',
        provider: 'Google Gemini',
        model: model,
        statusCode: 0,
        latencyMs: callLat,
        payloadBytes: state.uploadedFile.size,
        success: false,
        message: netErr.message || 'Koneksi jaringan terputus'
      });
      throw netErr;
    }

    const callLat = Date.now() - callStart;

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const errMsg = errJson.error?.message || `HTTP ${response.status}: ${response.statusText}`;
      recordApiTransaction({
        feature: 'Unggah Berkas Audio',
        provider: 'Google Gemini',
        model: model,
        statusCode: response.status,
        latencyMs: callLat,
        payloadBytes: state.uploadedFile.size,
        success: false,
        message: errMsg
      });
      throw new Error(errMsg);
    }

    recordApiTransaction({
      feature: 'Unggah Berkas Audio',
      provider: 'Google Gemini',
      model: model,
      statusCode: 200,
      latencyMs: callLat,
      payloadBytes: state.uploadedFile.size,
      success: true,
      message: 'Transkripsi berkas audio berhasil'
    });

    elements.uploadProgressPercent.textContent = '95%';
    elements.uploadProgressBarFill.style.width = '95%';
    elements.uploadProgressStatusText.textContent = 'Menyusun Hasil Transkripsi...';

    const data = await response.json();
    let resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText && data.candidates?.[0]?.content?.parts) {
      resultText = data.candidates[0].content.parts.map(p => p.text).filter(Boolean).join('\n');
    }
    if (!resultText) {
      resultText = '(Hasil kosong: tidak terdeteksi ucapan manusia dalam berkas audio ini)';
    }

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

    // Automatically save summary to temp folder
    autoSaveSummaryToTempFolder({
      taskType: 'uploaded-audio-transcribe',
      model: model,
      title: `Transkripsi Berkas: ${state.uploadedFile.name}`,
      content: resultText,
      sourceText: `Berkas audio: ${state.uploadedFile.name} (${state.uploadedDurationStr})`
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
  // Always update localStorage as immediate synchronous backup
  try {
    const history = JSON.parse(localStorage.getItem('livevoice_history') || '[]');
    const idx = history.findIndex(h => h.id === entry.id);
    if (idx >= 0) {
      history[idx] = entry;
    } else {
      history.unshift(entry);
    }
    localStorage.setItem('livevoice_history', JSON.stringify(history.slice(0, 60)));
  } catch (e) {
    console.warn('localStorage backup warning:', e);
  }

  // Then persist to IndexedDB
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    await new Promise((resolve) => tx.oncomplete = resolve);
    await refreshHistoryList();
  } catch (err) {
    console.error('IndexedDB save failed, localStorage fallback active:', err);
    await refreshHistoryList();
  }
}

async function getHistoryFromDatabase() {
  let dbItems = [];
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    dbItems = await new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('IndexedDB read error:', err);
  }

  let localItems = [];
  try {
    localItems = JSON.parse(localStorage.getItem('livevoice_history') || '[]');
  } catch (e) {
    localItems = [];
  }

  // Merge items from IndexedDB and localStorage by ID
  const map = new Map();
  localItems.forEach(item => { if (item && item.id) map.set(item.id, item); });
  dbItems.forEach(item => { if (item && item.id) map.set(item.id, item); });

  const merged = Array.from(map.values());
  return merged.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
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

async function deleteMultipleFromHistoryDatabase(ids) {
  if (!ids || ids.length === 0) return;
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    ids.forEach(id => store.delete(id));
    await new Promise((resolve) => tx.oncomplete = resolve);
  } catch (err) {
    let history = JSON.parse(localStorage.getItem('livevoice_history') || '[]');
    const idSet = new Set(ids);
    history = history.filter(h => !idSet.has(h.id));
    localStorage.setItem('livevoice_history', JSON.stringify(history));
  }
  await refreshHistoryList();
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

function getEffectiveModel() {
  const mode = state.activeMode || state.config.activeMode;
  if (mode === 'direct-audio') {
    return elements.geminiAudioModelSelect?.value || state.config.geminiModel || 'gemini-3.6-flash';
  }
  return elements.summaryModelSelect?.value || state.config.summaryAgent?.model || 'Qwen3.8-Max';
}

async function saveCurrentLiveSessionToHistory(isAuto = false) {
  const fullText = getFullTranscriptText().trim();
  if (!fullText) {
    if (!isAuto) showToast('Transkrip aktif masih kosong.', 'error');
    return;
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  
  if (!state.currentSessionId) {
    state.currentSessionId = 'live_' + Date.now();
    state.currentSessionTitle = `Live Session — ${dateStr}`;
    state.currentSessionCreatedAt = now.toISOString();
  }

  const entry = {
    id: state.currentSessionId,
    title: state.currentSessionTitle,
    sourceType: 'live',
    createdAt: state.currentSessionCreatedAt,
    updatedAt: now.toISOString(),
    model: getEffectiveModel(),
    duration: elements.recordTimer?.textContent || '00:00',
    transcriptText: fullText,
    segments: [...state.transcriptSegments],
    markers: [...state.audioMarkers],
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
    const isSelected = state.selectedHistoryCardIds.has(item.id);
    const dateFormatted = new Date(item.createdAt).toLocaleString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const words = item.transcriptText ? item.transcriptText.split(/\s+/).filter(Boolean).length : 0;
    const excerpt = item.transcriptText ? item.transcriptText.slice(0, 180) + '...' : '(Kosong)';

    html += `
      <div class="history-card ${isSelected ? 'is-selected' : ''}" data-id="${item.id}">
        <div class="history-card-header">
          <div class="history-card-title-group">
            <div class="history-card-checkbox-wrap">
              <input type="checkbox" class="history-card-select" data-id="${item.id}" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation()">
            </div>
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

  // Attach card checkbox selection listeners
  container.querySelectorAll('.history-card-select').forEach(chk => {
    chk.addEventListener('change', () => {
      const id = chk.getAttribute('data-id');
      if (chk.checked) {
        state.selectedHistoryCardIds.add(id);
      } else {
        state.selectedHistoryCardIds.delete(id);
      }
      chk.closest('.history-card')?.classList.toggle('is-selected', chk.checked);
      updateHistoryBatchBar();
    });
  });

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
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Hapus transkrip ini dari riwayat?')) {
        deleteFromHistoryDatabase(btn.getAttribute('data-id'));
      }
    });
  });

  // Attach card click listener to open full history detail modal
  container.querySelectorAll('.history-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.history-card-select') || e.target.closest('.history-card-actions')) {
        return;
      }
      const id = card.getAttribute('data-id');
      if (id) openHistoryDetailModal(id);
    });
  });

  updateHistoryBatchBar();
}

function openHistoryDetailModal(id) {
  const item = (state.historyList || []).find(h => h.id === id);
  if (!item) {
    showToast('Sesi transkrip tidak ditemukan.', 'warning');
    return;
  }

  state.activeDetailHistoryId = id;

  if (elements.historyDetailTitle) {
    elements.historyDetailTitle.textContent = item.title || 'Detail Sesi Transkrip';
  }

  if (elements.historyDetailMeta) {
    const dateFormatted = item.createdAt 
      ? new Date(item.createdAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '-';
    const words = item.transcriptText ? item.transcriptText.split(/\s+/).filter(Boolean).length : 0;
    const model = item.model || 'Gemini';
    const dur = item.duration || '-';
    elements.historyDetailMeta.textContent = `📅 ${dateFormatted} • ⏱ Durasi: ${dur} • 🤖 Model: ${model} • 📝 ${words} kata`;
  }

  // AI Analysis / Notula Box
  if (elements.historyDetailAnalysisBox && elements.historyDetailAnalysisContent) {
    if (item.aiAnalysis && item.aiAnalysis.trim()) {
      elements.historyDetailAnalysisBox.classList.remove('hidden');
      elements.historyDetailAnalysisContent.innerHTML = renderMarkdownToHtml(item.aiAnalysis);
    } else {
      elements.historyDetailAnalysisBox.classList.add('hidden');
      elements.historyDetailAnalysisContent.innerHTML = '';
    }
  }

  // Conversation Dialogue Segments
  if (elements.historyDetailSegmentsContainer) {
    const segments = item.segments || [];
    if (segments.length > 0) {
      let segHtml = '';
      segments.forEach((seg, idx) => {
        if (seg.isMarker) {
          segHtml += `
            <div class="marker-chip" style="margin: 4px 0; align-self: flex-start;">
              🚩 ${escapeHtml(seg.text || seg.label || 'Penanda')} <span style="opacity: 0.6;">(${seg.elapsed || seg.time || ''})</span>
            </div>
          `;
          return;
        }

        const speakerRaw = seg.speaker || 'Pembicara';
        let speakerClass = '';
        if (speakerRaw.includes('2')) speakerClass = 'speaker-2';
        else if (speakerRaw.includes('3')) speakerClass = 'speaker-3';

        segHtml += `
          <div class="history-detail-bubble">
            <div class="history-detail-bubble-header">
              <span class="history-detail-speaker ${speakerClass}">
                <i data-lucide="user" class="icon-xs"></i> ${escapeHtml(speakerRaw)}
              </span>
              <span class="history-detail-time">${escapeHtml(seg.time || '')}</span>
            </div>
            <div class="history-detail-bubble-text">${escapeHtml(seg.text || '')}</div>
          </div>
        `;
      });
      elements.historyDetailSegmentsContainer.innerHTML = segHtml;
    } else {
      const fullText = item.transcriptText || '(Transkrip kosong)';
      elements.historyDetailSegmentsContainer.innerHTML = `
        <div class="history-detail-bubble">
          <div class="history-detail-bubble-text">${escapeHtml(fullText)}</div>
        </div>
      `;
    }
  }

  if (elements.historyDetailModal) {
    elements.historyDetailModal.classList.remove('hidden');
    initLucideIcons();
  }
}

function closeHistoryDetailModal() {
  if (elements.historyDetailModal) {
    elements.historyDetailModal.classList.add('hidden');
  }
  state.activeDetailHistoryId = null;
}

function updateHistoryBatchBar() {
  const count = state.selectedHistoryCardIds.size;
  const bar = elements.historyBatchActionBar;
  const badge = elements.historySelectedCountBadge;
  const chkAll = elements.chkSelectAllHistory;

  if (count === 0) {
    bar?.classList.add('hidden');
    if (chkAll) chkAll.checked = false;
    return;
  }

  bar?.classList.remove('hidden');
  if (badge) badge.textContent = `${count} sesi dipilih`;
  if (chkAll) {
    const totalVisible = document.querySelectorAll('.history-card-select').length;
    chkAll.checked = totalVisible > 0 && count === totalVisible;
  }
}

function toggleSelectAllHistoryCards(checked) {
  const visibleCards = document.querySelectorAll('.history-card-select');
  visibleCards.forEach(chk => {
    const id = chk.getAttribute('data-id');
    chk.checked = checked;
    if (checked) {
      state.selectedHistoryCardIds.add(id);
      chk.closest('.history-card')?.classList.add('is-selected');
    } else {
      state.selectedHistoryCardIds.delete(id);
      chk.closest('.history-card')?.classList.remove('is-selected');
    }
  });
  updateHistoryBatchBar();
}

function batchSummarizeSelectedHistory() {
  const ids = Array.from(state.selectedHistoryCardIds);
  if (ids.length === 0) return;

  const selectedSessions = (state.historyList || []).filter(s => ids.includes(s.id));
  if (selectedSessions.length === 0) return;

  const totalWords = selectedSessions.reduce((acc, s) => {
    const text = s.transcriptText || (s.segments || []).map(seg => seg.text).join(' ');
    return acc + (text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0);
  }, 0);

  let combinedText = '';
  if (selectedSessions.length === 1) {
    const s = selectedSessions[0];
    combinedText = (s.transcriptText || (s.segments || []).map(seg => `${seg.speaker || 'Pembicara'}: ${seg.text}`).join('\n')).trim();
  } else {
    combinedText = selectedSessions.map((s, idx) => {
      const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
      const text = (s.transcriptText || (s.segments || []).map(seg => `${seg.speaker || 'Pembicara'}: ${seg.text}`).join('\n')).trim();
      return `========================================\n=== [SESI ${idx + 1}: ${s.title || 'Sesi Live'} (${dateStr}) — ${s.model || 'Model'}] ===\n========================================\n${text}`;
    }).join('\n\n');
  }

  const sourceName = selectedSessions.length === 1 
    ? (selectedSessions[0].title || 'Sesi Riwayat') 
    : `${selectedSessions.length} Sesi Riwayat (${selectedSessions.map(s => s.title || 'Sesi').join(', ')})`;

  state.customSummarySource = {
    type: 'recent',
    name: sourceName,
    text: combinedText,
    sessionIds: ids
  };

  // Sync with AI panel recent selection
  state.selectedRecentSessionIds = new Set(ids);

  // Switch to live view and recent source tab
  switchView('viewLiveTranscribe');
  setSummarySourceTab('recent');
  updateSummarySourcePill('Riwayat:', sourceName, `${totalWords} kata`);
  populateRecentSessionsChecklist();

  showToast(`${selectedSessions.length} sesi riwayat siap diringkas! Silakan klik tombol di panel AI (kanan).`, 'success');
}

function batchExportSelectedHistory() {
  const ids = Array.from(state.selectedHistoryCardIds);
  if (ids.length === 0) return;

  const selectedSessions = (state.historyList || []).filter(s => ids.includes(s.id));
  if (selectedSessions.length === 0) return;

  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = now.toTimeString().substring(0, 5);

  let doc = `# Gabungan Riwayat Transkripsi (${selectedSessions.length} Sesi)\n`;
  doc += `*Diekspor pada: ${dateStr} ${timeStr} WIB*\n\n---\n\n`;

  selectedSessions.forEach((s, idx) => {
    const sDate = s.createdAt ? new Date(s.createdAt).toLocaleString('id-ID') : '-';
    const text = s.transcriptText || (s.segments || []).map(seg => `${seg.speaker || 'Pembicara'}: ${seg.text}`).join('\n');
    doc += `## ${idx + 1}. ${s.title || 'Sesi Transkrip'}\n`;
    doc += `- **Tanggal Dibuat:** ${sDate}\n`;
    doc += `- **Durasi:** ${s.duration || '-'}\n`;
    doc += `- **Model AI:** ${s.model || '-'}\n\n`;
    doc += `### Isi Transkrip:\n\`\`\`\n${text}\n\`\`\`\n\n`;
    if (s.aiAnalysis) {
      doc += `### Hasil Analisis AI:\n${s.aiAnalysis}\n\n`;
    }
    doc += `---\n\n`;
  });

  const blob = new Blob([doc], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gabungan_transkrip_${selectedSessions.length}_sesi_${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`${selectedSessions.length} sesi berhasil digabungkan dan diunduh!`, 'success');
}

async function batchDeleteSelectedHistory() {
  const ids = Array.from(state.selectedHistoryCardIds);
  if (ids.length === 0) return;

  if (!confirm(`Apakah Anda yakin ingin menghapus ${ids.length} sesi riwayat transkripsi yang dipilih?`)) {
    return;
  }

  await deleteMultipleFromHistoryDatabase(ids);
  state.selectedHistoryCardIds.clear();
  updateHistoryBatchBar();
  showToast(`${ids.length} sesi berhasil dihapus dari riwayat.`, 'info');
}

function loadHistoryItemToEditor(id) {
  const item = state.historyList.find(h => h.id === id);
  if (!item) return;

  if (item.segments && item.segments.length > 0) {
    state.transcriptSegments = [...item.segments];
    if (item.markers && Array.isArray(item.markers)) {
      state.audioMarkers = [...item.markers];
    } else {
      state.audioMarkers = item.segments.filter(s => s.isMarker).map(s => ({
        id: s.id,
        elapsed: s.elapsed || '00:00',
        time: s.time,
        label: s.text
      }));
    }
    state.markersCount = state.audioMarkers.length;
    renderMarkerChips();
    if (elements.audioMarkerStrip) {
      elements.audioMarkerStrip.classList.toggle('hidden', state.audioMarkers.length === 0);
    }
  } else {
    state.transcriptSegments = [{
      id: Date.now(),
      time: new Date(item.createdAt).toTimeString().substring(0, 8),
      text: item.transcriptText
    }];
    state.audioMarkers = [];
    state.markersCount = 0;
    renderMarkerChips();
    if (elements.audioMarkerStrip) {
      elements.audioMarkerStrip.classList.add('hidden');
    }
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
  if (!elements.aiOutputContent) return;
  if (!markdownText) {
    elements.aiOutputContent.innerHTML = `
      <div class="empty-ai-state">
        <i data-lucide="sparkles" class="large-ghost-icon"></i>
        <h4>Pilih Tugas AI di Atas</h4>
        <p>Klik <strong>Ringkasan Eksekutif</strong> atau <strong>Notula & To-Do List</strong> kapan saja. Hasil akan diproses di latar belakang tanpa menghentikan transkripsi live.</p>
      </div>
    `;
    initLucideIcons();
    return;
  }

  // Notepad mode: preserves exact raw text formatting with clean monospaced font
  if (state.isNotepadMode) {
    elements.aiOutputContent.className = 'ai-markdown-output notepad-mode';
    elements.aiOutputContent.textContent = markdownText;
    return;
  }

  elements.aiOutputContent.className = 'ai-markdown-output';

  // Structured Markdown Parser (Ensures lists, headers, and checkboxes render cleanly)
  const lines = markdownText.split(/\r?\n/);
  let html = '';
  let inUl = false;
  let inOl = false;

  function closeLists() {
    if (inUl) { html += '</ul>\n'; inUl = false; }
    if (inOl) { html += '</ol>\n'; inOl = false; }
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      closeLists();
      continue;
    }

    // Headers
    const h3Match = trimmed.match(/^###\s+(.*)$/);
    if (h3Match) {
      closeLists();
      html += `<h3>${formatInline(h3Match[1])}</h3>\n`;
      continue;
    }

    const h2Match = trimmed.match(/^##\s+(.*)$/);
    if (h2Match) {
      closeLists();
      html += `<h2>${formatInline(h2Match[1])}</h2>\n`;
      continue;
    }

    const h1Match = trimmed.match(/^#\s+(.*)$/);
    if (h1Match) {
      closeLists();
      html += `<h1>${formatInline(h1Match[1])}</h1>\n`;
      continue;
    }

    // Task list checklist items (- [ ] or - [x])
    const taskMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (taskMatch) {
      if (inOl) { html += '</ol>\n'; inOl = false; }
      if (!inUl) { html += '<ul style="list-style-type: none; padding-left: 4px;">\n'; inUl = true; }
      const isChecked = taskMatch[1].toLowerCase() === 'x';
      const icon = isChecked ? '☑' : '☐';
      html += `<li style="margin-bottom: 5px; list-style-type: none;"><strong>${icon}</strong> ${formatInline(taskMatch[2])}</li>\n`;
      continue;
    }

    // Unordered bullet list items (- or * or •)
    const ulMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (ulMatch) {
      if (inOl) { html += '</ol>\n'; inOl = false; }
      if (!inUl) { html += '<ul>\n'; inUl = true; }
      html += `<li>${formatInline(ulMatch[1])}</li>\n`;
      continue;
    }

    // Ordered numbered list items (1. 2. etc)
    const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (olMatch) {
      if (inUl) { html += '</ul>\n'; inUl = false; }
      if (!inOl) { html += '<ol>\n'; inOl = true; }
      html += `<li>${formatInline(olMatch[2])}</li>\n`;
      continue;
    }

    // Normal paragraph text
    closeLists();
    html += `<p>${formatInline(trimmed)}</p>\n`;
  }

  closeLists();

  function formatInline(str) {
    return escapeHtml(str)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  elements.aiOutputContent.innerHTML = html;
}

function toggleNotepadView() {
  state.isNotepadMode = !state.isNotepadMode;
  if (elements.notepadViewToggleLabel) {
    elements.notepadViewToggleLabel.textContent = state.isNotepadMode ? 'Mode Web' : 'Mode Notepad';
  }
  if (state.lastAIResult) {
    renderAIResult(state.lastAIResult);
  }
  showToast(state.isNotepadMode ? 'Beralih ke tampilan format Notepad (Teks Bersih)' : 'Beralih ke format Tampilan Web', 'info');
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

async function autoDetectOmniKey() {
  try {
    showToast('Mencari kunci API Omni Router di sistem...', 'info');
    const res = await fetch('/api/get-omni-key');
    const key = data.apiKey || data.key;
    const foundPath = data.foundAt || data.path || '~/.omniroute/omniroute-api-key.txt';
    if (data.success && key) {
      if (elements.omniApiKey) {
        elements.omniApiKey.value = key;
      }
      state.config.omniApiKey = key;
      saveConfig();
      showToast(`Kunci API Omni Router berhasil terdeteksi dari ${foundPath}!`, 'success');
    } else {
      showToast(`Gagal mendeteksi: ${data.error || 'File kunci tidak ditemukan'}`, 'error');
    }
  } catch (err) {
    console.error('Error auto-detecting Omni key:', err);
    showToast('Gagal memanggil backend untuk membaca kunci Omni Router.', 'error');
  }
}

async function testOmniConnection() {
  const statusEl = elements.omniConnectionStatus;
  const baseUrl = elements.omniBaseUrl?.value.trim() || state.config.omniBaseUrl || 'http://localhost:20128/v1';
  const apiKey = elements.omniApiKey?.value.trim() || state.config.omniApiKey || '';
  const model = elements.omniDefaultModel?.value || state.config.omniModel || 'combo-gratis';

  if (statusEl) {
    statusEl.className = 'connection-status-pill loading';
    statusEl.innerHTML = '<span class="status-dot"></span> Sedang menguji koneksi ke port :20128...';
    statusEl.classList.remove('hidden');
  }

  try {
    const res = await fetch('/api/test-omni-router', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, apiKey, model })
    });
    const data = await res.json();
    if (data.success) {
      if (statusEl) {
        statusEl.className = 'connection-status-pill success';
        statusEl.innerHTML = `🟢 <strong>Terhubung!</strong> Model: <code>${data.model}</code> | Latensi: <strong>${data.latencyMs}ms</strong>`;
      }
      showToast(`Omni Router aktif (${data.latencyMs}ms)! Respon: "${(data.reply || '').slice(0, 40)}..."`, 'success');
    } else {
      if (statusEl) {
        statusEl.className = 'connection-status-pill error';
        statusEl.innerHTML = `🔴 <strong>Gagal:</strong> ${data.error || 'Tidak dapat terhubung ke :20128'}`;
      }
      showToast(`Koneksi Omni Router gagal: ${data.error}`, 'error');
    }
  } catch (err) {
    if (statusEl) {
      statusEl.className = 'connection-status-pill error';
      statusEl.innerHTML = `🔴 <strong>Error:</strong> Gagal menghubungi server pengujian.`;
    }
    showToast(`Error pengujian koneksi: ${err.message}`, 'error');
  }
}

function openExportModal() {
  const hasTranscript = Boolean(getFullTranscriptText().trim());
  const hasAudio = (state.fullSessionAudioChunks && state.fullSessionAudioChunks.length > 0) || (state.audioChunks && state.audioChunks.length > 0);

  if (!hasTranscript && !hasAudio) {
    showToast('Transkrip & rekaman masih kosong. Tidak ada data untuk diekspor.', 'error');
    return;
  }
  elements.exportModal.classList.remove('hidden');
}

function closeExportModal() {
  elements.exportModal.classList.add('hidden');
}

function exportTranscript(format) {
  if (format === 'audio') {
    downloadRecordedAudio();
    return;
  }

  const rawText = getFullTranscriptText().trim();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  let filename = `transcript_${timestamp}`;
  let content = '';
  let mimeType = 'text/plain';

  if (format === 'txt') {
    filename += '.txt';
    content = state.transcriptSegments.map(s => {
      if (s.isMarker) {
        return `----------------------------------------\n[🚩 PENANDA REKAMAN ${s.elapsed} (${s.time})]: ${s.text}\n----------------------------------------`;
      }
      return `[${s.time}] ${s.text}`;
    }).join('\n');
  } else if (format === 'md') {
    filename += '.md';
    mimeType = 'text/markdown';
    content = `# Transkrip Rekaman — ${new Date().toLocaleDateString('id-ID')}\n\n`;
    
    if (state.audioMarkers.length > 0) {
      content += `## 🚩 Penanda Audio (Windows Voice Recorder Markers)\n\n`;
      state.audioMarkers.forEach((m, idx) => {
        content += `${idx + 1}. **[${m.elapsed}]** (${m.time}) — *${m.label}*\n`;
      });
      content += '\n---\n\n';
    }

    content += `## Transkrip Percakapan\n\n`;
    state.transcriptSegments.forEach(s => {
      if (s.isMarker) {
        content += `\n> 🚩 **[Penanda Rekaman ${s.elapsed} (${s.time})]**: *${s.text}*\n\n`;
      } else {
        content += `- **[${s.time}]**: ${s.text}\n`;
      }
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
      markers: state.audioMarkers,
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

// --- AUTO-SAVE SUMMARY & INTELLIGENCE TO LOCAL TEMP FOLDER ---

async function autoSaveSummaryToTempFolder({ taskType, model, title, content, sourceText = '' }) {
  try {
    const payload = {
      taskType: taskType || 'general-summary',
      model: model || getEffectiveModel(),
      title: title || 'Ringkasan & Analisis AI',
      content: content || '',
      sourceText: sourceText || ''
    };

    const response = await fetch('/api/save-temp-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const result = await response.json();
      console.log('Summary auto-saved to temp folder:', result.file);
      // Silently refresh count badge
      loadTempSummaryHistory(false);
    } else {
      console.warn('Gagal menyimpan temp summary ke server (status:', response.status, ')');
    }
  } catch (err) {
    console.warn('Koneksi ke backend temp summary tidak aktif:', err.message);
  }
}

async function loadTempSummaryHistory(showToastFlag = false) {
  try {
    const response = await fetch('/api/list-temp-summaries');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    state.tempSummaryList = data.items || data.files || [];

    if (elements.tempSummaryCountBadge) {
      elements.tempSummaryCountBadge.textContent = state.tempSummaryList.length;
    }
    if (elements.tempSummaryCountTotal) {
      elements.tempSummaryCountTotal.textContent = `${state.tempSummaryList.length} Berkas di Folder Temp`;
    }

    renderTempSummaryCards();

    if (showToastFlag) {
      showToast(`Daftar riwayat temp diperbarui (${state.tempSummaryList.length} berkas).`, 'info');
    }
  } catch (err) {
    console.warn('Gagal memuat riwayat temp summary:', err);
    if (showToastFlag) {
      showToast('Gagal memuat riwayat temp dari server lokal.', 'error');
    }
  }
}

function renderTempSummaryCards(itemsToRender = null) {
  const container = elements.tempSummaryListContainer;
  if (!container) return;

  const items = itemsToRender || state.tempSummaryList || [];

  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; padding: 40px 20px;">
        <div class="empty-icon-circle">
          <i data-lucide="folder-open" class="empty-icon"></i>
        </div>
        <h3>Belum Ada Riwayat Summary di Folder Temp</h3>
        <p>Setiap kali Anda menekan <strong>Ringkasan Eksekutif</strong>, <strong>Notula</strong>, atau <strong>Rapikan Transkrip</strong>, hasilnya akan otomatis disimpan ke folder fisik <code>temp/summaries/</code> sebagai file Markdown (.md).</p>
      </div>
    `;
    initLucideIcons();
    return;
  }

  let html = '';
  items.forEach(item => {
    const dateFormatted = item.createdAt 
      ? new Date(item.createdAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '-';

    const cleanTitle = escapeHtml(item.title || 'Summary AI');
    const cleanModel = escapeHtml(item.model || 'AI Model');
    const cleanTask = escapeHtml(item.taskType || 'Summary');
    const rawPreview = item.contentSnippet || (item.content ? item.content.slice(0, 180) + '...' : '(Kosong)');
    const preview = escapeHtml(rawPreview);
    const safeFilename = encodeURIComponent(item.filename);

    html += `
      <div class="temp-summary-card" data-filename="${safeFilename}">
        <div class="temp-summary-card-header">
          <div class="temp-summary-card-title-group">
            <h4 class="temp-summary-card-title" title="${cleanTitle}">
              <i data-lucide="file-text" class="icon-accent"></i> ${cleanTitle}
            </h4>
            <div class="temp-summary-card-meta">
              <span>📅 ${dateFormatted}</span>
              <span>📁 ${escapeHtml(item.filename)}</span>
            </div>
          </div>
          <div class="temp-summary-card-badges">
            <span class="temp-card-task-badge">${cleanTask}</span>
            <span class="tag-model">${cleanModel}</span>
          </div>
        </div>

        <div class="temp-summary-card-snippet">
          ${preview}
        </div>

        <div class="temp-summary-card-footer">
          <span class="stat-label">📄 .md di <code>temp/summaries/</code></span>
          <div class="temp-summary-card-actions">
            <button class="btn-icon-subtle btn-temp-load" onclick="window.loadTempSummaryToPanel('${safeFilename}')" title="Buka ke Panel Hasil AI">
              <i data-lucide="external-link"></i> Muat
            </button>
            <button class="btn-icon-subtle btn-temp-copy" onclick="window.copyTempSummaryText('${safeFilename}')" title="Salin Isi Teks">
              <i data-lucide="copy"></i> Salin
            </button>
            <button class="btn-icon-subtle btn-temp-download" onclick="window.downloadTempSummaryFile('${safeFilename}')" title="Unduh File Markdown">
              <i data-lucide="download"></i> Unduh
            </button>
            <button class="btn-icon-subtle btn-temp-delete" onclick="window.deleteTempSummaryFile('${safeFilename}')" title="Hapus File dari Disk">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  initLucideIcons();
}

function filterTempSummaryCards(query = '') {
  if (!query) {
    renderTempSummaryCards();
    return;
  }

  const filtered = state.tempSummaryList.filter(item => {
    return (item.title && item.title.toLowerCase().includes(query)) ||
           (item.filename && item.filename.toLowerCase().includes(query)) ||
           (item.model && item.model.toLowerCase().includes(query)) ||
           (item.contentSnippet && item.contentSnippet.toLowerCase().includes(query)) ||
           (item.taskType && item.taskType.toLowerCase().includes(query));
  });

  renderTempSummaryCards(filtered);
}

// Global exposure for onclick handlers
window.loadTempSummaryToPanel = async function(encodedFilename) {
  const filename = decodeURIComponent(encodedFilename);
  try {
    const response = await fetch(`/api/get-temp-summary?file=${encodeURIComponent(filename)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    state.lastAIResult = data.content || '';
    renderAIResult(state.lastAIResult);

    if (elements.aiResultTitle) {
      elements.aiResultTitle.textContent = data.title || filename;
    }
    if (elements.aiModelUsedBadge) {
      elements.aiModelUsedBadge.textContent = data.model || 'File Temp';
    }

    closeSummaryHistoryModal();
    showToast(`File ${filename} berhasil dimuat ke Panel Ringkasan AI!`, 'success');
  } catch (err) {
    console.error('Gagal membuka temp summary:', err);
    showToast('Gagal memuat berkas summary dari folder temp.', 'error');
  }
};

window.copyTempSummaryText = async function(encodedFilename) {
  const filename = decodeURIComponent(encodedFilename);
  try {
    const response = await fetch(`/api/get-temp-summary?file=${encodeURIComponent(filename)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    const textToCopy = data.content || '';
    if (!textToCopy) {
      showToast('Isi file kosong.', 'warning');
      return;
    }

    await navigator.clipboard.writeText(textToCopy);
    showToast(`Teks dari ${filename} berhasil disalin ke clipboard!`, 'success');
  } catch (err) {
    showToast('Gagal menyalin isi file.', 'error');
  }
};

window.downloadTempSummaryFile = async function(encodedFilename) {
  const filename = decodeURIComponent(encodedFilename);
  try {
    const response = await fetch(`/api/get-temp-summary?file=${encodeURIComponent(filename)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    const textToDownload = data.content || '';
    downloadFile(textToDownload, filename, 'text/markdown');
    showToast(`File ${filename} diunduh!`, 'success');
  } catch (err) {
    showToast('Gagal mengunduh file.', 'error');
  }
};

window.deleteTempSummaryFile = async function(encodedFilename) {
  const filename = decodeURIComponent(encodedFilename);
  if (!confirm(`Hapus file "${filename}" dari folder temp di komputer?`)) return;

  try {
    const response = await fetch(`/api/delete-temp-summary?file=${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      showToast(`File ${filename} telah dihapus dari folder temp.`, 'info');
      await loadTempSummaryHistory(false);
    } else {
      showToast('Gagal menghapus file dari server.', 'error');
    }
  } catch (err) {
    showToast('Gagal menghubungi server untuk menghapus file.', 'error');
  }
};

function openSummaryHistoryModal() {
  if (elements.summaryHistoryModal) {
    elements.summaryHistoryModal.classList.remove('hidden');
    if (elements.tempSummarySearchInput) {
      elements.tempSummarySearchInput.value = '';
    }
    loadTempSummaryHistory(false);
    initLucideIcons();
  }
}

function closeSummaryHistoryModal() {
  if (elements.summaryHistoryModal) {
    elements.summaryHistoryModal.classList.add('hidden');
  }
}

async function openTempFolderInWindowsExplorer() {
  const folderPath = 'E:\\HERMES OUTPUT\\Transcript\\temp_summary';
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(folderPath);
    }
  } catch (e) {}

  try {
    showToast('Membuka folder temp di Windows Explorer...', 'info');
    const res = await fetch('/api/open-temp-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'summary' })
    });
    const data = await res.json().catch(() => ({}));
    showToast(`Path folder disalin ke clipboard: ${data.path || folderPath}`, 'success');
  } catch (err) {
    console.warn('Gagal membuka folder di explorer:', err);
    showToast(`Path folder disalin ke clipboard: ${folderPath}`, 'info');
  }
}

// --- DEDICATED AUDIO-IN TEMP STORAGE & HISTORY ---

async function autoSaveAudioInToTempFolder(payload) {
  try {
    const res = await fetch('/api/save-temp-audio-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      console.log('Audio-In chunk saved to temp/audio_in:', data.filename);
    }
  } catch (err) {
    console.warn('Gagal menyimpan riwayat audio-in ke temp:', err);
  }
}

async function fetchAudioInHistoryList() {
  try {
    const res = await fetch('/api/list-temp-audio-in');
    const data = await res.json();
    return data.items || [];
  } catch (err) {
    console.error('Error fetching audio-in history:', err);
    return [];
  }
}

function renderAudioInHistoryCards(filter = '') {
  const container = elements.audioInListContainer;
  if (!container) return;

  let items = state.tempAudioInList || [];
  if (filter) {
    items = items.filter(it => 
      (it.title && it.title.toLowerCase().includes(filter)) ||
      (it.speaker && it.speaker.toLowerCase().includes(filter)) ||
      (it.excerpt && it.excerpt.toLowerCase().includes(filter)) ||
      (it.model && it.model.toLowerCase().includes(filter))
    );
  }

  if (elements.audioInCountTotal) {
    elements.audioInCountTotal.textContent = `${items.length} Berkas`;
  }

  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; padding: 40px 20px;">
        <div class="empty-icon-circle"><i data-lucide="mic-off" class="empty-icon"></i></div>
        <h3>Belum Ada Riwayat Audio-In</h3>
        <p>Rekaman suara yang dikirim melalui Gemini Audio-In akan otomatis tersimpan sebagai file terpisah di <code>temp/audio_in/</code>.</p>
      </div>
    `;
    initLucideIcons();
    return;
  }

  let html = '';
  items.forEach(item => {
    const dateStr = new Date(item.createdAt).toLocaleString('id-ID');
    const sizeKb = item.sizeBytes ? (item.sizeBytes / 1024).toFixed(1) + ' KB' : '-';
    const safeFilename = encodeURIComponent(item.filenameMd || '');

    html += `
      <div class="temp-summary-card" data-filename="${safeFilename}">
        <div class="temp-summary-card-header">
          <div class="temp-summary-card-title-group">
            <h4 class="temp-summary-card-title">
              <i data-lucide="mic" class="icon-accent"></i> ${escapeHtml(item.title || 'Audio-In')}
            </h4>
            <div class="temp-summary-card-meta">
              <span>📅 ${dateStr}</span>
              <span>👤 ${escapeHtml(item.speaker || 'Pembicara')}</span>
              <span>📦 ${sizeKb}</span>
            </div>
          </div>
          <div class="temp-summary-card-badges">
            <span class="tag-model">${escapeHtml(item.model || 'Gemini')}</span>
          </div>
        </div>

        <div class="temp-summary-card-snippet">
          ${escapeHtml(item.excerpt || '(Teks kosong)')}
        </div>

        <div class="temp-summary-card-footer">
          <span class="stat-label">📄 ${escapeHtml(item.filenameMd || '')}</span>
          <div class="temp-summary-card-actions">
            <button class="btn-icon-subtle btn-temp-load" onclick="window.loadAudioInToTranscript('${safeFilename}')" title="Masukkan Teks ke Chat Transkrip">
              <i data-lucide="corner-down-left"></i> Masukkan ke Chat
            </button>
            <button class="btn-icon-subtle btn-temp-copy" onclick="window.copyAudioInContent('${safeFilename}')" title="Salin Isi Teks">
              <i data-lucide="copy"></i> Salin
            </button>
            <button class="btn-icon-subtle btn-temp-delete" onclick="window.deleteAudioInItem('${safeFilename}')" title="Hapus Berkas dari Disk">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  initLucideIcons();
}

async function openAudioInHistoryModal() {
  if (!elements.audioInHistoryModal) return;
  elements.audioInHistoryModal.classList.remove('hidden');
  state.tempAudioInList = await fetchAudioInHistoryList();
  renderAudioInHistoryCards(elements.audioInSearchInput?.value.trim().toLowerCase() || '');
}

function closeAudioInHistoryModal() {
  elements.audioInHistoryModal?.classList.add('hidden');
}

window.loadAudioInToTranscript = async function(encodedFilename) {
  const filename = decodeURIComponent(encodedFilename);
  try {
    const res = await fetch(`/api/get-temp-audio-in?file=${encodeURIComponent(filename)}`);
    const data = await res.json();
    if (data.content) {
      const cleanContent = data.content
        .replace(/^---[\s\S]*?---\n*/, '')
        .replace(/^#.*\n*/, '')
        .replace(/\*\*Model AI:\*\*.*\n*/, '')
        .replace(/\*\*Waktu:\*\*.*\n*/, '')
        .replace(/\*\*Pembicara:\*\*.*\n*/, '')
        .replace(/^---+\n*/, '')
        .trim();

      state.transcriptSegments.push({
        id: Date.now() + Math.random(),
        time: new Date().toTimeString().substring(0, 8),
        speaker: 'Audio-In',
        text: cleanContent
      });
      renderTranscript();
      updateStats();
      saveCurrentLiveSessionToHistory(true);
      closeAudioInHistoryModal();
      showToast('Potongan audio berhasil dimasukkan ke transkrip obrolan!', 'success');
    }
  } catch (err) {
    showToast('Gagal memuat berkas audio: ' + err.message, 'error');
  }
};

window.copyAudioInContent = async function(encodedFilename) {
  const filename = decodeURIComponent(encodedFilename);
  try {
    const res = await fetch(`/api/get-temp-audio-in?file=${encodeURIComponent(filename)}`);
    const data = await res.json();
    if (data.content) {
      await navigator.clipboard.writeText(data.content);
      showToast('Isi berkas transkrip audio disalin ke clipboard!', 'success');
    }
  } catch (err) {
    showToast('Gagal menyalin: ' + err.message, 'error');
  }
};

window.deleteAudioInItem = async function(encodedFilename) {
  const filename = decodeURIComponent(encodedFilename);
  if (!confirm(`Hapus berkas "${filename}" dari folder temp/audio_in?`)) return;
  try {
    const res = await fetch(`/api/delete-temp-audio-in?file=${encodeURIComponent(filename)}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Berkas audio-in berhasil dihapus.', 'info');
      state.tempAudioInList = await fetchAudioInHistoryList();
      renderAudioInHistoryCards(elements.audioInSearchInput?.value.trim().toLowerCase() || '');
    }
  } catch (err) {
    showToast('Gagal menghapus berkas: ' + err.message, 'error');
  }
};

async function openAudioInTempFolderInExplorer() {
  const folderPath = 'E:\\HERMES OUTPUT\\Transcript\\temp_session';
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(folderPath);
    }
  } catch (e) {}

  try {
    showToast('Membuka folder temp session di Windows Explorer...', 'info');
    const res = await fetch('/api/open-temp-audio-in-folder', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    showToast(`Path folder disalin ke clipboard: ${data.path || folderPath}`, 'success');
  } catch (err) {
    console.warn('Gagal membuka folder audio-in:', err);
    showToast(`Path folder disalin ke clipboard: ${folderPath}`, 'info');
  }
}

// --- RECORDED AUDIO SAVING & UPLOAD INTEGRATION ---

async function downloadRecordedAudio() {
  if (state.isRecording && state.mediaRecorder && state.mediaRecorder.state === 'recording') {
    try {
      if (typeof state.mediaRecorder.requestData === 'function') {
        state.mediaRecorder.requestData();
      }
    } catch (e) {}
  }

  const chunks = (state.fullSessionAudioChunks && state.fullSessionAudioChunks.length > 0)
    ? state.fullSessionAudioChunks
    : state.audioChunks;

  if (!chunks || chunks.length === 0) {
    showToast('Belum ada rekaman suara yang tersimpan. Mulai transkrip atau rekam terlebih dahulu.', 'warning');
    return;
  }

  const mimeType = state.recordedMimeType || 'audio/webm';
  const audioBlob = new Blob(chunks, { type: mimeType });
  if (audioBlob.size < 1000) {
    showToast('Ukuran rekaman audio kosong atau terlalu kecil.', 'warning');
    return;
  }

  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
  const filename = `LiveVoice_Rekaman_${dateStr}.${ext}`;

  // 1. Browser download trigger
  const url = URL.createObjectURL(audioBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);

  showToast(`Mengunduh rekaman audio: ${filename} (${(audioBlob.size / 1024).toFixed(1)} KB)...`, 'success');

  // 2. Backup to server temp/recordings folder
  try {
    const base64Data = await blobToBase64(audioBlob);
    await fetch('/api/save-audio-recording', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64: base64Data.split(',')[1],
        filename: filename,
        mimeType: mimeType,
        duration: elements.recordTimer?.textContent || '00:00',
        timestamp: Date.now(),
        size: audioBlob.size
      })
    });
  } catch (err) {
    console.warn('Gagal mencadangkan rekaman ke server:', err);
  }
}

function useLastRecordingInUploadTab() {
  if (state.isRecording && state.mediaRecorder && state.mediaRecorder.state === 'recording') {
    try {
      if (typeof state.mediaRecorder.requestData === 'function') {
        state.mediaRecorder.requestData();
      }
    } catch (e) {}
  }

  const chunks = (state.fullSessionAudioChunks && state.fullSessionAudioChunks.length > 0)
    ? state.fullSessionAudioChunks
    : state.audioChunks;

  if (!chunks || chunks.length === 0) {
    showToast('Belum ada rekaman suara dari sesi live. Rekam suara di tab Transkrip Live terlebih dahulu.', 'warning');
    return;
  }

  const mimeType = state.recordedMimeType || 'audio/webm';
  const audioBlob = new Blob(chunks, { type: mimeType });
  if (audioBlob.size < 1000) {
    showToast('Rekaman audio masih kosong.', 'warning');
    return;
  }

  const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `Rekaman_Live_${dateStr}.${ext}`;
  const file = new File([audioBlob], filename, { type: mimeType });

  handleSelectedAudioFile(file);
  showToast(`Rekaman audio live (${(audioBlob.size / 1024).toFixed(1)} KB) berhasil dimuat ke tab Unggah!`, 'success');
}

async function openRecordingsFolderInExplorer() {
  try {
    showToast('Membuka folder temp/recordings di Windows Explorer...', 'info');
    const res = await fetch('/api/open-recordings-folder', { method: 'POST' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    showToast('Folder temp/recordings berhasil dibuka!', 'success');
  } catch (err) {
    console.warn('Gagal membuka folder recordings:', err);
    showToast('Folder rekaman: D:\\Metrodata\\Transcript\\temp\\recordings', 'info');
  }
}

