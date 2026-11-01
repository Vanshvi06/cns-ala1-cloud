// CNS ALA 1 - Cloud Task Manager
// Compute: AWS EC2 (this Node.js server)   Storage: Amazon S3 (files) + EBS disk (tasks.json)
const express = require('express');
const multer = require('multer');
const os = require('os');
const fs = require('fs');
const path = require('path');
const {
  S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const PORT = process.env.PORT || 3000;
const BUCKET = process.env.S3_BUCKET || '';
const REGION = process.env.AWS_REGION || 'ap-south-1';

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'tasks.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadTasks() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { return []; }
}
function saveTasks(t) { fs.writeFileSync(DATA_FILE, JSON.stringify(t, null, 2)); }

const s3 = BUCKET ? new S3Client({ region: REGION }) : null; // credentials come from the EC2 IAM role
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- Tasks (stored on the EC2 disk) ---------- */
app.get('/api/tasks', (req, res) => res.json(loadTasks()));

app.post('/api/tasks', (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 120);
  const prio = ['High', 'Medium', 'Low'].includes(req.body.prio) ? req.body.prio : 'Medium';
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const tasks = loadTasks();
  const task = { id: Date.now(), title, prio, done: false };
  tasks.unshift(task);
  saveTasks(tasks);
  res.status(201).json(task);
});

app.patch('/api/tasks/:id', (req, res) => {
  const tasks = loadTasks();
  const t = tasks.find(x => String(x.id) === req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  t.done = !!req.body.done;
  saveTasks(tasks);
  res.json(t);
});

app.delete('/api/tasks/:id', (req, res) => {
  saveTasks(loadTasks().filter(x => String(x.id) !== req.params.id));
  res.json({ ok: true });
});

app.delete('/api/tasks', (req, res) => { saveTasks([]); res.json({ ok: true }); });

/* ---------- Files (stored in Amazon S3) ---------- */
function needS3(res) {
  res.status(503).json({ error: 'S3 is not configured. Start the server with S3_BUCKET set.' });
}

app.get('/api/files', async (req, res) => {
  if (!s3) return needS3(res);
  try {
    const out = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'uploads/' }));
    const files = await Promise.all((out.Contents || []).map(async o => ({
      key: o.Key,
      name: o.Key.replace('uploads/', '').replace(/^\d+-/, ''),
      size: o.Size,
      modified: o.LastModified,
      url: await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: o.Key }), { expiresIn: 300 }),
    })));
    res.json(files);
  } catch (e) { res.status(500).json({ error: e.name + ': ' + e.message }); }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!s3) return needS3(res);
  if (!req.file) return res.status(400).json({ error: 'No file selected' });
  const safe = req.file.originalname.replace(/[^\w.\-]/g, '_');
  const key = `uploads/${Date.now()}-${safe}`;
  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype,
    }));
    res.status(201).json({ ok: true, key });
  } catch (e) { res.status(500).json({ error: e.name + ': ' + e.message }); }
});

app.delete('/api/files', async (req, res) => {
  if (!s3) return needS3(res);
  const key = String(req.query.key || '');
  if (!key.startsWith('uploads/')) return res.status(400).json({ error: 'Bad key' });
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.name + ': ' + e.message }); }
});

/* ---------- Resource management / deployment info ---------- */
app.get('/api/stats', (req, res) => {
  const cores = os.cpus().length;
  const load1 = os.loadavg()[0];
  const total = os.totalmem();
  const free = os.freemem();
  let disk = null;
  try {
    const s = fs.statfsSync('/');
    const t = s.blocks * s.bsize, f = s.bavail * s.bsize;
    disk = { total: t, used: t - f, free: f };
  } catch (e) { /* older Node */ }
  const tasks = loadTasks();
  res.json({
    cpu: { cores, load1: +load1.toFixed(2), percent: +Math.min(100, (load1 / cores) * 100).toFixed(1) },
    memory: { total, used: total - free, free, percent: +(((total - free) / total) * 100).toFixed(1) },
    disk,
    uptime: { serverSec: Math.floor(os.uptime()), appSec: Math.floor(process.uptime()) },
    tasks: { total: tasks.length, done: tasks.filter(t => t.done).length },
    time: new Date().toISOString(),
  });
});

app.get('/api/info', (req, res) => {
  res.json({
    platform: 'Amazon Web Services (AWS)',
    compute: 'Amazon EC2 virtual machine (Ubuntu, Node.js + Nginx)',
    storage: BUCKET ? `Amazon S3 bucket "${BUCKET}" + EBS disk` : 'EBS disk only (S3 not configured)',
    region: REGION,
    hostname: os.hostname(),
    os: `${os.type()} ${os.release()} (${os.arch()})`,
    node: process.version,
    s3Enabled: !!s3,
  });
});

app.get('/health', (req, res) => res.send('OK'));

app.listen(PORT, () => console.log(`ALA 1 app running on port ${PORT} (S3: ${BUCKET || 'not configured'})`));
