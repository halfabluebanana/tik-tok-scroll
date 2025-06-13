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

  // Send scroll data to ESP32 devices (matches WebSocket handler interface)
  async sendScrollData(scrollMetrics) {
    return new Promise((resolve, reject) => {
      console.log('\n=== Sending Scroll Data via Serial ===');
      console.log('Scroll metrics:', scrollMetrics);

      // Map scroll direction to servo angle (0-180)
      const servoAngle = Math.min(180, Math.max(0, Math.round(scrollMetrics.scrollPosition * (180/255))));
      
      // Create command in format Arduino expects: "angle,direction\n"
      const servoCommand = `${servoAngle},${scrollMetrics.direction === 'down' ? 1 : 0}\n`;
      
      console.log('Scroll direction:', scrollMetrics.direction);
      console.log('Scroll position:', scrollMetrics.scrollPosition);
      console.log('Servo angle:', servoAngle);
      console.log('Command:', servoCommand);
      
      if (this.serialPort && this.serialPort.isOpen) {
        this.serialPort.write(servoCommand, (err) => {
          if (err) {
            console.error('Error sending servo command:', err);
            reject(err);
          } else {
            console.log('Servo command sent successfully to Arduino');
            resolve({ command: servoCommand, status: 'success' });
          }
        });
      } else {
        const error = new Error('Serial port not open, cannot send servo command');
        console.log(error.message);
        reject(error);
      }
    });
  }

  // Handle GET request for scroll metrics
  handleGetScrollMetrics(req, res) {
    console.log('\n=== GET /api/scroll-metrics (Serial) ===');
    console.log('Current global metrics:', global.scrollMetrics || 'No metrics available');
    
    // If no metrics exist yet, return default values
    if (!global.scrollMetrics) {
      console.log('No metrics available, sending default values');
      res.json({
        currentSpeed: 0,
        averageSpeed: 0,
        totalDistance: 0,
        scrollPosition: 0,
        direction: 'none'
      });
      return;
    }

    console.log('Sending metrics:', global.scrollMetrics);
    res.json(global.scrollMetrics);
  }

  // Handle POST request for scroll metrics
  async handlePostScrollMetrics(req, res) {
    console.log('\n=== POST /api/scroll-metrics (Serial) ===');
    console.log('Received metrics:', req.body);
    
    const { currentSpeed, averageSpeed, totalDistance, scrollPosition, direction } = req.body;
    
    // Store metrics globally
    global.scrollMetrics = {
      currentSpeed,
      averageSpeed,
      totalDistance,
      scrollPosition,
      direction
    };

    console.log('Stored metrics:', global.scrollMetrics);

    try {
      const result = await this.sendScrollData(global.scrollMetrics);
      res.json({ 
        status: 'success',
        servoCommand: result.command,
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
