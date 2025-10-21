// server.js
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();

// --- Constants ---
const SECRET_KEY = "supersecretkey";
const DATA_FILE = path.join(__dirname, 'data.json');
const FRONTEND_DIR = path.join(__dirname, 'myApp/www');
const UPLOAD_DIR = path.join(FRONTEND_DIR, 'uploads');

// Ensure uploads folder exists
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// --- CORS Setup ---
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // mobile apps / Postman
    const allowedOrigins = [
      "https://kabalen.onrender.com",
      "https://kabalen-backend1.onrender.com",
      "http://localhost",
      "http://localhost:3000",
      "file://"
    ];
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// Handle preflight OPTIONS requests
app.options('*', cors());

// --- Middleware ---
app.use(bodyParser.json());

// Serve static frontend files
app.use(express.static(FRONTEND_DIR));

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// --- Multer setup ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueName = `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// --- Load / Save Data ---
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      riders: [], orders: [], clients: [], nextRiderId: 1, nextOrderId: 1, nextClientId: 1
    }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- Auth Middleware ---
function auth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ message: 'Missing token' });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Missing token' });
  try {
    req.user = jwt.verify(token, SECRET_KEY);
    next();
  } catch (err) {
    res.status(403).json({ message: 'Invalid token' });
  }
}

// --- Routes ---
// Test API
app.get('/api', (req, res) => res.send('Kabalen Backend API is running ✅'));

// Admin login
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === '123') {
    const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '12h' });
    return res.json({ token });
  }
  res.status(401).json({ message: 'Invalid credentials' });
});

// Client registration
app.post('/clients/register', upload.fields([{ name: 'validId' }, { name: 'selfie' }]), (req, res) => {
  const { fullname, address, phone, username, password } = req.body;
  const validIdFile = req.files['validId'] ? req.files['validId'][0].filename : null;
  const selfieFile = req.files['selfie'] ? req.files['selfie'][0].filename : null;

  if (!fullname || !address || !phone || !username || !password || !validIdFile || !selfieFile) {
    return res.status(400).json({ message: 'All fields including files are required' });
  }

  const data = loadData();
  if (data.clients.find(c => c.username === username)) {
    return res.status(400).json({ message: 'Username already taken' });
  }

  const newClient = {
    id: data.nextClientId++,
    fullname,
    address,
    phone,
    username,
    password,
    validId: validIdFile,
    selfie: selfieFile
  };

  data.clients.push(newClient);
  saveData(data);
  res.json({ message: 'Registration successful', client: newClient });
});

// Client login
app.post('/clients/login', (req, res) => {
  const { username, password } = req.body;
  const data = loadData();
  const client = data.clients.find(c => c.username === username && c.password === password);
  if (!client) return res.status(401).json({ message: 'Invalid username or password' });

  const token = jwt.sign({ clientId: client.id }, SECRET_KEY, { expiresIn: '12h' });
  res.json({ token, client });
});

// Client orders
app.post('/clients/orders', auth, (req, res) => {
  const { pickup, dropoff, distance, fee, type, notes } = req.body;
  const clientId = req.user.clientId;
  const data = loadData();

  if (!pickup || !dropoff) return res.status(400).json({ message: 'Pickup and dropoff required' });

  const newOrder = {
    id: data.nextOrderId++,
    client_id: clientId,
    pickup,
    dropoff,
    distance: distance || 0,
    fee: fee || 0,
    type: type || 'general',
    notes: notes || '',
    status: 'Pending',
    rider_id: null,
    pickup_image: null,
    dropoff_image: null
  };

  data.orders.push(newOrder);
  saveData(data);

  res.json({ message: 'Order placed', order: newOrder });
});

app.get('/clients/orders', auth, (req, res) => {
  const clientId = req.user.clientId;
  const data = loadData();
  const clientOrders = data.orders.filter(o => o.client_id === clientId);
  res.json(clientOrders);
});

// --- Start server ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => console.log(`✅ Server running on port ${PORT}`));
