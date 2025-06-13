/**
 * Simple WebSocket Handler for ESP32 Communication
 * Attaches to existing Express server to keep things simple
 */

const WebSocket = require('ws');

class ESP32WebSocketHandler {
    constructor() {
        this.clients = new Map(); // Map of deviceId -> {ws, deviceInfo}
        this.scrollMetrics = null; // Latest scroll data to send to new clients
    }

    // Attach WebSocket server to existing Express server
    attachToServer(httpServer) {
        console.log('\n📡 Setting up WebSocket server...');
        
        // Create WebSocket server that shares the same HTTP server
        this.wss = new WebSocket.Server({ 
            server: httpServer,
            path: '/esp32'  // ESP32s will connect to ws://localhost:3001/esp32
        });

        // When ESP32 connects
        this.wss.on('connection', (ws, req) => {
            console.log('\n=== ESP32 Connected ===');
            console.log(`IP: ${req.socket.remoteAddress}`);
            
            this.handleNewESP32(ws);
        });

        console.log('✅ WebSocket server attached to Express server');
        console.log('ESP32s should connect to: ws://localhost:3001/esp32');
    }

    // Handle new ESP32 connection
    handleNewESP32(ws) {
        let deviceId = null;

        // When ESP32 sends us a message
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log(`Message from ${deviceId || 'ESP32'}:`, message);

                // Handle different message types
                if (message.type === 'register') {
                    // ESP32 is telling us its ID
                    deviceId = message.deviceId;
                    this.clients.set(deviceId, { ws, deviceId });
                    console.log(`✅ ESP32 registered: ${deviceId}`);
                    
                    // Send back confirmation
                    ws.send(JSON.stringify({
                        type: 'registered',
                        message: `Hello ${deviceId}! You are connected.`
                    }));

                    // Send latest scroll data if we have any
                    if (this.scrollMetrics) {
                        this.sendScrollDataToESP32(deviceId, this.scrollMetrics);
                    }
                }

            } catch (error) {
                console.error('Error parsing ESP32 message:', error);
            }
        });

        // When ESP32 disconnects
        ws.on('close', () => {
            if (deviceId) {
                console.log(`❌ ESP32 disconnected: ${deviceId}`);
                this.clients.delete(deviceId);
            }
        });

        // Send welcome message
        ws.send(JSON.stringify({
            type: 'welcome',
            message: 'Send {"type":"register","deviceId":"esp32_1"} to register'
        }));
    }

    // Send scroll data to all connected ESP32s (matches Serial handler interface)
    async sendScrollData(scrollMetrics) {
        console.log('\n📡 Sending scroll data to all ESP32s via WebSocket');
        console.log('Data:', scrollMetrics);

        // Remember this data for new ESP32s that connect later
        this.scrollMetrics = scrollMetrics;

        // Send to each connected ESP32
        const results = [];
        this.clients.forEach((client, deviceId) => {
            try {
                this.sendScrollDataToESP32(deviceId, scrollMetrics);
                results.push({ deviceId, status: 'success' });
            } catch (error) {
                results.push({ deviceId, status: 'error', error: error.message });
            }
        });

        console.log(`Sent to ${this.clients.size} ESP32s`);
        return { 
            status: 'success', 
            deviceCount: this.clients.size,
            results 
        };
    }

    // Send scroll data to all connected ESP32s
    broadcastScrollData(scrollMetrics) {
        return this.sendScrollData(scrollMetrics);
    }

    // Send scroll data to one specific ESP32
    sendScrollDataToESP32(deviceId, scrollMetrics) {
        const client = this.clients.get(deviceId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            
            // Convert scroll data to format ESP32 expects
            const message = {
                type: 'scroll_data',
                angle: this.scrollToAngle(scrollMetrics.scrollPosition),
                direction: scrollMetrics.direction === 'down' ? 1 : 0,
                speed: scrollMetrics.currentSpeed || 0
            };

            try {
                client.ws.send(JSON.stringify(message));
                console.log(`✅ Sent to ${deviceId}:`, message);
            } catch (error) {
                console.error(`❌ Failed to send to ${deviceId}:`, error);
            }
        }
    }

    // Convert scroll position (0-255) to servo angle (0-180)
    scrollToAngle(scrollPosition) {
        return Math.min(180, Math.max(0, Math.round(scrollPosition * (180/255))));
    }

    // Get list of connected ESP32s
    getConnectedDevices() {
        return Array.from(this.clients.keys());
    }
  }

// Create the WebSocket handler
const esp32Handler = new ESP32WebSocketHandler();

// Export for use in server.js
module.exports = esp32Handler;
