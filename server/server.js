const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { imageSize } = require('image-size');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const app = express();
const PORT = 3847;
const HOST = '0.0.0.0';
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Enable CORS for all routes (for mobile upload & Figma plugin integration)
app.use(cors());
app.use(express.json());

// Serve static frontend assets from public directory
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

// Memory & Cache Optimization: Disable caching on dynamic API routes so mobile devices do not retain stale files in RAM
app.use((req, res, next) => {
  if (req.path.startsWith('/screenshots') || req.path.startsWith('/upload')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});



// Helper: Detect LAN IPv4 Address
function getLocalIPv4Address() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4;
      if (net.family === familyV4Value && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// Helper: Validate extension & mime type
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/x-png',
  'image/webp'
]);

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function getSafeExtension(originalName, mimeType) {
  let ext = path.extname(originalName || '').toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext)) {
    return ext === '.jpeg' ? '.jpg' : ext;
  }
  // Infer from MIME type if extension is missing or unusual
  if (mimeType === 'image/png' || mimeType === 'image/x-png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg' || mimeType === 'image/pjpeg') return '.jpg';
  return '.png';
}

// Multer storage & configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const suffix = crypto.randomBytes(2).toString('hex'); // 4 hex characters
    const ext = getSafeExtension(file.originalname, file.mimetype);
    cb(null, `${timestamp}-${suffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const isMimeValid = ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase());
  const isExtValid = ext ? ALLOWED_EXTENSIONS.has(ext) : true;

  if (isMimeValid && isExtValid) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PNG, JPG, JPEG, and WEBP images are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB max per file
    files: 30 // Allow up to 30 files per batch upload
  }
});

// Helper: Safely resolve filename inside uploads directory
function getSafeFilePath(filename) {
  if (!filename || typeof filename !== 'string') return null;
  const sanitized = path.basename(filename);
  if (sanitized !== filename || sanitized.includes('..')) {
    return null;
  }
  const resolvedPath = path.resolve(UPLOADS_DIR, sanitized);
  if (!resolvedPath.startsWith(path.resolve(UPLOADS_DIR))) {
    return null;
  }
  return resolvedPath;
}

// Helper: Get image dimensions safely
function getImageDimensions(filePath) {
  try {
    const dimensions = imageSize(filePath);
    return {
      width: dimensions.width || null,
      height: dimensions.height || null
    };
  } catch (err) {
    console.error(`[Droppy] Failed to read dimensions for ${filePath}:`, err.message);
    return { width: null, height: null };
  }
}

// Helper: Parse screenshot metadata from file
function getScreenshotMetadata(filename) {
  const filePath = path.join(UPLOADS_DIR, filename);
  const ext = path.extname(filename);
  const id = path.basename(filename, ext);

  let createdAt = null;
  const match = id.match(/^(\d+)-/);
  if (match) {
    createdAt = parseInt(match[1], 10);
  } else {
    try {
      const stats = fs.statSync(filePath);
      createdAt = Math.round(stats.birthtimeMs || stats.mtimeMs);
    } catch {
      createdAt = Date.now();
    }
  }

  const { width, height } = getImageDimensions(filePath);

  return {
    id,
    filename,
    url: `/screenshots/${filename}`,
    createdAt,
    width,
    height
  };
}

// ---------------------- ROUTES ----------------------

// POST /upload - Upload single or multiple screenshots
app.post('/upload', (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'File too large. Maximum allowed size is 20MB per file.' });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({ error: 'Too many files uploaded. Maximum 30 files per upload.' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      return res.status(400).json({ error: err.message || 'Failed to upload image.' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No image file uploaded. Please attach an image file.' });
    }

    const uploadedMetas = req.files.map((file) => {
      const metadata = getScreenshotMetadata(file.filename);
      console.log(`[Droppy] Uploaded: ${file.filename} (${metadata.width}x${metadata.height})`);
      return metadata;
    });

    if (uploadedMetas.length === 1) {
      return res.status(201).json(uploadedMetas[0]);
    }

    return res.status(201).json({
      success: true,
      count: uploadedMetas.length,
      files: uploadedMetas
    });
  });
});


// GET /screenshots - Return JSON array of all screenshots, newest first
app.get('/screenshots', (req, res) => {
  fs.readdir(UPLOADS_DIR, (err, files) => {
    if (err) {
      console.error('[Droppy] Failed to read uploads directory:', err);
      return res.status(500).json({ error: 'Failed to retrieve screenshots.' });
    }

    const screenshots = [];

    for (const file of files) {
      // Skip hidden files
      if (file.startsWith('.')) continue;

      const ext = path.extname(file).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext) && ext !== '.jpeg') continue;

      try {
        const meta = getScreenshotMetadata(file);
        screenshots.push(meta);
      } catch (e) {
        console.error(`[Droppy] Error processing file ${file}:`, e.message);
      }
    }

    // Sort newest first
    screenshots.sort((a, b) => b.createdAt - a.createdAt);

    return res.json(screenshots);
  });
});

// GET /screenshots/:filename - Serve the screenshot image file
app.get('/screenshots/:filename', (req, res) => {
  const filePath = getSafeFilePath(req.params.filename);

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Screenshot not found.' });
  }

  return res.sendFile(filePath);
});

// DELETE /screenshots/:filename - Delete a single screenshot
app.delete('/screenshots/:filename', (req, res) => {
  const filePath = getSafeFilePath(req.params.filename);

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Screenshot not found.' });
  }

  try {
    fs.unlinkSync(filePath);
    console.log(`[Droppy] Deleted screenshot: ${req.params.filename}`);
    return res.json({
      success: true,
      message: 'Screenshot deleted successfully.',
      filename: req.params.filename
    });
  } catch (err) {
    console.error(`[Droppy] Failed to delete file ${req.params.filename}:`, err);
    return res.status(500).json({ error: 'Failed to delete screenshot.' });
  }
});

// DELETE /screenshots - Delete all screenshots
app.delete('/screenshots', (req, res) => {
  fs.readdir(UPLOADS_DIR, (err, files) => {
    if (err) {
      console.error('[Droppy] Failed to read uploads directory for clearing:', err);
      return res.status(500).json({ error: 'Failed to clear screenshots.' });
    }

    let deletedCount = 0;
    const errors = [];

    for (const file of files) {
      if (file.startsWith('.')) continue;
      const filePath = path.join(UPLOADS_DIR, file);
      try {
        fs.unlinkSync(filePath);
        deletedCount++;
      } catch (unlinkErr) {
        console.error(`[Droppy] Error deleting ${file}:`, unlinkErr.message);
        errors.push(file);
      }
    }

    console.log(`[Droppy] Cleared ${deletedCount} screenshot(s) from inbox.`);
    return res.json({
      success: true,
      message: `Cleared ${deletedCount} screenshot(s).`,
      deletedCount,
      failedCount: errors.length
    });
  });
});

// Fallback 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// Global error handler (prevent stack traces leaking to client)
app.use((err, req, res, next) => {
  console.error('[Droppy] Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// Start listening on 0.0.0.0:3847
app.listen(PORT, HOST, () => {
  const lanIp = getLocalIPv4Address();
  console.log('='.repeat(50));
  console.log('  DROPPY SCREENSHOT INBOX SERVER');
  console.log('='.repeat(50));
  console.log(`Server listening on http://${HOST}:${PORT}`);
  console.log(`Mobile upload address: http://${lanIp}:${PORT}`);
  console.log('='.repeat(50));
});
