require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const Replicate = require('replicate');

const app = express();
const port = Number(process.env.PORT || 4000);
const maxFileSize = 10 * 1024 * 1024;
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const generatedImagesDir = path.join(__dirname, 'images', 'generated');
const logsDir = path.join(__dirname, 'logs');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSize, files: 2 },
  fileFilter: (_request, file, callback) => {
    callback(null, allowedMimeTypes.has(file.mimetype));
  },
});

app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: '1mb' }));

// Keep the activity logs out of the public static file server (they can contain visitor names/emails).
app.use((request, response, next) => {
  if (request.path === '/logs' || request.path.startsWith('/logs/')) return response.status(404).end();
  next();
});

app.use(express.static(__dirname));

function sanitizeForFilename(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

app.post('/api/log-event', async (request, response) => {
  const { visitorId, name, email, event, details, page } = request.body || {};

  if (!visitorId || typeof visitorId !== 'string' || !event || typeof event !== 'string') {
    return response.status(400).json({ error: 'visitorId and event are required.' });
  }

  const safeVisitorId = sanitizeForFilename(visitorId) || 'unknown';
  const safeName = sanitizeForFilename(name) || 'guest';
  const fileName = `${safeName}-${safeVisitorId.slice(0, 8)}.log`;

  const entry = {
    timestamp: new Date().toISOString(),
    event: String(event).slice(0, 80),
    name: typeof name === 'string' ? name.slice(0, 120) : undefined,
    email: typeof email === 'string' ? email.slice(0, 160) : undefined,
    page: typeof page === 'string' ? page.slice(0, 300) : undefined,
    details: details && typeof details === 'object' ? details : undefined,
  };

  try {
    await fs.mkdir(logsDir, { recursive: true });
    await fs.appendFile(path.join(logsDir, fileName), `${JSON.stringify(entry)}\n`, 'utf8');
    return response.json({ ok: true });
  } catch (error) {
    console.error('Failed to write activity log:', error.message);
    return response.status(500).json({ error: 'Could not save log entry.' });
  }
});


function fileToDataUrl(file) {
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

function normalizeOutput(output) {
  const firstOutput = Array.isArray(output) ? output[0] : output;

  if (typeof firstOutput === 'string') return firstOutput;
  if (firstOutput && typeof firstOutput.url === 'function') return String(firstOutput.url());
  if (firstOutput && firstOutput.url) return String(firstOutput.url);

  return null;
}

async function saveGeneratedImage(remoteImageUrl, request) {
  const imageResponse = await fetch(remoteImageUrl);
  if (!imageResponse.ok) throw new Error('Could not download the generated image.');

  const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
  const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const fileName = `baby-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extension}`;

  await fs.mkdir(generatedImagesDir, { recursive: true });
  const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
  await fs.writeFile(path.join(generatedImagesDir, fileName), imageBytes);

  return `${request.protocol}://${request.get('host')}/images/generated/${fileName}`;
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, configured: Boolean(process.env.REPLICATE_API_TOKEN && process.env.REPLICATE_MODEL) });
});

app.post('/api/generate-baby', upload.fields([
  { name: 'parentPhotoOne', maxCount: 1 },
  { name: 'parentPhotoTwo', maxCount: 1 },
]), async (request, response) => {
  const validModes = new Set(['baby', 'text', 'pregnancy', 'family']);
  const generationMode = validModes.has(request.body.generationMode) ? request.body.generationMode : 'baby';
  const usesPhotos = generationMode !== 'text';

  const firstPhoto = request.files?.parentPhotoOne?.[0];
  const secondPhoto = request.files?.parentPhotoTwo?.[0];

  if (usesPhotos && (!firstPhoto || !secondPhoto)) {
    return response.status(400).json({ error: 'Two photos are required.' });
  }

  const description = (request.body.babyDescription || '').trim();
  if (!usesPhotos && !description) {
    return response.status(400).json({ error: 'A description is required.' });
  }

  if (!process.env.REPLICATE_API_TOKEN || !process.env.REPLICATE_MODEL) {
    return response.status(503).json({ error: 'Replicate is not configured yet.' });
  }

  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  const firstImageField = process.env.REPLICATE_FIRST_IMAGE_FIELD || 'image';
  const secondImageField = process.env.REPLICATE_SECOND_IMAGE_FIELD || 'image2';
  const prompts = {
    baby: process.env.REPLICATE_PROMPT || 'Create a warm, realistic baby portrait inspired by the two reference photos. Show one happy, healthy baby in a soft natural setting.',
    text: process.env.REPLICATE_TEXT_PROMPT_PREFIX || 'Create a warm, realistic, professional baby portrait photograph of: ',
    pregnancy: process.env.REPLICATE_PREGNANCY_PROMPT || 'Create a warm, realistic maternity photography scene inspired by the two reference photos. Show the couple during a pregnancy photoshoot, softly touching the pregnant belly, soft natural light, professional maternity photography.',
    family: process.env.REPLICATE_FAMILY_PROMPT || 'Create a warm, realistic family photography scene inspired by the two reference photos. Show the same couple joyfully holding their newborn baby together, soft natural light, professional family photography.',
  };
  const prompt = generationMode === 'text' ? `${prompts.text}${description}` : prompts[generationMode];

  try {
    const model = generationMode === 'text' && process.env.REPLICATE_TEXT_MODEL
      ? process.env.REPLICATE_TEXT_MODEL
      : process.env.REPLICATE_MODEL;

    let input = { prompt };
    if (usesPhotos) {
      const firstImage = fileToDataUrl(firstPhoto);
      const secondImage = fileToDataUrl(secondPhoto);
      input = process.env.REPLICATE_IMAGE_INPUT_MODE === 'array'
        ? { [firstImageField]: [firstImage, secondImage], prompt }
        : { [firstImageField]: firstImage, [secondImageField]: secondImage, prompt };
    }

    const output = await replicate.run(model, { input });

    const remoteImageUrl = normalizeOutput(output);
    if (!remoteImageUrl) return response.status(502).json({ error: 'Replicate returned no image.' });

    const savedImageUrl = await saveGeneratedImage(remoteImageUrl, request);
    return response.json({ imageUrl: savedImageUrl });
  } catch (error) {
    console.error('Replicate generation failed:', error.message);
    return response.status(502).json({ error: 'Image generation failed.' });
  }
});

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return response.status(413).json({ error: 'Each image must be 10 MB or smaller.' });
  }

  if (error instanceof multer.MulterError || error.message === 'Unexpected field') {
    return response.status(400).json({ error: 'Upload two JPG, PNG, or WebP images.' });
  }

  return response.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(port, () => {
  console.log(`FutureBaby server running at http://localhost:${port}`);
});