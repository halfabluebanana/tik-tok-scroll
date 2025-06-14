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
  console.log(`${req.method} ${req.url}`);
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
  currentSpeed: 0,
  averageSpeed: 0,
  totalDistance: 0,
  scrollPosition: 0,
  direction: 'none',
  containerMetrics: {
    currentContainer: null,
    timeSpent: 0,
    timeBetween: 0,
    containerIndex: 0,
    totalContainers: 0
  }
};

// Scroll metrics endpoints
app.get('/api/scroll-metrics', (req, res) => {
  // console.log('\n=== GET /api/scroll-metrics ===');
  console.log('Current metrics:', latestMetrics);
  res.json(latestMetrics);
});

app.post('/api/scroll-metrics', async (req, res) => {
  console.log('\n=== POST /api/scroll-metrics ===');
  console.log('Received metrics:', req.body);
  
  // Update latest metrics
  latestMetrics = {
    ...req.body,
    containerMetrics: {
      ...req.body.containerMetrics,
      containerIndex: req.body.containerMetrics?.containerIndex || 0,
      totalContainers: req.body.containerMetrics?.totalContainers || 0
    }
  };

  console.log('Updated metrics:', latestMetrics);

  // Send data to devices through the appropriate handler
  try {
    const transformedData = {
      type: 'scroll_data',
      deviceId: 0,  // Broadcast to all devices
      angle: Math.min(180, Math.max(0, Math.round(latestMetrics.scrollPosition * (180/255)))),
      direction: latestMetrics.direction === 'down' ? 1 : 0,
      speed: Math.min(255, Math.max(0, Math.round(latestMetrics.currentSpeed / 10))),
      interval: 100,  // Default interval between animations
      delay_offset: 0,  // No delay for broadcast
      timestamp: Date.now(),
      containerMetrics: {
        currentContainer: latestMetrics.containerMetrics.currentContainer || '',
        timeSpent: latestMetrics.containerMetrics.timeSpent || 0,
        timeBetween: latestMetrics.containerMetrics.timeBetween || 0,
        containerIndex: latestMetrics.containerMetrics.containerIndex || 0,
        totalContainers: latestMetrics.containerMetrics.totalContainers || 0
      }
    };

    await communicationHandler.sendScrollData(transformedData);
    
    res.json({ 
      status: 'success',
      mode: CONFIG.useWebSocket ? 'websocket' : 'serial',
      metrics: latestMetrics
    });
  } catch (error) {
    console.error('Error sending scroll data:', error);
    res.status(500).json({ 
      status: 'error', 
      error: error.message,
      mode: CONFIG.useWebSocket ? 'websocket' : 'serial'
    });
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
