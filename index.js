const express = require("express");
const multer = require('multer');
const cors = require('cors');
const path = require("path");
const fs = require("fs");
const { SerialPort } = require('serialport');

const PORT = process.env.PORT || 3001;

const app = express();

// Enable CORS with specific options
app.use(cors({
  origin: 'http://localhost:3000',
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
			url: file,
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
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Range');
  
  // Set proper MIME type for video files
  if (req.path.endsWith('.mp4')) {
    res.type('video/mp4');
  }
  
  next();
}, express.static(path.resolve(__dirname, './uploads')));

// Configure serial port for Arduino
let serialPort = null;
let portRetryCount = 0;
const MAX_RETRIES = 5;

function initializeSerialPort() {
  try {
    // If we've tried too many times, stop trying
    if (portRetryCount >= MAX_RETRIES) {
      console.error('Max retry attempts reached. Please check if Arduino IDE Serial Monitor is closed.');
      return;
    }

    // If there's an existing port, try to close it first
    if (serialPort) {
      try {
        if (serialPort.isOpen) {
          serialPort.close((err) => {
            if (err) console.error('Error closing existing port:', err);
          });
        }
      } catch (err) {
        console.error('Error handling existing port:', err);
      }
      serialPort = null;
    }

    // Wait a bit before trying to open the port
    setTimeout(() => {
      try {
        serialPort = new SerialPort({
          path: '/dev/tty.usbmodem2101',
          baudRate: 9600,
          autoOpen: true
        });

        serialPort.on('error', (err) => {
          console.error('Serial port error:', err);
          portRetryCount++;
          
          // If the port is busy, wait longer before retrying
          if (err.message.includes('Resource busy')) {
            console.log('Port is busy. Please close Arduino IDE Serial Monitor if it\'s open.');
            setTimeout(initializeSerialPort, 5000); // Wait 5 seconds
          } else {
            setTimeout(initializeSerialPort, 2000); // Wait 2 seconds for other errors
          }
        });

        serialPort.on('open', () => {
          console.log('Serial port opened successfully');
          portRetryCount = 0; // Reset retry count on successful open
        });

        serialPort.on('close', () => {
          console.log('Serial port closed');
          setTimeout(initializeSerialPort, 2000);
        });

      } catch (err) {
        console.error('Error creating serial port:', err);
        portRetryCount++;
        setTimeout(initializeSerialPort, 2000);
      }
    }, 1000); // Wait 1 second before trying to open

  } catch (err) {
    console.error('Error in initializeSerialPort:', err);
    portRetryCount++;
    setTimeout(initializeSerialPort, 2000);
  }
}

// Initialize serial port on startup
initializeSerialPort();

// Function to map scroll metrics to motor values
function mapScrollToMotor(scrollMetrics) {
  // Use the scroll position directly (0-255)
  const motorSpeed = scrollMetrics.scrollPosition;
  
  // Map scroll direction to motor direction
  const motorDirection = scrollMetrics.scrollDirection;
  
  console.log('Scroll metrics:', scrollMetrics);
  console.log('Mapped to motor values:', { speed: motorSpeed, direction: motorDirection });
  
  return {
    speed: motorSpeed,
    direction: motorDirection
  };
}

// Function to send motor commands to Arduino
async function sendMotorCommand(motorData) {
  console.log('Sending motor command...');
  // Add newline character to mark end of command
  const command = `${motorData.speed},${motorData.direction}\n`;
  console.log('Command:', command);
  
  try {
    if (!serialPort) {
      console.log('Serial port not initialized, attempting to initialize...');
      initializeSerialPort();
      return;
    }

    if (!serialPort.isOpen) {
      console.log('Serial port not open, attempting to open...');
      await new Promise((resolve, reject) => {
        serialPort.open((err) => {
          if (err) {
            console.error('Error opening serial port:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }
    
    // Write the command with a callback to confirm it was sent
    serialPort.write(command, (err) => {
      if (err) {
        console.error('Error writing to serial port:', err);
        if (err.message.includes('Resource busy')) {
          console.log('Port is busy. Please close Arduino IDE Serial Monitor if it\'s open.');
        }
        initializeSerialPort();
      } else {
        console.log('Command sent successfully');
      }
    });
  } catch (err) {
    console.error('Failed to send motor command:', err);
    initializeSerialPort();
  }
}

// Update the scroll metrics endpoint
app.post("/api/scroll-metrics", (req, res) => {
  const scrollMetrics = req.body;
  console.log('Received scroll metrics:', scrollMetrics);
  
  // Map scroll metrics to motor values
  const motorData = mapScrollToMotor(scrollMetrics);
  
  // Send motor commands to Arduino
  sendMotorCommand(motorData);
  
  res.json({ success: true });
});

// Error handling middleware
app.use((err, req, res, next) => {
	console.error(err.stack);
	res.status(500).json({ error: 'Something broke!' });
});

// All other GET requests not handled before will return our React app
app.get('*', (req, res) => {
	res.sendFile(path.resolve(__dirname, './client/build', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
	console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
