const { SerialPort } = require('serialport');

class SerialHandler {
  constructor(portPath = '/dev/tty.wchusbserial110', baudRate = 115200) {
    this.portPath = portPath;
    this.baudRate = baudRate;
    this.serialPort = null;
    this.isConnected = false;
    this.messageBuffer = ''; // Buffer for incomplete messages
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
      // Add incoming data to buffer
      this.messageBuffer += data.toString();
      
      // Process complete messages (ended with newline)
      let messages = this.messageBuffer.split('\n');
      this.messageBuffer = messages.pop(); // Keep incomplete message in buffer
      
      // Process each complete message
      messages.forEach(message => {
        message = message.trim();
        if (message.length > 0) {
          this.handleCompleteMessage(message);
        }
      });
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
      deviceId: 1, // Send to Slave 1 specifically
      angle: Math.min(180, Math.max(0, Math.round(metrics.scrollPosition * (180/255)))),
      direction: metrics.direction === 'down' ? 1 : 0,
      speed: Math.min(255, Math.max(0, Math.round(metrics.currentSpeed / 10))), // Scale speed to 0-255
      interval: 100 // Default interval between animations
    };
  }

  // Send scroll data to ESP32 devices
  async sendScrollData(data) {
    const timestamp = new Date().toISOString();
    if (!this.serialPort) {
      console.error(`[${timestamp}] Serial port not initialized`);
      throw new Error('Serial port not initialized');
    }

    if (!this.serialPort.isOpen) {
      console.error(`[${timestamp}] Serial port is not open`);
      throw new Error('Serial port is not open');
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
      this.serialPort.write(jsonString + '\n');
      console.log(`[${timestamp}] Successfully wrote to serial port`);

      // Return success immediately - don't wait for ESP32 response
      // The ESP32 will send logs back via LOG_MASTER: messages
      return Promise.resolve({
        status: 'sent',
        timestamp: timestamp
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
      // Transform the received metrics to ESP32 format
      const esp32Data = this.transformToESP32Message(req.body);
      console.log('Transformed to ESP32 format:', esp32Data);
      
      // Send to ESP32
      const result = await this.sendScrollData(esp32Data);
      
      res.json({ 
        status: 'success',
        message: 'Data sent to ESP32',
        originalMetrics: req.body,
        esp32Data: esp32Data,
        result: result
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

  // Handle complete messages from ESP32
  handleCompleteMessage(message) {
    
    // Parse and pretty-print LOG_TRANSMISSION messages
    if (message.startsWith('LOG_TRANSMISSION:')) {
      try {
        const colonIndex = message.indexOf(':', 'LOG_TRANSMISSION:'.length);
        const jsonData = message.substring(colonIndex + 1);
        const data = JSON.parse(jsonData);
        console.log('ESP32 Transmission:', JSON.stringify(data, null, 2));
      } catch (error) {
        // JSON parsing failed, just show raw
      }
    }
    
    // Parse and pretty-print LOG_MASTER messages
    if (message.startsWith('LOG_MASTER:')) {
      try {
        const jsonData = message.substring('LOG_MASTER:'.length);
        const data = JSON.parse(jsonData);
        console.log('ESP32 Master:', JSON.stringify(data, null, 2));
      } catch (error) {
        // JSON parsing failed, just show raw
      }
    } else {
      console.log('ESP32:', message);
    }
  }
}

module.exports = SerialHandler;
