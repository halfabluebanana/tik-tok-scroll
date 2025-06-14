/**
 * Simple WebSocket Handler for ESP32 Communication
 * Attaches to existing Express server to keep things simple
 */

const WebSocket = require('ws');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

class WebSocketHandler {
    constructor(server) {
        // Main WebSocket server for scroll metrics
        this.wss = new WebSocket.Server({ server });
        this.clients = new Set();
        
        // Monitor WebSocket server
        this.monitorWss = new WebSocket.Server({ 
            server,
            path: '/monitor'
        });
        this.monitorClients = new Set();
        
        this.serialPort = null;
        this.parser = null;
        this.lastScrollData = null;
        this.lastContainerChange = null;
        this.containerMetrics = {
            currentContainer: null,
            containerStartTime: null,
            containerTimes: {},
            timeBetweenContainers: []
        };

        this.init();
    }

    init() {
        // Initialize main WebSocket server
        this.wss.on('connection', (ws) => {
            console.log('New WebSocket connection');
            this.clients.add(ws);

            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    
                    if (data.type === 'scroll_metrics') {
                        this.handleScrollMetrics(data);
                    }
                } catch (error) {
                    console.error('Error processing WebSocket message:', error);
                }
            });

            ws.on('close', () => {
                console.log('Client disconnected');
                this.clients.delete(ws);
            });
        });

        // Initialize monitor WebSocket server
        this.monitorWss.on('connection', (ws) => {
            console.log('New monitor connection');
            this.monitorClients.add(ws);

            ws.on('close', () => {
                console.log('Monitor disconnected');
                this.monitorClients.delete(ws);
            });
        });
    }

    // Send log to all monitor clients
    sendLog(type, data) {
        const log = {
            type,
            timestamp: Date.now(),
            data
        };

        this.monitorClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(log));
            }
        });
    }

    handleScrollMetrics(data) {
        const {
            currentSpeed,
            averageSpeed,
            totalDistance,
            scrollPosition,
            direction,
            containerMetrics
        } = data;

        // Log client data
        this.sendLog('client', {
            currentSpeed,
            averageSpeed,
            totalDistance,
            scrollPosition,
            direction,
            containerMetrics
        });

        // Update container metrics
        if (containerMetrics.currentContainer !== this.containerMetrics.currentContainer) {
            const now = Date.now();
            
            // Record time spent in previous container
            if (this.containerMetrics.currentContainer && this.containerMetrics.containerStartTime) {
                const timeSpent = now - this.containerMetrics.containerStartTime;
                this.containerMetrics.containerTimes[this.containerMetrics.currentContainer] = 
                    (this.containerMetrics.containerTimes[this.containerMetrics.currentContainer] || 0) + timeSpent;
            }

            // Record time between containers
            if (this.containerMetrics.lastContainerChange) {
                const timeBetween = now - this.containerMetrics.lastContainerChange;
                this.containerMetrics.timeBetweenContainers.push(timeBetween);
            }

            // Update container tracking
            this.containerMetrics.currentContainer = containerMetrics.currentContainer;
            this.containerMetrics.containerStartTime = now;
            this.containerMetrics.lastContainerChange = now;
        }

        // Prepare data for ESP32
        const scrollData = {
            type: 'scroll_data',
            angle: scrollPosition,
            direction: direction === 'down' ? 1 : 0,
            speed: Math.min(255, Math.max(0, Math.round(currentSpeed / 10))), // Scale speed to 0-255
            containerMetrics: {
                currentContainer: this.containerMetrics.currentContainer,
                timeSpent: this.containerMetrics.containerTimes[this.containerMetrics.currentContainer] || 0,
                timeBetween: this.containerMetrics.timeBetweenContainers
            }
        };

        // Log server data
        this.sendLog('server', scrollData);

        // Send to ESP32 if connected
        if (this.serialPort && this.serialPort.isOpen) {
            this.serialPort.write(JSON.stringify(scrollData) + '\n', (err) => {
                if (err) {
                    console.error('Error sending data to ESP32:', err);
                }
            });
        }

        this.lastScrollData = scrollData;
    }

    connectSerial(port, baudRate = 115200) {
        this.serialPort = new SerialPort({ path: port, baudRate });
        this.parser = this.serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

        this.serialPort.on('open', () => {
            console.log('Serial port opened');
            this.sendLog('server', { status: 'Serial port opened', port });
        });

        this.parser.on('data', (data) => {
            try {
                const message = JSON.parse(data);
                this.sendLog('master', message);
            } catch (error) {
                console.error('Error parsing ESP32 message:', error);
            }
        });

        this.serialPort.on('error', (err) => {
            console.error('Serial port error:', err);
            this.sendLog('server', { error: 'Serial port error', details: err.message });
        });
    }
}

// Create the WebSocket handler
const esp32Handler = new WebSocketHandler();

// Export for use in server.js
module.exports = esp32Handler;
