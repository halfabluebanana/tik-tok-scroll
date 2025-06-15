const express = require("express");
const cors = require('cors');
const path = require("path");
const http = require('http');

// Import handlers
const SerialHandler = require('./src/handlers/serial-handler');
const VideoHandler = require('./src/handlers/video-handler');
const WebSocketHandler = require('./src/handlers/websocket-handler');
const ScrollHandler = require('./src/handlers/scroll-handler');

const PORT = process.env.PORT || 3001;

// Configuration - Switch between serial and WebSocket modes
const CONFIG = {
  useWebSocket: false,  // Set to false to use serial communication
  serialPort: '/dev/tty.wchusbserial110',
  baudRate: 9600
};

const app = express();
const server = http.createServer(app);

// Enable CORS with specific options
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Range']
}));

// Parse JSON bodies
app.use(express.json());

// Middleware to log requests
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.path === '/api/scroll-metrics') {
    console.log(`\nReceived ${req.method} request to ${req.path}`);
  }
  next();
});

// Initialize handlers
const videoHandler = new VideoHandler();
const scrollHandler = new ScrollHandler();
let communicationHandler;

if (CONFIG.useWebSocket) {
  console.log('Initializing WebSocket handler...');
  communicationHandler = new WebSocketHandler(server);
} else {
  console.log('Initializing Serial handler...');
  communicationHandler = new SerialHandler(CONFIG.serialPort, CONFIG.baudRate);
}

// Video upload endpoint
app.post('/upload-video', videoHandler.getUploadMiddleware(), (req, res) => {
  videoHandler.handleUpload(req, res);
});

// API endpoint for videos
app.get("/api", (req, res) => {
  try {
    console.log("GETTING VIDEOSSSSSSSSSSS --- server.js")
    const videos = videoHandler.getVideosWithMetadata();
    res.json({ videos });
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({ error: 'Error fetching videos' });
  }
});

// Serve static files
app.use(express.static(path.resolve(__dirname, './client/build')));

// Serve uploads with CORS headers
app.use('/uploads/', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Range');
  next();
}, express.static(path.resolve(__dirname, './uploads')));

// GET endpoint for scroll metrics
app.get('/api/scroll-metrics', (req, res) => {
  res.json(scrollHandler.getLatestMetrics());
});

// POST endpoint for scroll metrics
app.post('/api/scroll-metrics', (req, res) => {
  const metrics = req.body;
  console.log('\nReceived metrics:', {
    scrollPosition: metrics.scrollPosition,
    direction: metrics.direction,
    currentSpeed: metrics.currentSpeed,
    containerIndex: metrics.containerIndex,
    totalContainers: metrics.totalContainers
  });

  // Update metrics using the scroll handler
  const updatedMetrics = scrollHandler.updateMetrics(metrics);

  // Transform metrics for ESP32
  const esp32Data = {
    type: 'scroll_data',
    deviceId: 0,
    angle: updatedMetrics.scrollPosition || 0,
    direction: updatedMetrics.direction === 'down' ? 1 : 0,
    speed: updatedMetrics.currentSpeed || 0,
    interval: 1000
  };

  console.log('\nSending to ESP32:', esp32Data);

  // Send to ESP32
  if (communicationHandler && communicationHandler.serialPort && communicationHandler.serialPort.isOpen) {
    communicationHandler.sendScrollData(esp32Data)
      .then(() => {
        res.json({ success: true });
      })
      .catch(error => {
        console.error('\nError sending scroll data:', error.message);
        res.status(500).json({ error: 'Error sending scroll data' });
      });
  } else {
    console.error('\nCommunication handler not available');
    res.status(500).json({ error: 'Communication handler not available' });
  }
});

app.get("/", (req, res) => {
  console.log('\\n=== GET /scroll-speeds ===');
  console.log('Serving scrolly page');
  res.sendFile(path.resolve(__dirname, './static/index.html'));
})

// Serve the scroll speeds interface
app.get('/scroll-speeds', (req, res) => {
  console.log('\\n=== GET /scroll-speeds ===');
  console.log('Serving scroll-speeds page');
  res.sendFile(path.resolve(__dirname, './static/scroll-speeds.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

// Catch-all route for React app
app.get('*', (req, res) => {
  console.log('\n=== Catch-all route ===');
  console.log('Requested URL:', req.url);
  res.sendFile(path.resolve(__dirname, './client/build/index.html'));
});

// Serial port event handlers
if (communicationHandler && communicationHandler.serialPort) {
  const serialPort = communicationHandler.serialPort;
  // Commented out noisy ESP32 logs
  // serialPort.on('data', (data) => {
  //   const message = data.toString().trim();
  //   console.log('\nReceived from ESP32:', message);
  // });

  serialPort.on('error', (err) => {
    console.error('\nSerial port error:', err.message);
  });

  serialPort.on('close', () => {
    console.log('\nSerial port closed');
  });
}

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log('\nServer started:');
  console.log(`- Listening on http://0.0.0.0:${PORT}`);
  console.log(`- Debug panel: http://localhost:${PORT}/scroll-speeds`);
  console.log(`- Communication mode: ${CONFIG.useWebSocket ? 'WebSocket' : 'Serial'}`);
  if (!CONFIG.useWebSocket) {
    console.log(`- Serial port: ${CONFIG.serialPort} at ${CONFIG.baudRate} baud`);
  }
});