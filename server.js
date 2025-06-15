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

// Add logging middleware
app.use((req, res, next) => {
  // Only log non-GET /api/scroll-metrics requests
  if (!(req.method === 'GET' && req.url === '/api/scroll-metrics')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
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
  containerMetrics: {
    containerIndex: -1,
    timeSpentInContainer: 0
  }
};

// Scroll metrics endpoints
app.get('/api/scroll-metrics', (req, res) => {
  res.json(latestMetrics);
});

app.post('/api/scroll-metrics', (req, res) => {
  const timestamp = new Date().toISOString();
  const metrics = req.body;
  
  console.log(`[${timestamp}] Received scroll metrics:`, {
    direction: metrics.direction,
    containerMetrics: metrics.containerMetrics
  });

  // Update latest metrics
  latestMetrics = {
    direction: metrics.direction,
    containerMetrics: {
      containerIndex: metrics.containerMetrics.containerIndex,
      timeSpentInContainer: metrics.containerMetrics.timeSpentInContainer
    }
  };

  // Transform and send to ESP32
  const esp32Message = transformToESP32Message(metrics);
  console.log(`[${timestamp}] Sending to ESP32:`, {
    direction: esp32Message.direction,
    containerIndex: esp32Message.containerMetrics.containerIndex,
    timeSpentInContainer: esp32Message.containerMetrics.timeSpentInContainer
  });

  // Send to ESP32
  communicationHandler.sendScrollData(esp32Message)
    .then(() => {
      console.log(`[${timestamp}] Successfully sent to ESP32`);
    })
    .catch(error => {
      console.error(`[${timestamp}] Error sending to ESP32:`, error.message);
    });

  res.json({ status: 'success', metrics: latestMetrics });
});

// Transform scroll metrics to ESP32 message format
function transformToESP32Message(metrics) {
  // Convert direction to numeric value
  let direction = 0;
  if (metrics.direction === 'down') direction = 1;
  else if (metrics.direction === 'up') direction = 0;
  
  return {
    type: 'scroll_data',
    deviceId: 0, // Broadcast to all devices
    direction,
    containerMetrics: {
      containerIndex: metrics.containerMetrics.containerIndex,
      timeSpentInContainer: metrics.containerMetrics.timeSpentInContainer
    }
  };
}

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
