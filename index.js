const express = require("express");
const multer = require('multer');
const cors = require('cors');
const path = require("path");
const fs = require("fs");
const http = require('http');
// const WebSocketHandler = require('./src/handlers/websocket-handler');
const { SerialPort } = require('serialport');

const PORT = process.env.PORT || 3001;

const app = express();
const server = http.createServer(app);

// Initialize WebSocket handler (commented out for now)
// const wsHandler = new WebSocketHandler(server);

// Enable CORS with specific options
app.use(cors({
  origin: '*', // Allow all origins
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

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads')
    },
	limits: {
        fileSize: 1000000 * 100 // 1000000 Bytes = 1 MB = 100 MB
	},
	fileFilter: function (req, file, callback) {
        var ext = path.extname(file.originalname);
        if(ext !== '.mp4' && ext !== '.mpeg' && ext !== '.webm') {
            return callback(new Error('Only videos are allowed with mp4, mov, mpeg, webm extensions'));
        }
        callback(null, true)
    },
    filename: function (req, file, cb) {
		let newName = file.originalname
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
        newName = newName
            .split(' ')
            .join('_')
            .toLowerCase();
        cb(null, Date.now() + '-' + newName)
    },
})
const upload = multer({ storage: storage })

app.post('/upload-video', upload.single('my-video'), (req, res) => {
	console.log(`Video uploaded: ${req.file.filename}`);
	res.json({ success: true, filename: req.file.filename });
})

app.get("/api", (req, res) => {
	try {
		let videos = getMostRecentFile('./uploads')
		if (!videos) {
			videos = []
		}
		videos = videos.map((video, index) => {
			const metadata = [
				{
					channel: "What I make for breakfast",
					description: "healthy BLT recipe! 💃 #food #organic",
					song: "Bounce - Ruger",
					likes: 250,
					messages: 120,
					shares: 40
				},
				{
					channel: "Nature is lit",
					description: "#Arizona dust storm 🎵",
					song: "Kolo sound - Nathan",
					likes: 180,
					messages: 95,
					shares: 35
				},
				{
					channel: "What is reality",
					description: "cloud dogs 💛🦋 #viral #dog",
					song: "original sound - KALEI KING 🦋",
					likes: 320,
					messages: 150,
					shares: 60
				},
				{
					channel: "Tropicana",
					description: "spirit moving plants! #weird #plants",
					song: "Dance Floor - DJ Cool",
					likes: 420,
					messages: 180,
					shares: 75
				},
				{
					channel: "TikTTropicana 2r",
					description: "When the beat drops 🎵 #dance #viral",
					song: "Drop It - MC Fresh",
					likes: 550,
					messages: 230,
					shares: 90
				},
				{
					channel: "DanceQueen",
					description: "New moves unlocked! 🔓 #dance #tutorial",
					song: "Rhythm & Flow - Beat Master",
					likes: 380,
					messages: 160,
					shares: 65
				},
				{
					channel: "DanceKing",
					description: "When you nail the choreography 💯 #dance #perfect",
					song: "Move Your Body - Dance Crew",
					likes: 480,
					messages: 200,
					shares: 85
				},
				{
					channel: "DancePro",
					description: "Level up your dance game! 🎮 #dance #skills",
					song: "Game On - DJ Player",
					likes: 520,
					messages: 220,
					shares: 95
				}
			];
			return {
				...video,
				...metadata[index % metadata.length]
			};
		})
		res.json({
			videos
		});
	} catch (error) {
		console.error('Error fetching videos:', error);
		res.status(500).json({ error: 'Error fetching videos' });
	}
});

const getMostRecentFile = (dir) => {
	try {
		const files = orderReccentFiles(dir);
		return files.length ? [...files].splice(0,10) : [];
	} catch (error) {
		console.error('Error getting recent files:', error);
		return [];
	}
};

const orderReccentFiles = (dir) => {
	return fs.readdirSync(dir)
		.filter((file) => fs.lstatSync(path.join(dir, file)).isFile())
		.map((file) => ({ 
			url: encodeURIComponent(file), 
			filename: file
		}))
		.sort((a, b) => {
			// Extract numbers from filenames (e.g., "vid01" -> 1)
			const numA = parseInt(a.filename.match(/\d+/)?.[0] || '0');
			const numB = parseInt(b.filename.match(/\d+/)?.[0] || '0');
			return numA - numB;
		});
};

app.use(express.static(path.resolve(__dirname, './client/build')));

// Serve static files with CORS headers
app.use('/uploads/', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Range');
  next();
}, express.static(path.resolve(__dirname, './uploads')));

// Configure serial port for ESP32
const serialPort = new SerialPort({
  path: '/dev/tty.usbmodem2101',
  baudRate: 115200,  // Updated to match ESP32 baud rate
  autoOpen: false
});

// Add error handling for serial port
serialPort.on('error', (err) => {
  console.error('Serial port error:', err);
});

// Try to open the port with retry logic
function openSerialPort(retries = 3) {
  console.log('Attempting to open serial port...');
  serialPort.open((err) => {
    if (err) {
      console.error('Error opening serial port:', err);
      if (retries > 0) {
        console.log(`Retrying... ${retries} attempts remaining`);
        setTimeout(() => openSerialPort(retries - 1), 1000);
      }
    } else {
      console.log('Serial port opened successfully');
    }
  });
}

// Initial attempt to open the port
openSerialPort();

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
    timeBetween: 0
  }
};

// POST endpoint for scroll metrics
app.post('/api/scroll-metrics', (req, res) => {
  console.log('\n=== POST /api/scroll-metrics ===');
  console.log('Received metrics:', req.body);
  
  // Update latest metrics
  latestMetrics = {
    ...req.body,
    containerMetrics: req.body.containerMetrics || latestMetrics.containerMetrics
  };
  
  // Send to ESP32 via serial
  if (serialPort && serialPort.isOpen) {
    const data = JSON.stringify(latestMetrics) + '\n';
    console.log('Sending to ESP32:', data);
    serialPort.write(data, (err) => {
      if (err) {
        console.error('Error writing to serial port:', err);
      }
    });
  } else {
    console.log('Serial port not open, skipping ESP32 send');
  }
  
  res.json({ success: true });
});

// GET endpoint for scroll metrics
app.get('/api/scroll-metrics', (req, res) => {
  console.log('\n=== GET /api/scroll-metrics ===');
  console.log('Returning latest metrics:', latestMetrics);
  res.json(latestMetrics);
});

// Add serial port data listener
serialPort.on('data', (data) => {
  console.log('\n=== Received Data from ESP32 ===');
  console.log('Raw data:', data.toString());
});

// Error handling middleware
app.use((err, req, res, next) => {
	console.error(err.stack);
	res.status(500).json({ error: 'Something broke!' });
});

// Move the scroll-speeds endpoint BEFORE the catch-all route
app.get('/scroll-speeds', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Scroll Metrics & Motor Controls</title>
        <style>
          body {
            font-family: 'Courier New', monospace;
            margin: 0;
            padding: 20px;
            background: #282828;
            color: white;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .container {
            max-width: 800px;
            width: 100%;
            margin: 0 auto;
          }
          .panel {
            background: rgba(0, 0, 0, 0.8);
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          .metrics {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
          }
          .metric-item {
            display: flex;
            justify-content: space-between;
            padding: 15px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            transition: background 0.3s;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          .metric-item:hover {
            background: rgba(255, 255, 255, 0.1);
          }
          .metric-label {
            font-weight: bold;
            color: white;
          }
          .metric-value {
            font-family: 'Courier New', monospace;
            font-size: 1.1em;
            color: white;
          }
          .controls {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin-top: 20px;
          }
          .control-button {
            background: transparent;
            color: white;
            border: 1px solid white;
            padding: 20px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            transition: all 0.3s;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-family: 'Courier New', monospace;
          }
          .control-button:hover {
            background: rgba(255, 255, 255, 0.1);
            transform: translateY(-2px);
          }
          .control-button:active {
            background: rgba(255, 255, 255, 0.2);
            transform: translateY(0);
          }
          h2 {
            margin-top: 0;
            color: white;
            text-align: center;
            margin-bottom: 20px;
            font-size: 24px;
            font-family: 'Courier New', monospace;
          }
          #debug-panel {
            margin-top: 20px;
            padding: 15px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          #debug-log {
            height: 100px;
            overflow-y: auto;
            background: rgba(0, 0, 0, 0.5);
            padding: 10px;
            border-radius: 5px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          .status {
            margin: 10px 0;
            padding: 10px;
            border-radius: 5px;
            text-align: center;
            font-weight: bold;
            font-family: 'Courier New', monospace;
          }
          .status.connected {
            background: rgba(255, 255, 255, 0.1);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.3);
          }
          .status.disconnected {
            background: rgba(255, 0, 0, 0.1);
            color: white;
            border: 1px solid rgba(255, 0, 0, 0.3);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="panel">
            <h2>Scroll Metrics</h2>
            <div class="metrics" id="metrics">
              <div class="metric-item">
                <span class="metric-label">Current Speed:</span>
                <span class="metric-value" id="current-speed">0 px/s</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Average Speed:</span>
                <span class="metric-value" id="average-speed">0 px/s</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Total Distance:</span>
                <span class="metric-value" id="total-distance">0 px</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Scroll Position:</span>
                <span class="metric-value" id="scroll-position">0 px</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Direction:</span>
                <span class="metric-value" id="direction">NONE</span>
              </div>
            </div>
          </div>

          <div class="panel">
            <h2>Container Metrics</h2>
            <div class="metrics" id="container-metrics">
              <div class="metric-item">
                <span class="metric-label">Current Container:</span>
                <span class="metric-value" id="current-container">None</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Time in Container:</span>
                <span class="metric-value" id="time-in-container">0s</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Time Between Containers:</span>
                <span class="metric-value" id="time-between">0s</span>
              </div>
            </div>
          </div>
          
          <div class="panel">
            <h2>Motor Controls</h2>
            <div class="controls">
              <button class="control-button" onclick="sendCommand(255, 1)">Full Speed Forward</button>
              <button class="control-button" onclick="sendCommand(127, 1)">Half Speed Forward</button>
              <button class="control-button" onclick="sendCommand(0, 0)">Stop</button>
              <button class="control-button" onclick="sendCommand(127, 0)">Half Speed Backward</button>
              <button class="control-button" onclick="sendCommand(255, 0)">Full Speed Backward</button>
            </div>
          </div>

          <div class="panel" id="debug-panel">
            <h2>Connection Status</h2>
            <div class="status" id="connection-status">Checking connection...</div>
            <div id="debug-log"></div>
          </div>
        </div>

        <script>
          const debugLog = document.getElementById('debug-log');
          const connectionStatus = document.getElementById('connection-status');
          
          function log(message) {
            const timestamp = new Date().toLocaleTimeString();
            debugLog.innerHTML += \`[\${timestamp}] \${message}<br>\`;
            debugLog.scrollTop = debugLog.scrollHeight;
          }

          // Function to send motor commands
          async function sendCommand(speed, direction) {
            try {
              log(\`Sending motor command: speed=\${speed}, direction=\${direction}\`);
              const response = await fetch('/api/scroll-metrics', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  currentSpeed: speed,
                  direction: direction === 1 ? 'down' : 'up',
                  scrollPosition: 0,
                  totalDistance: 0,
                  averageSpeed: 0
                }),
              });
              
              if (!response.ok) {
                log('Failed to send motor command');
                connectionStatus.textContent = 'Disconnected';
                connectionStatus.className = 'status disconnected';
              } else {
                log('Motor command sent successfully');
                connectionStatus.textContent = 'Connected';
                connectionStatus.className = 'status connected';
              }
            } catch (error) {
              log(\`Error sending motor command: \${error.message}\`);
              connectionStatus.textContent = 'Disconnected';
              connectionStatus.className = 'status disconnected';
            }
          }

          // Function to update metrics with error handling
          function updateMetrics(metrics) {
            try {
              console.log('Updating metrics:', metrics);
              // Update scroll metrics
              document.getElementById('current-speed').textContent = Math.round(metrics.currentSpeed || 0) + ' px/s';
              document.getElementById('average-speed').textContent = Math.round(metrics.averageSpeed || 0) + ' px/s';
              document.getElementById('total-distance').textContent = Math.round(metrics.totalDistance || 0) + ' px';
              document.getElementById('scroll-position').textContent = Math.round(metrics.scrollPosition || 0) + ' px';
              document.getElementById('direction').textContent = (metrics.direction || 'none').toUpperCase();

              // Update container metrics
              if (metrics.containerMetrics) {
                document.getElementById('current-container').textContent = metrics.containerMetrics.currentContainer || 'None';
                document.getElementById('time-in-container').textContent = 
                  Math.round(metrics.containerMetrics.timeSpent / 1000) + 's';
                document.getElementById('time-between').textContent = 
                  Math.round(metrics.containerMetrics.timeBetween / 1000) + 's';
              }

              log('Metrics updated successfully');
            } catch (error) {
              console.error('Error updating metrics:', error);
              log('Error updating metrics: ' + error.message);
            }
          }

          // Poll for metrics updates with better error handling
          setInterval(async () => {
            try {
              log('Fetching metrics...');
              const response = await fetch('/api/scroll-metrics');
              if (response.ok) {
                const metrics = await response.json();
                console.log('Received metrics:', metrics);
                updateMetrics(metrics);
                connectionStatus.textContent = 'Connected';
                connectionStatus.className = 'status connected';
              } else {
                throw new Error('Failed to fetch metrics: ' + response.status);
              }
            } catch (error) {
              console.error('Error fetching metrics:', error);
              log('Error fetching metrics: ' + error.message);
              connectionStatus.textContent = 'Disconnected';
              connectionStatus.className = 'status disconnected';
            }
          }, 100);

          // Initial connection check
          fetch('/api/scroll-metrics')
            .then(response => {
              if (response.ok) {
                connectionStatus.textContent = 'Connected';
                connectionStatus.className = 'status connected';
                log('Initial connection successful');
              } else {
                throw new Error('Failed to connect');
              }
            })
            .catch(error => {
              connectionStatus.textContent = 'Disconnected';
              connectionStatus.className = 'status disconnected';
              log('Initial connection failed: ' + error.message);
            });
        </script>
      </body>
    </html>
  `);
});

// Move the catch-all route to the end
app.get('*', (req, res) => {
  console.log('\n=== Catch-all route ===');
  console.log('Requested URL:', req.url);
  res.sendFile(path.resolve(__dirname, './client/build', 'index.html'));
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  
  // WebSocket initialization (commented out for now)
  // const esp32Port = '/dev/tty.usbmodem2101';
  // wsHandler.connectSerial(esp32Port);
});