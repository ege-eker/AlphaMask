import express, { Request, Response } from 'express';
import multer from 'multer';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import mime from "mime-types";
import cors from "cors";

const app = express();
const upload = multer({ dest: '/shared/tmp/' });
const redisUrl = process.env.REDIS_URL || "redis://background-redis-service:6379";
const PORT = process.env.PORT || 3000;
const redis = new Redis(redisUrl);
app.use(cors());

app.post('/api/process', upload.single('media'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file' });
    return;
  }

  const inputPath = path.resolve(req.file.path);

  let detected = req.file.mimetype;
  if (!detected || detected === 'application/octet-stream') {
    detected = mime.lookup(inputPath) || 'application/octet-stream';
  }

  const ext = path.extname(inputPath).toLowerCase();
  if (ext === '.mp4' || ext === '.mov' || ext === '.mkv') detected = 'video/mp4';
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') detected = 'image/png';

  console.log(`UPLOAD type: ${detected}  path: ${inputPath}`);

  const jobId = randomUUID();
  await redis.hset(`job:${jobId}`, { status: 'queued', type: detected });

  const payload = JSON.stringify({ jobId, inputPath, mime: detected });
  await redis.lpush('job_queue', payload);

  res.status(202).json({ id: jobId });
});


app.get('/api/status/:id', async (req, res) => {
  const data = await redis.hgetall(`job:${req.params.id}`);
  res.json(data || { status: 'not_found' });
});

app.get("/api/result/:id", (req, res) => {
  const base = path.resolve(`/shared/tmp/${req.params.id}_processed`);
  const pngPath = `${base}.png`;
  const mp4Path = `${base}.mp4`;

  let filePath: string | null = null;
  if (fs.existsSync(pngPath)) filePath = pngPath;
  else if (fs.existsSync(mp4Path)) filePath = mp4Path;
  if (!filePath) {
    res.status(404).json({ error: "Not Found" });
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const mimeType = mime.lookup(filePath) || "application/octet-stream";

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  if (req.query.download) {
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${path.basename(filePath)}"`
    );
  }

  const range = req.headers.range;
  if (range && !req.query.download) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": mimeType,
    });
    stream.pipe(res);
    return;
  }

  res.writeHead(200, {
    "Content-Length": fileSize,
    "Content-Type": mimeType,
  });
  fs.createReadStream(filePath).pipe(res);
});

app.listen(PORT, () => console.log('✅ Backend port ' + PORT));