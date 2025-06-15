const { SerialPort } = require('serialport');

class SerialHandler {
  constructor(portPath = '/dev/tty.wchusbserial110', baudRate = 115200) {
    this.portPath = portPath;
    this.baudRate = baudRate;
    this.serialPort = null;
    this.isConnected = false;
    this.initializeSerialPort();
  }

  initializeSerialPort() {
    // Configure serial port for Arduino
    this.serialPort = new SerialPort({
      path: this.portPath,
      baudRate: this.baudRate,
      autoOpen: false
    });

    // Add error handling for serial port
    this.serialPort.on('error', (err) => {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] Serial port error:`, err.message);
    });

    this.serialPort.on('open', () => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Serial port opened successfully`);
      this.isConnected = true;
    });

    this.serialPort.on('close', () => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Serial port closed`);
      this.isConnected = false;
      // Attempt to reopen the port after a delay
      setTimeout(() => {
        if (!this.serialPort.isOpen) {
          this.openSerialPort();
        }
      }, 1000);
    });

    // Add serial port event listeners
    this.serialPort.on('data', (data) => {
      const message = data.toString().trim();
      console.log('Received from ESP32:', message);
      
      // Parse ESP32 logs
      if (message.startsWith('LOG_TRANSMISSION:')) {
        const [_, type, jsonData] = message.split(':');
        try {
          const data = JSON.parse(jsonData);
          // Forward to debug panel
          fetch('http://localhost:3001/api/log-transmission', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ type, data }),
          }).catch(error => console.error('Error forwarding log:', error));
        } catch (error) {
          console.error('Error parsing ESP32 log:', error);
        }
      }
      
      // Handle other messages
      if (message.startsWith('ESP32:')) {
        const [_, jsonData] = message.split(':');
        try {
          const data = JSON.parse(jsonData);
          this.lastResponse = data;
          if (this.responseCallback) {
            this.responseCallback(data);
            this.responseCallback = null;
          }
        } catch (error) {
          console.error('Error parsing ESP32 response:', error);
        }
      }
    });

    // Initial attempt to open the port
    this.openSerialPort();
  }

  // Try to open the port with retry logic
  openSerialPort(retries = 3) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Attempting to open serial port...`);
    this.serialPort.open((err) => {
      if (err) {
        console.error(`[${timestamp}] Error opening serial port:`, err.message);
        
        if (retries > 0) {
          console.log(`[${timestamp}] Retrying... ${retries} attempts remaining`);
          setTimeout(() => this.openSerialPort(retries - 1), 1000);
        }
      } else {
        console.log(`[${timestamp}] Serial port opened successfully`);
        this.isConnected = true;
      }
    });
  }

  // Transform scroll metrics to ESP32 message format
  transformToESP32Message(metrics) {
    return {
      type: 'scroll_data',
      deviceId: 0, // Broadcast to all devices
      angle: Math.min(180, Math.max(0, Math.round(metrics.scrollPosition * (180/255)))),
      direction: metrics.direction === 'down' ? 1 : 0,
      speed: Math.min(255, Math.max(0, Math.round(metrics.currentSpeed / 10))), // Scale speed to 0-255
      interval: 100, // Default interval between animations
      delay_offset: 0, // No delay for broadcast
      timestamp: Date.now(),
      containerMetrics: {
        currentContainer: metrics.containerMetrics.currentContainer || '',
        timeSpent: metrics.containerMetrics.timeSpent || 0,
        timeBetween: metrics.containerMetrics.timeBetween || 0,
        containerIndex: metrics.containerMetrics.containerIndex || 0,
        totalContainers: metrics.containerMetrics.totalContainers || 0
      }
    };
  }

  // Send scroll data to ESP32 devices
  async sendScrollData(data) {
    const timestamp = new Date().toISOString();
    if (!this.serialPort) {
      console.error(`[${timestamp}] Serial port not initialized`);
      throw new Error('Serial port not initialized');
    }

    try {
      // Convert data to JSON string
      const jsonString = JSON.stringify(data);
      console.log(`[${timestamp}] Sending to serial port:`, {
        type: data.type,
        angle: data.angle,
        direction: data.direction,
        speed: data.speed,
        interval: data.interval
      });

      // Write to serial port
      await this.serialPort.write(jsonString + '\n');
      console.log(`[${timestamp}] Successfully wrote to serial port`);

      // Listen for response
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.warn(`[${timestamp}] No response received from ESP32 within timeout`);
          resolve(); // Resolve anyway to not block the process
        }, 1000);

        this.serialPort.once('data', (data) => {
          clearTimeout(timeout);
          const response = data.toString().trim();
          //console.log(`[${timestamp}] Received from ESP32:`, response);
          resolve(response);
        });
      });
    } catch (error) {
      console.error(`[${timestamp}] Error sending data to serial port:`, error.message);
      throw error;
    }
  }

  // Handle GET request for scroll metrics
  handleGetScrollMetrics(req, res) {
    // console.log('\n=== GET /api/scroll-metrics (Serial) ===');
    res.json({
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
    });
  }

  // Handle POST request for scroll metrics
  async handlePostScrollMetrics(req, res) {
    console.log('\n=== POST /api/scroll-metrics (Serial) ===');
    console.log('Received metrics:', req.body);
    
    try {
      const result = await this.sendScrollData(req.body);
      res.json({ 
        status: 'success',
        message: result.message,
        metrics: req.body
      });
    } catch (error) {
      console.error('Error sending scroll data:', error);
      res.status(500).json({
        status: 'error',
        error: error.message,
        metrics: req.body
      });
    }
  }
}

module.exports = SerialHandler;
