const express = require("express");
const cors = require('cors');
const path = require("path");
const http = require('http');

// Import handlers
const SerialHandler = require('./src/handlers/serial-handler');
const VideoHandler = require('./src/handlers/video-handler');
const ScrollHandler = require('./src/handlers/scroll-handler');

const PORT = process.env.PORT || 3001;

// Configuration - Using serial communication only
const CONFIG = {
  serialPort: '/dev/tty.wchusbserial110',
  baudRate: 115200
};

// Debouncing for scroll metrics
let scrollMetricsTimeout = null;
let latestScrollMetrics = null;
const SCROLL_DEBOUNCE_MS = 400;

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
const communicationHandler = new SerialHandler(CONFIG.serialPort, CONFIG.baudRate);

console.log('Initializing Serial handler...');

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

// Function to actually send scroll data to ESP32 (debounced)
async function sendScrollDataToESP32(metrics) {
  try {
    console.log(`[DEBOUNCED] Processing scroll metrics after ${SCROLL_DEBOUNCE_MS}ms delay`);
    
    // Update metrics using the scroll handler
    const updatedMetrics = scrollHandler.updateMetrics(metrics);

    // Send to ESP32 using the communication handler
    if (communicationHandler && communicationHandler.serialPort && communicationHandler.serialPort.isOpen) {
      await communicationHandler.handlePostScrollMetrics({ body: updatedMetrics }, {
        json: (response) => {
          console.log(`[DEBOUNCED] ESP32 Response:`, response.status);
        }
      });
    } else {
      console.error('[DEBOUNCED] Communication handler not available');
    }
  } catch (error) {
    console.error('[DEBOUNCED] Error sending scroll data:', error.message);
  }
}

// GET endpoint for scroll metrics
app.get('/api/scroll-metrics', (req, res) => {
  res.json(scrollHandler.getLatestMetrics());
});

// POST endpoint for scroll metrics (with debouncing)
app.post('/api/scroll-metrics', (req, res) => {
  const metrics = req.body;
  
  // Store the latest metrics
  latestScrollMetrics = metrics;
  
  // Clear existing timeout
  if (scrollMetricsTimeout) {
    clearTimeout(scrollMetricsTimeout);
  }
  
  // Set new timeout - only send data when requests stop coming for 400ms
  scrollMetricsTimeout = setTimeout(() => {
    console.log("Got new scroll metrics from frontend")
    sendScrollDataToESP32(latestScrollMetrics);
    scrollMetricsTimeout = null;
    latestScrollMetrics = null;
    
  }, SCROLL_DEBOUNCE_MS);
  
  // Respond immediately to prevent client timeout
  res.json({
    status: 'received',
    message: 'Metrics queued for processing',
    debounceMs: SCROLL_DEBOUNCE_MS,
    timestamp: new Date().toISOString()
  });
});

// Simple logging endpoint (removed WebSocket dependencies)
app.post('/api/log-transmission', (req, res) => {
  const { type, data } = req.body;
  // console.log(`[ESP32-LOG] ${type}: ${JSON.stringify(data)}`);
  res.json({ status: 'success' });
});

// Add reconnection endpoint
app.post('/api/reconnect-esp32', (req, res) => {
  console.log('\n=== POST /api/reconnect-esp32 ===');
  if (communicationHandler && communicationHandler.serialPort) {
    try {
      // Close the existing port
      if (communicationHandler.serialPort.isOpen) {
        communicationHandler.serialPort.close();
      }
      
      // Reinitialize the port
      communicationHandler.initializeSerialPort();
      
      res.json({ status: 'success', message: 'Reconnection initiated' });
    } catch (error) {
      console.error('Error during reconnection:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  } else {
    res.status(500).json({ status: 'error', message: 'Communication handler not available' });
  }
});

// Serve the scroll speeds interface
app.get('/scroll-speeds', (req, res) => {
  res.sendFile(path.resolve(__dirname, './static/scroll-speeds.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

// Base route for React app
app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, './client/build/index.html'));
});

// Serial port event handlers
if (communicationHandler && communicationHandler.serialPort) {
  const serialPort = communicationHandler.serialPort;

  serialPort.on('error', (err) => {
    console.error('\nSerial port error:', err.message);
  });

  serialPort.on('close', () => {
    console.log('\nSerial port closed');
  });
}

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[INFO] Server started on port ${PORT}`);
  console.log(`- Listening on http://0.0.0.0:${PORT}`);
  console.log(`- Debug panel: http://localhost:${PORT}/scroll-speeds`);
  console.log(`- Communication mode: Serial`);
  console.log(`- Serial port: ${CONFIG.serialPort} at ${CONFIG.baudRate} baud`);
  console.log(`- Scroll debounce: ${SCROLL_DEBOUNCE_MS}ms`);
});