/**
 * ESP32 Debug Panel - Drop-in JavaScript file for real-time interval timing control
 * Usage: Include this script in your HTML and call ESP32DebugPanel.init()
 */

const ESP32DebugPanel = {
    // Configuration - modify these settings as needed
    config: {
        // WebSocket server address - update this with your actual server
        socketUrl: 'ws://localhost:8080', 
        
        // Device configurations - customize names and initial intervals, or addtional devices
        devices: [
            { id: 'esp32_1', name: 'ESP32 Device 1', initialInterval: 1000 },
            { id: 'esp32_2', name: 'ESP32 Device 2', initialInterval: 1500 },
            { id: 'esp32_3', name: 'ESP32 Device 3', initialInterval: 2000 },
            { id: 'esp32_4', name: 'ESP32 Device 4', initialInterval: 2500 },
            { id: 'esp32_5', name: 'ESP32 Device 5', initialInterval: 3000 },
            { id: 'esp32_6', name: 'ESP32 Device 6', initialInterval: 3500 }
        ],
        
        // Panel styling
        panelStyle: {
            position: 'fixed',
            top: '20px',
            right: '20px',
            width: '400px',
            maxHeight: '80vh',
            backgroundColor: '#2c3e50',
            color: '#ecf0f1',
            fontFamily: 'Arial, sans-serif',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            zIndex: '9999',
            overflow: 'auto'
        }
    },

    // Internal state
    state: {
        socket: null,
        devices: new Map(),
        isConnected: false,
        panel: null
    },

    // Initialize the debug panel
    init(customConfig = {}) {
        // Merge custom config with defaults
        this.config = { ...this.config, ...customConfig };
        
        // Create the panel UI
        this.createPanel();
        
        // Initialize websocket connection
        this.initWebSocket();
        
        console.log('ESP32 Debug Panel initialized');
    },

    // Create the debug panel UI
    createPanel() {
        // Create main panel container
        const panel = document.createElement('div');
        panel.id = 'esp32-debug-panel';
        panel.style.cssText = Object.entries(this.config.panelStyle)
            .map(([key, value]) => `${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${value}`)
            .join('; ');

        // Create panel content
        panel.innerHTML = `
            <div style="padding: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #34495e; padding-bottom: 15px;">
                    <h3 style="margin: 0; color: #3498db;">ESP32 Debug Panel</h3>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <div id="connection-status" style="width: 12px; height: 12px; border-radius: 50%; background: #e74c3c;"></div>
                        <button id="toggle-connection" style="background: #3498db; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Connect</button>
                        <button id="close-panel" style="background: #e74c3c; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">×</button>
                    </div>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-size: 12px; color: #bdc3c7;">WebSocket URL:</label>
                    <input type="text" id="socket-url" value="${this.config.socketUrl}" 
                           style="width: 100%; padding: 8px; border: 1px solid #34495e; border-radius: 4px; background: #34495e; color: #ecf0f1; box-sizing: border-box;">
                </div>
                
                <div id="devices-container">
                    ${this.config.devices.map(device => this.createDeviceRow(device)).join('')}
                </div>
                
                <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #34495e; font-size: 12px; color: #7f8c8d;">
                    <div>Status: <span id="panel-status">Disconnected</span></div>
                    <div>Last Update: <span id="last-update">-</span></div>
                </div>
            </div>
        `;

        // Add panel to page
        document.body.appendChild(panel);
        this.state.panel = panel;

        // Initialize device states
        this.config.devices.forEach(device => {
            this.state.devices.set(device.id, {
                ...device,
                currentInterval: device.initialInterval,
                status: 'disconnected'
            });
        });

        // Bind event handlers
        this.bindEvents();
    },

    // Create a device control row
    createDeviceRow(device) {
        return `
            <div class="device-row" data-device-id="${device.id}" style="margin-bottom: 15px; padding: 15px; background: #34495e; border-radius: 6px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span style="font-weight: bold; color: #3498db;">${device.name}</span>
                    <div class="device-status" style="width: 8px; height: 8px; border-radius: 50%; background: #e74c3c;"></div>
                </div>
                
                <div style="margin-bottom: 10px;">
                    <label style="display: block; margin-bottom: 5px; font-size: 11px; color: #bdc3c7;">Interval (ms):</label>
                    <div style="display: flex; gap: 5px; align-items: center;">
                        <button class="interval-btn" data-action="decrease" data-amount="1000" style="background: #e74c3c; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;">-1s</button>
                        <button class="interval-btn" data-action="decrease" data-amount="100" style="background: #e67e22; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;">-100</button>
                        <input type="number" class="interval-input" value="${device.initialInterval}" min="100" max="10000" 
                               style="width: 80px; padding: 4px; border: 1px solid #2c3e50; border-radius: 3px; background: #2c3e50; color: #ecf0f1; text-align: center;">
                        <button class="interval-btn" data-action="increase" data-amount="100" style="background: #27ae60; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;">+100</button>
                        <button class="interval-btn" data-action="increase" data-amount="1000" style="background: #27ae60; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;">+1s</button>
                    </div>
                </div>
                
                <div style="margin-bottom: 5px;">
                    <input type="range" class="interval-slider" min="100" max="5000" value="${device.initialInterval}" 
                           style="width: 100%; accent-color: #3498db;">
                    <div style="display: flex; justify-content: space-between; font-size: 10px; color: #7f8c8d;">
                        <span>100ms</span>
                        <span>5s</span>
                    </div>
                </div>
            </div>
        `;
    },

    // Bind event handlers
    bindEvents() {
        const panel = this.state.panel;

        // Close panel
        panel.querySelector('#close-panel').addEventListener('click', () => {
            panel.style.display = 'none';
        });

        // Toggle connection
        panel.querySelector('#toggle-connection').addEventListener('click', () => {
            if (this.state.isConnected) {
                this.disconnect();
            } else {
                this.config.socketUrl = panel.querySelector('#socket-url').value;
                this.initWebSocket();
            }
        });

        // Device controls
        panel.querySelectorAll('.device-row').forEach(row => {
            const deviceId = row.dataset.deviceId;
            
            // Interval buttons
            row.querySelectorAll('.interval-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const action = btn.dataset.action;
                    const amount = parseInt(btn.dataset.amount);
                    const input = row.querySelector('.interval-input');
                    const slider = row.querySelector('.interval-slider');
                    
                    let newValue = parseInt(input.value);
                    if (action === 'increase') {
                        newValue += amount;
                    } else {
                        newValue -= amount;
                    }
                    
                    newValue = Math.max(100, Math.min(10000, newValue));
                    input.value = newValue;
                    slider.value = Math.min(newValue, 5000);
                    
                    this.updateDeviceInterval(deviceId, newValue);
                });
            });

            // Interval input
            row.querySelector('.interval-input').addEventListener('change', (e) => {
                const newValue = Math.max(100, Math.min(10000, parseInt(e.target.value)));
                e.target.value = newValue;
                row.querySelector('.interval-slider').value = Math.min(newValue, 5000);
                this.updateDeviceInterval(deviceId, newValue);
            });

            // Interval slider
            row.querySelector('.interval-slider').addEventListener('input', (e) => {
                const newValue = parseInt(e.target.value);
                row.querySelector('.interval-input').value = newValue;
                this.updateDeviceInterval(deviceId, newValue);
            });
        });
    },

    // Initialize WebSocket connection
    initWebSocket() {
        try {
            if (this.state.socket) {
                this.state.socket.close();
            }

            this.state.socket = new WebSocket(this.config.socketUrl);

            this.state.socket.onopen = () => {
                this.state.isConnected = true;
                this.updateConnectionStatus(true);
                this.updatePanelStatus('Connected');
                console.log('WebSocket connected');
            };

            this.state.socket.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            this.state.socket.onclose = () => {
                this.state.isConnected = false;
                this.updateConnectionStatus(false);
                this.updatePanelStatus('Disconnected');
                console.log('WebSocket disconnected');
            };

            this.state.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updatePanelStatus('Connection Error');
            };

        } catch (error) {
            console.error('Failed to connect:', error);
            this.updatePanelStatus('Connection Failed');
        }
    },

    // Disconnect WebSocket
    disconnect() {
        if (this.state.socket) {
            this.state.socket.close();
        }
    },

    // Handle incoming WebSocket messages
    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            // Handle different message types from ESP32s
            if (message.type === 'status') {
                this.updateDeviceStatus(message.deviceId, message.status);
            } else if (message.type === 'interval_update') {
                this.syncDeviceInterval(message.deviceId, message.interval);
            }
        } catch (error) {
            console.log('Received non-JSON message:', data);
        }
        
        this.updateLastUpdate();
    },

    // Update device interval and send to server
    updateDeviceInterval(deviceId, interval) {
        const device = this.state.devices.get(deviceId);
        if (device) {
            device.currentInterval = interval;
            
            // Send update to WebSocket server
            if (this.state.isConnected) {
                const message = {
                    type: 'interval_update',
                    deviceId: deviceId,
                    interval: interval
                };
                this.state.socket.send(JSON.stringify(message));
            }
            
            this.updateLastUpdate();
        }
    },

    // Sync device interval from server
    syncDeviceInterval(deviceId, interval) {
        const device = this.state.devices.get(deviceId);
        if (device) {
            device.currentInterval = interval;
            
            // Update UI
            const row = this.state.panel.querySelector(`[data-device-id="${deviceId}"]`);
            if (row) {
                row.querySelector('.interval-input').value = interval;
                row.querySelector('.interval-slider').value = Math.min(interval, 5000);
            }
        }
    },

    // Update device status indicator
    updateDeviceStatus(deviceId, status) {
        const device = this.state.devices.get(deviceId);
        if (device) {
            device.status = status;
            
            const row = this.state.panel.querySelector(`[data-device-id="${deviceId}"]`);
            if (row) {
                const statusDot = row.querySelector('.device-status');
                statusDot.style.background = status === 'connected' ? '#27ae60' : '#e74c3c';
            }
        }
    },

    // Update connection status
    updateConnectionStatus(connected) {
        const statusDot = this.state.panel.querySelector('#connection-status');
        const toggleBtn = this.state.panel.querySelector('#toggle-connection');
        
        statusDot.style.background = connected ? '#27ae60' : '#e74c3c';
        toggleBtn.textContent = connected ? 'Disconnect' : 'Connect';
    },

    // Update panel status text
    updatePanelStatus(status) {
        const statusSpan = this.state.panel.querySelector('#panel-status');
        if (statusSpan) {
            statusSpan.textContent = status;
        }
    },

    // Update last update timestamp
    updateLastUpdate() {
        const updateSpan = this.state.panel.querySelector('#last-update');
        if (updateSpan) {
            updateSpan.textContent = new Date().toLocaleTimeString();
        }
    },

    // Public API for external control
    show() {
        if (this.state.panel) {
            this.state.panel.style.display = 'block';
        }
    },

    hide() {
        if (this.state.panel) {
            this.state.panel.style.display = 'none';
        }
    },

    getDeviceInterval(deviceId) {
        const device = this.state.devices.get(deviceId);
        return device ? device.currentInterval : null;
    },

    setDeviceInterval(deviceId, interval) {
        this.updateDeviceInterval(deviceId, interval);
    }
};

// Auto-initialize when window loads - true drop-in functionality
window.addEventListener('load', () => {
    // Check if user has defined custom config before auto-init
    const customConfig = window.ESP32_CONFIG || {};
    ESP32DebugPanel.init(customConfig);
    console.log('ESP32 Debug Panel auto-initialized');
});

// Make it available globally
window.ESP32DebugPanel = ESP32DebugPanel;
