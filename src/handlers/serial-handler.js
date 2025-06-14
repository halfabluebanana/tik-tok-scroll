const { SerialPort } = require('serialport');

class SerialHandler {
  constructor(portPath = '/dev/tty.usbmodem2101', baudRate = 9600) {
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
      console.error('Serial port error:', err);
      console.error('Error details:', {
        message: err.message,
        code: err.code,
        stack: err.stack
      });
    });

    this.serialPort.on('open', () => {
      console.log('Serial port opened successfully');
      this.isConnected = true;
    });

    this.serialPort.on('close', () => {
      console.log('Serial port closed');
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
      console.log('\n=== Received Data from Arduino ===');
      console.log('Raw data:', data.toString());
      console.log('Data length:', data.length);
      console.log('Data type:', typeof data);
    });

    // Initial attempt to open the port
    this.openSerialPort();
  }

  // Try to open the port with retry logic
  openSerialPort(retries = 3) {
    console.log('Attempting to open serial port...');
    this.serialPort.open((err) => {
      if (err) {
        console.error('Error opening serial port:', err);
        console.error('Error details:', {
          message: err.message,
          code: err.code,
          stack: err.stack
        });
        
        if (retries > 0) {
          console.log(`Retrying... ${retries} attempts remaining`);
          setTimeout(() => this.openSerialPort(retries - 1), 1000);
        }
      } else {
        console.log('Serial port opened successfully');
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
  async sendScrollData(metrics) {
    return new Promise((resolve, reject) => {
      console.log('\n=== Sending Scroll Data via Serial ===');
      console.log('Scroll metrics:', metrics);

      // Transform metrics to ESP32 message format
      const esp32Message = this.transformToESP32Message(metrics);
      const messageStr = JSON.stringify(esp32Message) + '\n';
      
      console.log('ESP32 message:', esp32Message);
      
      if (this.serialPort && this.serialPort.isOpen) {
        this.serialPort.write(messageStr, (err) => {
          if (err) {
            console.error('Error sending data:', err);
            reject(err);
          } else {
            console.log('Data sent successfully to ESP32');
            resolve({ message: esp32Message, status: 'success' });
          }
        });
      } else {
        const error = new Error('Serial port not open, cannot send data');
        console.log(error.message);
        reject(error);
      }
    });
  }

  // Handle GET request for scroll metrics
  handleGetScrollMetrics(req, res) {
    console.log('\n=== GET /api/scroll-metrics (Serial) ===');
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
