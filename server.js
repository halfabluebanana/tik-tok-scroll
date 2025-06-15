const express = require("express");
const cors = require('cors');
const path = require("path");
const http = require('http');
const WebSocket = require('ws');

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
  baudRate: 115200
};

// ESP-NOW connection status tracking
const espNowStatus = {
  slaves: {
    1: { connected: false, lastSeen: null, macAddress: 'F0:24:F9:04:01:58' },
    2: { connected: false, lastSeen: null, macAddress: 'F0:24:F9:F5:66:70' }
  },
  master: { connected: false, lastSeen: null }
};

// Create WebSocket server
const wss = new WebSocket.Server({ noServer: true });

// Store connected WebSocket clients
const clients = new Set();

// Function to broadcast message to all connected clients
function broadcast(message) {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  logServerEvent('New WebSocket client connected', 'info');
  clients.add(ws);
  
  // Send initial status
  ws.send(JSON.stringify({
    type: 'espnow_status',
    data: espNowStatus
  }));
  
  ws.on('close', () => {
    logServerEvent('WebSocket client disconnected', 'info');
    clients.delete(ws);
  });
});

// Function to update ESP-NOW status and broadcast changes
function updateEspNowStatus(type, deviceId, data) {
  const timestamp = new Date();
  
  logServerEvent(`Updating ESP-NOW status for ${type}`, 'info');
  
  if (type === 'master') {
    espNowStatus.master.connected = true;
    espNowStatus.master.lastSeen = timestamp;
    logServerEvent(`Master status updated - Connected: true, Last seen: ${timestamp}`, 'info');
  } else if (type === 'slave1' || type === 'slave2') {
    const id = type === 'slave1' ? 1 : 2;
    espNowStatus.slaves[id].connected = true;
    espNowStatus.slaves[id].lastSeen = timestamp;
    logServerEvent(`Slave ${id} status updated - Connected: true, Last seen: ${timestamp}`, 'info');
  }
  
  // Always broadcast status updates
  broadcast({
    type: 'espnow_status',
    data: espNowStatus
  });
  
  // Check for stale connections (no updates in last 5 seconds)
  const now = new Date();
  let statusChanged = false;
  
  Object.keys(espNowStatus.slaves).forEach(id => {
    if (espNowStatus.slaves[id].lastSeen && 
        (now - espNowStatus.slaves[id].lastSeen) > 5000) {
      if (espNowStatus.slaves[id].connected) {
        espNowStatus.slaves[id].connected = false;
        statusChanged = true;
        logServerEvent(`Slave ${id} marked as disconnected due to timeout`, 'warning');
      }
    }
  });
  
  if (espNowStatus.master.lastSeen && 
      (now - espNowStatus.master.lastSeen) > 5000) {
    if (espNowStatus.master.connected) {
      espNowStatus.master.connected = false;
      statusChanged = true;
      logServerEvent('Master marked as disconnected due to timeout', 'warning');
    }
  }

  // Broadcast status changes
  if (statusChanged) {
    logServerEvent('Broadcasting ESP-NOW status update', 'info');
    broadcast({
      type: 'espnow_status',
      data: espNowStatus
    });
  }
}

// Function to log server events
function logServerEvent(message, type = 'info') {
  const logEntry = {
    type: 'log',
    data: {
      message,
      type,
      timestamp: new Date().toISOString()
    }
  };
  broadcast(logEntry);
  console.log(`[${type.toUpperCase()}] ${message}`);
}

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
  console.log('Received metrics:', metrics);
  
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

  console.log('Sending to ESP32:', esp32Data);

  // Send to ESP32
  if (communicationHandler && communicationHandler.serialPort && communicationHandler.serialPort.isOpen) {
    communicationHandler.sendScrollData(esp32Data)
      .then(() => {
        res.json({
          status: 'success',
          message: 'Metrics received and sent to ESP32',
          metrics: updatedMetrics,
          esp32Data: esp32Data,
          timestamp: new Date().toISOString()
        });
      })
      .catch(error => {
        console.error('Error sending scroll data:', error.message);
        res.status(500).json({ 
          error: 'Error sending scroll data',
          details: error.message
        });
      });
  } else {
    console.error('Communication handler not available');
    res.status(500).json({ 
      error: 'Communication handler not available',
      details: 'Serial port not open'
    });
  }
});

// Modify the log-transmission endpoint to update ESP-NOW status and log events
app.post('/api/log-transmission', (req, res) => {
  const { type, data } = req.body;
  
  // Extract device type from the log format
  const deviceType = type.split(':')[1].split(',')[0];  // Gets 'master', 'slave1', or 'slave2'
  
  logServerEvent(`Received transmission from ${deviceType}: ${JSON.stringify(data)}`, 'info');
  updateEspNowStatus(deviceType, data.deviceId, data);
  res.json({ status: 'success' });
});

// Add new endpoint to get ESP-NOW status
app.get('/api/espnow-status', (req, res) => {
  logServerEvent('ESP-NOW status requested', 'info');
  res.json(espNowStatus);
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

// New endpoint for sending data to ESP32
app.post('/api/send-data', async (req, res) => {
    try {
        const data = req.body;
        
        // Validate required fields
        const requiredFields = ['type', 'deviceId', 'angle', 'direction', 'speed', 'interval'];
        const missingFields = requiredFields.filter(field => !(field in data));
        
        if (missingFields.length > 0) {
            console.error('Missing required fields:', missingFields);
            return res.status(400).json({ error: `Missing required fields: ${missingFields.join(', ')}` });
        }

        // Validate data types
        if (typeof data.angle !== 'number' || 
            typeof data.direction !== 'number' || 
            typeof data.speed !== 'number' || 
            typeof data.interval !== 'number') {
            console.error('Invalid data types:', data);
            return res.status(400).json({ error: 'Invalid data types' });
        }

        // Send data to ESP32
        console.log('Sending to ESP32:', data);
        const success = await communicationHandler.sendData(data);
        
        if (success) {
            // Wait for acknowledgment from ESP32
            const ack = await communicationHandler.waitForAcknowledgment();
            if (ack) {
                console.log('Received acknowledgment from ESP32');
                res.json({ success: true, message: 'Data sent and acknowledged' });
            } else {
                console.error('No acknowledgment received from ESP32');
                res.status(500).json({ error: 'No acknowledgment received' });
            }
        } else {
            console.error('Failed to send data to ESP32');
            res.status(500).json({ error: 'Failed to send data' });
        }
    } catch (error) {
        console.error('Error sending data:', error);
        res.status(500).json({ error: error.message });
    }
});

// Handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  logServerEvent(`Server started on port ${PORT}`, 'info');
  logServerEvent('Waiting for ESP-NOW connections...', 'info');
  console.log(`- Listening on http://0.0.0.0:${PORT}`);
  console.log(`- Debug panel: http://localhost:${PORT}/scroll-speeds`);
  console.log(`- Communication mode: ${CONFIG.useWebSocket ? 'WebSocket' : 'Serial'}`);
  if (!CONFIG.useWebSocket) {
    console.log(`- Serial port: ${CONFIG.serialPort} at ${CONFIG.baudRate} baud`);
  }
});