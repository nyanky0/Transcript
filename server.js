/**
 * LiveVoice AI — Lightweight Local Server & Temp Storage Manager
 * Serves web interface and provides REST APIs for saving & loading AI summaries to temp folder.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { exec, spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

// Base directory configuration (Requested: E:\HERMES OUTPUT\Transcript\)
const PREFERRED_BASE_DIR = 'E:\\HERMES OUTPUT\\Transcript';
const LOCAL_FALLBACK_DIR = path.join(__dirname, 'temp');

function resolveBaseDir() {
  try {
    if (fs.existsSync('E:\\HERMES OUTPUT') || fs.existsSync('E:\\')) {
      if (!fs.existsSync(PREFERRED_BASE_DIR)) {
        fs.mkdirSync(PREFERRED_BASE_DIR, { recursive: true });
      }
      return PREFERRED_BASE_DIR;
    }
  } catch (e) {
    console.warn('[SERVER] Drive E: check failed, using local fallback:', e.message);
  }
  return LOCAL_FALLBACK_DIR;
}

const ACTIVE_BASE_DIR = resolveBaseDir();

// Two distinct folders as requested by user:
// 1. temp_session (for live transcripts, recordings, and audio-in)
// 2. temp_summary (for AI summaries, notula, action items)
const TEMP_SESSION_DIR = path.join(ACTIVE_BASE_DIR, 'temp_session');
const TEMP_SUMMARY_DIR = path.join(ACTIVE_BASE_DIR, 'temp_summary');

// Directory aliases for backward compatibility
const TEMP_SUMMARIES_DIR = TEMP_SUMMARY_DIR;
const TEMP_AUDIO_IN_DIR = TEMP_SESSION_DIR;
const TEMP_RECORDINGS_DIR = TEMP_SESSION_DIR;
const TEMP_DIR = ACTIVE_BASE_DIR;

function launchWindowsExplorer(targetPath) {
  const folderAbs = path.resolve(targetPath);
  if (!fs.existsSync(folderAbs)) {
    fs.mkdirSync(folderAbs, { recursive: true });
  }
  console.log(`[EXPLORER] Opening folder: ${folderAbs}`);
  try {
    exec(`explorer.exe "${folderAbs}"`);
  } catch (e) {}

  try {
    exec(`powershell.exe -NoProfile -Command "Start-Process explorer.exe -ArgumentList '${folderAbs}'"`);
  } catch (e) {}

  try {
    exec(`cmd.exe /c start "" "${folderAbs}"`);
  } catch (e) {}

  return true;
}

// Ensure target directories exist
[TEMP_SESSION_DIR, TEMP_SUMMARY_DIR].forEach(d => {
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
  }
});

// Automatically migrate & synchronize old temp files to drive E:
function migrateOldTempFiles() {
  try {
    const oldSummaries = path.join(LOCAL_FALLBACK_DIR, 'summaries');
    if (fs.existsSync(oldSummaries)) {
      const files = fs.readdirSync(oldSummaries);
      files.forEach(f => {
        const src = path.join(oldSummaries, f);
        const dst = path.join(TEMP_SUMMARY_DIR, f);
        if (fs.statSync(src).isFile()) {
          try {
            if (!fs.existsSync(dst)) {
              fs.copyFileSync(src, dst);
            }
          } catch (e) {}
        }
      });
    }

    const oldAudioIn = path.join(LOCAL_FALLBACK_DIR, 'audio_in');
    if (fs.existsSync(oldAudioIn)) {
      const files = fs.readdirSync(oldAudioIn);
      files.forEach(f => {
        const src = path.join(oldAudioIn, f);
        const dst = path.join(TEMP_SESSION_DIR, f);
        if (fs.statSync(src).isFile()) {
          try {
            if (!fs.existsSync(dst)) {
              fs.copyFileSync(src, dst);
            }
          } catch (e) {}
        }
      });
    }

    const oldRecordings = path.join(LOCAL_FALLBACK_DIR, 'recordings');
    if (fs.existsSync(oldRecordings)) {
      const files = fs.readdirSync(oldRecordings);
      files.forEach(f => {
        const src = path.join(oldRecordings, f);
        const dst = path.join(TEMP_SESSION_DIR, f);
        if (fs.statSync(src).isFile()) {
          try {
            if (!fs.existsSync(dst)) {
              fs.copyFileSync(src, dst);
            }
          } catch (e) {}
        }
      });
    }

    const oldLog = path.join(LOCAL_FALLBACK_DIR, 'gemini_audio.log');
    const newLog = path.join(TEMP_SESSION_DIR, 'gemini_audio.log');
    if (fs.existsSync(oldLog) && !fs.existsSync(newLog)) {
      try { fs.copyFileSync(oldLog, newLog); } catch (e) {}
    }
  } catch (e) {
    console.warn('[MIGRATION] Error syncing temp files:', e.message);
  }
}
migrateOldTempFiles();

function resolveSummaryFile(filename) {
  const clean = filename.replace(/\.(md|json)$/i, '');
  const candidates = [
    path.join(TEMP_SUMMARY_DIR, filename),
    path.join(TEMP_SUMMARY_DIR, `${clean}.md`),
    path.join(TEMP_SUMMARY_DIR, `${clean}.json`),
    path.join(LOCAL_FALLBACK_DIR, 'summaries', filename),
    path.join(LOCAL_FALLBACK_DIR, 'summaries', `${clean}.md`),
    path.join(LOCAL_FALLBACK_DIR, 'summaries', `${clean}.json`)
  ];

  for (const cand of candidates) {
    if (fs.existsSync(cand)) {
      try {
        if (cand.endsWith('.json')) {
          const raw = fs.readFileSync(cand, 'utf-8');
          const parsed = JSON.parse(raw);
          return {
            filename: path.basename(cand),
            content: parsed.content || raw,
            title: parsed.title,
            model: parsed.model,
            path: cand
          };
        } else {
          const content = fs.readFileSync(cand, 'utf-8');
          return {
            filename: path.basename(cand),
            content,
            title: null,
            model: null,
            path: cand
          };
        }
      } catch (e) {}
    }
  }
  return null;
}

function resolveAudioInFile(filename) {
  const clean = filename.replace(/\.(md|json)$/i, '');
  const candidates = [
    path.join(TEMP_SESSION_DIR, filename),
    path.join(TEMP_SESSION_DIR, `${clean}.md`),
    path.join(TEMP_SESSION_DIR, `${clean}.json`),
    path.join(LOCAL_FALLBACK_DIR, 'audio_in', filename),
    path.join(LOCAL_FALLBACK_DIR, 'audio_in', `${clean}.md`),
    path.join(LOCAL_FALLBACK_DIR, 'audio_in', `${clean}.json`)
  ];

  for (const cand of candidates) {
    if (fs.existsSync(cand)) {
      try {
        if (cand.endsWith('.json')) {
          const raw = fs.readFileSync(cand, 'utf-8');
          const parsed = JSON.parse(raw);
          return {
            filename: path.basename(cand),
            content: parsed.transcript || parsed.content || raw,
            model: parsed.model,
            path: cand
          };
        } else {
          const content = fs.readFileSync(cand, 'utf-8');
          return {
            filename: path.basename(cand),
            content,
            model: null,
            path: cand
          };
        }
      } catch (e) {}
    }
  }
  return null;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.webm': 'audio/webm',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) { // 25MB max
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({ raw: body });
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  // --- API ENDPOINTS ---

  // 1. SAVE SUMMARY TO TEMP FOLDER
  if (pathname === '/api/save-temp-summary' && req.method === 'POST') {
    try {
      const data = await parseRequestBody(req);
      const { taskType = 'summary', model = 'AI', title = 'Summary', content = '', sourceText = '' } = data;

      if (!content.trim()) {
        return sendJson(res, 400, { error: 'Konten summary tidak boleh kosong' });
      }

      const now = new Date();
      const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const safeTask = (taskType || 'ai-result').replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeModel = (model || 'model').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filenameBase = `Summary_${dateStr}_${safeTask}_${safeModel}`;
      
      const mdFilename = `${filenameBase}.md`;
      const jsonFilename = `${filenameBase}.json`;
      const mdPath = path.join(TEMP_SUMMARIES_DIR, mdFilename);
      const jsonPath = path.join(TEMP_SUMMARIES_DIR, jsonFilename);

      // Compose Markdown Document
      let mdContent = `# ${title}\n\n`;
      mdContent += `> **Tanggal:** ${now.toLocaleString('id-ID')} | **Model:** \`${model}\` | **Tugas:** \`${taskType}\`\n\n`;
      mdContent += `---\n\n`;
      mdContent += `## Hasil Analisis / Ringkasan\n\n`;
      mdContent += `${content.trim()}\n\n`;
      
      if (sourceText && sourceText.trim()) {
        mdContent += `---\n\n`;
        mdContent += `### Cuplikan Sumber Transkrip\n\n`;
        const truncatedSource = sourceText.trim().slice(0, 2000);
        mdContent += `> ${truncatedSource.replace(/\n/g, '\n> ')}\n`;
        if (sourceText.length > 2000) {
          mdContent += `\n*(...dipotong ${sourceText.length - 2000} karakter)*\n`;
        }
      }

      fs.writeFileSync(mdPath, mdContent, 'utf-8');

      // Compose structured JSON metadata
      const jsonPayload = {
        id: `temp_${Date.now()}`,
        filename: mdFilename,
        title: title,
        taskType: taskType,
        model: model,
        createdAt: now.toISOString(),
        content: content.trim(),
        sourceExcerpt: sourceText ? sourceText.slice(0, 300) : ''
      };
      fs.writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2), 'utf-8');

      return sendJson(res, 200, {
        success: true,
        message: 'Summary berhasil disimpan di folder temp',
        filename: mdFilename,
        filePath: mdPath,
        item: jsonPayload
      });
    } catch (err) {
      console.error('Error saving temp summary:', err);
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 2. LIST ALL SUMMARIES FROM TEMP FOLDER
  if (pathname === '/api/list-temp-summaries' && req.method === 'GET') {
    try {
      if (!fs.existsSync(TEMP_SUMMARIES_DIR)) {
        return sendJson(res, 200, { items: [] });
      }

      const files = fs.readdirSync(TEMP_SUMMARIES_DIR);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      const items = [];
      for (const jFile of jsonFiles) {
        try {
          const fullPath = path.join(TEMP_SUMMARIES_DIR, jFile);
          const stat = fs.statSync(fullPath);
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const parsed = JSON.parse(raw);
          parsed.mtime = stat.mtime;
          parsed.size = stat.size;
          items.push(parsed);
        } catch (e) {}
      }

      // Sort newest first
      items.sort((a, b) => new Date(b.createdAt || b.mtime) - new Date(a.createdAt || a.mtime));

      return sendJson(res, 200, { items });
    } catch (err) {
      console.error('Error listing temp summaries:', err);
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 3. GET SINGLE SUMMARY CONTENT
  if (pathname === '/api/get-temp-summary' && req.method === 'GET') {
    try {
      const filename = parsedUrl.query.file;
      if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return sendJson(res, 400, { error: 'Nama file tidak valid' });
      }

      const found = resolveSummaryFile(filename);
      if (!found) {
        return sendJson(res, 404, { error: 'File tidak ditemukan' });
      }

      return sendJson(res, 200, {
        filename: found.filename,
        content: found.content,
        title: found.title,
        model: found.model,
        path: found.path
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 4. DELETE SUMMARY FROM TEMP FOLDER
  if (pathname === '/api/delete-temp-summary' && req.method === 'DELETE') {
    try {
      const filename = parsedUrl.query.file;
      if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return sendJson(res, 400, { error: 'Nama file tidak valid' });
      }

      const base = filename.replace(/\.(md|json)$/, '');
      const mdPath = path.join(TEMP_SUMMARIES_DIR, `${base}.md`);
      const jsonPath = path.join(TEMP_SUMMARIES_DIR, `${base}.json`);

      if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath);
      if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);

      return sendJson(res, 200, { success: true, message: 'File temp berhasil dihapus' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 5. OPEN TEMP FOLDER IN WINDOWS EXPLORER
  if (pathname === '/api/open-temp-folder' && req.method === 'POST') {
    try {
      const data = await parseRequestBody(req).catch(() => ({}));
      const targetDir = data.target === 'session' ? TEMP_SESSION_DIR : TEMP_SUMMARY_DIR;
      const folderAbs = path.resolve(targetDir);
      launchWindowsExplorer(folderAbs);
      return sendJson(res, 200, { success: true, path: folderAbs });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 6. LOG GEMINI AUDIO REQUEST & ERROR
  const GEMINI_LOG_FILE = path.join(TEMP_DIR, 'gemini_audio.log');
  if (pathname === '/api/log-gemini-audio' && req.method === 'POST') {
    try {
      const data = await parseRequestBody(req);
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] [${data.status || 'INFO'}] Model: ${data.model || '-'} | Size: ${data.size || 0} bytes | Mime: ${data.mimeType || '-'} | Message: ${data.message || '-'}\n${data.details ? 'Details: ' + JSON.stringify(data.details, null, 2) + '\n' : ''}------------------------------------------------------------\n`;
      fs.appendFileSync(GEMINI_LOG_FILE, logEntry, 'utf-8');
      return sendJson(res, 200, { success: true });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 7. GET GEMINI AUDIO LOGS
  if (pathname === '/api/get-gemini-audio-logs' && req.method === 'GET') {
    try {
      if (!fs.existsSync(GEMINI_LOG_FILE)) {
        return sendJson(res, 200, { logs: 'Belum ada log aktivitas Gemini Audio.' });
      }
      const raw = fs.readFileSync(GEMINI_LOG_FILE, 'utf-8');
      const lines = raw.split('\n').slice(-150).join('\n'); // Last 150 lines
      return sendJson(res, 200, { logs: lines });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 8. SAVE AUDIO-IN TRANSCRIPT TO TEMP/AUDIO_IN FOLDER
  if (pathname === '/api/save-temp-audio-in' && req.method === 'POST') {
    try {
      const data = await parseRequestBody(req);
      const { model, title, content, speaker, timestamp, size } = data;

      const dateObj = timestamp ? new Date(timestamp) : new Date();
      const isoDate = dateObj.toISOString().replace(/[:.]/g, '-');
      const safeModel = (model || 'gemini').replace(/[^a-zA-Z0-9._-]/g, '_');
      const filenameBase = `AudioIn_${isoDate}_${safeModel}`;

      const mdContent = `---
type: audio-in
model: ${model || '-'}
speaker: ${speaker || 'Pembicara'}
createdAt: ${dateObj.toISOString()}
sizeBytes: ${size || 0}
---

# ${title || 'Transkripsi Audio-In'}

**Model AI:** \`${model || '-'}\`  
**Waktu:** ${dateObj.toLocaleString('id-ID')}  
**Pembicara:** ${speaker || 'Pembicara'}  

---

${content || ''}
`;

      const metaContent = JSON.stringify({
        id: filenameBase,
        title: title || 'Transkripsi Audio-In',
        type: 'audio-in',
        model: model || '-',
        speaker: speaker || 'Pembicara',
        createdAt: dateObj.toISOString(),
        filenameMd: `${filenameBase}.md`,
        filenameJson: `${filenameBase}.json`,
        sizeBytes: size || 0,
        excerpt: (content || '').slice(0, 160)
      }, null, 2);

      const mdPath = path.join(TEMP_AUDIO_IN_DIR, `${filenameBase}.md`);
      const jsonPath = path.join(TEMP_AUDIO_IN_DIR, `${filenameBase}.json`);

      fs.writeFileSync(mdPath, mdContent, 'utf-8');
      fs.writeFileSync(jsonPath, metaContent, 'utf-8');

      return sendJson(res, 200, {
        success: true,
        filename: `${filenameBase}.md`,
        path: mdPath
      });
    } catch (err) {
      console.error('Error saving temp audio-in:', err);
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 9. LIST ALL AUDIO-IN TRANSCRIPTS FROM TEMP/AUDIO_IN
  if (pathname === '/api/list-temp-audio-in' && req.method === 'GET') {
    try {
      if (!fs.existsSync(TEMP_AUDIO_IN_DIR)) {
        return sendJson(res, 200, { items: [] });
      }

      const files = fs.readdirSync(TEMP_AUDIO_IN_DIR);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      const items = [];
      for (const jFile of jsonFiles) {
        try {
          const fullPath = path.join(TEMP_AUDIO_IN_DIR, jFile);
          const stat = fs.statSync(fullPath);
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const parsed = JSON.parse(raw);
          parsed.mtime = stat.mtime;
          parsed.size = stat.size;
          items.push(parsed);
        } catch (e) {}
      }

      items.sort((a, b) => new Date(b.createdAt || b.mtime) - new Date(a.createdAt || a.mtime));
      return sendJson(res, 200, { items });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 10. GET SINGLE AUDIO-IN TRANSCRIPT CONTENT
  if (pathname === '/api/get-temp-audio-in' && req.method === 'GET') {
    try {
      const filename = parsedUrl.query.file;
      if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return sendJson(res, 400, { error: 'Nama file tidak valid' });
      }

      const found = resolveAudioInFile(filename);
      if (!found) {
        return sendJson(res, 404, { error: 'File tidak ditemukan' });
      }

      return sendJson(res, 200, {
        filename: found.filename,
        content: found.content,
        model: found.model,
        path: found.path
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 11. DELETE AUDIO-IN TRANSCRIPT
  if (pathname === '/api/delete-temp-audio-in' && req.method === 'DELETE') {
    try {
      const filename = parsedUrl.query.file;
      if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return sendJson(res, 400, { error: 'Nama file tidak valid' });
      }

      const base = filename.replace(/\.(md|json)$/, '');
      const mdPath = path.join(TEMP_AUDIO_IN_DIR, `${base}.md`);
      const jsonPath = path.join(TEMP_AUDIO_IN_DIR, `${base}.json`);

      if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath);
      if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);

      return sendJson(res, 200, { success: true, message: 'File audio-in temp berhasil dihapus' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 12. OPEN AUDIO-IN TEMP FOLDER IN WINDOWS EXPLORER
  if (pathname === '/api/open-temp-audio-in-folder' && req.method === 'POST') {
    try {
      const folderAbs = path.resolve(TEMP_AUDIO_IN_DIR);
      launchWindowsExplorer(folderAbs);
      return sendJson(res, 200, { success: true, path: folderAbs });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 13. SAVE RECORDED AUDIO FILE
  if (pathname === '/api/save-audio-recording' && req.method === 'POST') {
    try {
      const data = await parseRequestBody(req);
      const { audioBase64, filename, mimeType, duration, timestamp, size } = data;
      if (!audioBase64) {
        return sendJson(res, 400, { error: 'Data audioBase64 wajib disertakan' });
      }

      const dateObj = timestamp ? new Date(timestamp) : new Date();
      const safeFilename = filename ? filename.replace(/[^a-zA-Z0-9._-]/g, '_') : `Recording_${Date.now()}.webm`;
      const targetFilePath = path.join(TEMP_RECORDINGS_DIR, safeFilename);

      const buffer = Buffer.from(audioBase64, 'base64');
      fs.writeFileSync(targetFilePath, buffer);

      // Save companion metadata json
      const metaPath = targetFilePath.replace(/\.[^/.]+$/, '') + '.json';
      fs.writeFileSync(metaPath, JSON.stringify({
        filename: safeFilename,
        mimeType: mimeType || 'audio/webm',
        duration: duration || '00:00',
        sizeBytes: buffer.length,
        createdAt: dateObj.toISOString(),
        filePath: targetFilePath
      }, null, 2), 'utf-8');

      return sendJson(res, 200, {
        success: true,
        filename: safeFilename,
        path: targetFilePath,
        size: buffer.length
      });
    } catch (err) {
      console.error('Error saving audio recording:', err);
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 14. LIST SAVED AUDIO RECORDINGS
  if (pathname === '/api/list-audio-recordings' && req.method === 'GET') {
    try {
      if (!fs.existsSync(TEMP_RECORDINGS_DIR)) {
        return sendJson(res, 200, { recordings: [] });
      }
      const files = fs.readdirSync(TEMP_RECORDINGS_DIR);
      const recordings = [];

      for (const f of files) {
        if (f.endsWith('.json')) {
          try {
            const raw = fs.readFileSync(path.join(TEMP_RECORDINGS_DIR, f), 'utf-8');
            recordings.push(JSON.parse(raw));
          } catch (e) {}
        }
      }

      recordings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return sendJson(res, 200, { recordings });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 15. OPEN RECORDINGS FOLDER IN WINDOWS EXPLORER
  if (pathname === '/api/open-recordings-folder' && req.method === 'POST') {
    try {
      const folderAbs = path.resolve(TEMP_RECORDINGS_DIR);
      launchWindowsExplorer(folderAbs);
      return sendJson(res, 200, { success: true, path: folderAbs });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 16. AUTO-DETECT OMNI ROUTER API KEY FROM ~/.omniroute/
  if (pathname === '/api/get-omni-key' && req.method === 'GET') {
    try {
      const homeDir = process.env.USERPROFILE || process.env.HOME || '';
      const omniKeyPath = path.join(homeDir, '.omniroute', 'omniroute-api-key.txt');
      if (fs.existsSync(omniKeyPath)) {
        const key = fs.readFileSync(omniKeyPath, 'utf-8').trim();
        return sendJson(res, 200, {
          success: true,
          apiKey: key,
          baseUrl: 'http://localhost:20128/v1',
          foundAt: omniKeyPath
        });
      }
      return sendJson(res, 200, {
        success: false,
        apiKey: 'sk-6451587ff6bf1027-49ae58-4ce955ac',
        baseUrl: 'http://localhost:20128/v1',
        message: 'File omniroute-api-key.txt tidak ditemukan, gunakan default.'
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 17. TEST OMNI ROUTER CONNECTION
  if (pathname === '/api/test-omni-router' && req.method === 'POST') {
    try {
      const data = await parseRequestBody(req);
      const baseUrl = (data.baseUrl || 'http://localhost:20128/v1').replace(/\/+$/, '');
      const apiKey = data.apiKey || 'sk-6451587ff6bf1027-49ae58-4ce955ac';
      const model = data.model || 'combo-gratis';

      const startTime = Date.now();
      const testRes = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'user', content: 'Ping singkat' }
          ],
          max_tokens: 20
        }),
        signal: AbortSignal.timeout(8000)
      });

      const latencyMs = Date.now() - startTime;
      if (!testRes.ok) {
        const errBody = await testRes.text().catch(() => '');
        return sendJson(res, testRes.status, {
          success: false,
          status: testRes.status,
          latencyMs,
          error: `HTTP ${testRes.status}: ${errBody.slice(0, 200)}`
        });
      }

      const json = await testRes.json();
      const reply = json.choices?.[0]?.message?.content || 'OK';
      return sendJson(res, 200, {
        success: true,
        latencyMs,
        model,
        reply
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Security check: prevent escaping public directory
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`LiveVoice AI Server running at http://localhost:${PORT}`);
  console.log(`Temp summaries directory: ${TEMP_SUMMARIES_DIR}`);
});
