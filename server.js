const express = require("express");
const cors = require('cors');
const path = require("path");
const http = require('http');

// Import handlers
const SerialHandler = require('./src/handlers/serial-handler');
const VideoHandler = require('./src/handlers/video-handler');
const WebSocketHandler = require('./src/handlers/websocket-handler');

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
  const timestamp = new Date().toISOString();
  // Only log non-GET requests to /api/scroll-metrics
  if (req.method !== 'GET' && req.path === '/api/scroll-metrics') {
    console.log(`[${timestamp}] Received ${req.method} request to ${req.path}`);
  }
  next();
});

// Initialize handlers
const videoHandler = new VideoHandler();
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

// Store the latest metrics
let latestMetrics = {
  direction: 'nothing',
  currentSpeed: 0,    // Containers per second (0-255)
  averageSpeed: 0,    // Rolling 5-second average
  speedHistory: [],   // For calculating rolling average
  containerMetrics: {
    containerIndex: -1,
    timeSpentInContainer: 0
  }
};

// Scroll metrics endpoints
app.get('/api/scroll-metrics', (req, res) => {
  res.json(latestMetrics);
});

// POST endpoint for scroll metrics
app.post('/api/scroll-metrics', (req, res) => {
  const timestamp = new Date().toISOString();
  const metrics = req.body;
  
  // Log received metrics
  console.log(`[${timestamp}] Received metrics:`, {
    scrollPosition: metrics.scrollPosition,
    direction: metrics.direction,
    currentSpeed: metrics.currentSpeed,
    containerIndex: metrics.containerIndex,
    totalContainers: metrics.totalContainers
  });

  // Update latest metrics
  latestMetrics = {
    ...metrics,
    timestamp: Date.now()
  };

  // Transform data for ESP32
  const transformedData = {
    deviceId: 0,
    angle: Math.round(metrics.scrollPosition),
    direction: metrics.direction,
    speed: Math.round(metrics.currentSpeed),
    interval: 1000,
    delay_offset: 0
  };

  // Send to ESP32 without logging
  communicationHandler.sendScrollData(transformedData)
    .catch(error => {
      console.error(`[${timestamp}] Error sending scroll data:`, error.message);
    });

  res.json({ success: true });
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


// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
  console.log(`Communication mode with ESP32: ${CONFIG.useWebSocket ? 'WebSocket' : 'Serial'}`);
  console.log(`Debug panel available at: http://localhost:${PORT}/scroll-speeds`);
  
  if (CONFIG.useWebSocket) {
    console.log(`ESP32 WebSocket endpoint: ws://localhost:${PORT}/esp32`);
    console.log('Drop-in debug panel: Include esp32-debug-panel.js in your HTML');
  } else {
    console.log(`Serial port: ${CONFIG.serialPort} at ${CONFIG.baudRate} baud`);
  }
});
