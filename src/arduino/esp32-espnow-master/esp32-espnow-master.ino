/*
 * ESP32 ESP-NOW Master C// COMMUNICATION MODE SELECTION
// Set to true for WebSocket communication, false for Serial communication
// This is the ONLY line you need to change to switch modes!
const bool USE_WEBSOCKET = true;  // Change to false for Serial modeoller
 * 
 * ESP-NOW EXPLAINED:
 * ESP-NOW is a wireless communication protocol developed by Espressif that allows 
 * multiple ESP32 devices to communicate directly with each other WITHOUT needing 
 * a WiFi router. Think of it like Bluetooth but much faster and designed for IoT.
 * 
 * HOW IT WORKS:
 * 1. This "Master" ESP32 connects to WiFi and receives commands from our Node.js server
 * 2. The Master then uses ESP-NOW to instantly send commands to up to 6 "Slave" ESP32s
 * 3. Slave ESP32s don't need WiFi - they just listen for ESP-NOW messages
 * 
 * 
 * SETUP REQUIREMENTS:
 * 1. Install Arduino_JSON library (Tools -> Manage Libraries -> Search "Arduino_JSON")
 * 2. Install WebSockets library by Markus Sattler
 * 3. Get MAC addresses of all slave ESP32s (they'll print it on startup)
 * 4. Update the slave_macs array below with real MAC addresses
 */

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <Arduino_JSON.h>        // Better than ArduinoJson - faster and more stable
#include <esp_now.h>             // ESP-NOW protocol for device-to-device communication

// ==================== CONFIGURATION SECTION ====================

// OMMUNICATION MODE SELECTION
// Set to true for WebSocket communication, false for Serial communication
// This is the ONLY line you need to change to switch modes!
const bool USE_WEBSOCKET = true;  // Change to false for Serial mode

// WiFi Configuration - Only needed if USE_WEBSOCKET is true
const char* ssid = "MIFI-70F9";        // Replace with your WiFi network name
const char* password = "12345678"; // Replace with your WiFi password

// Node.js Server Configuration - Only needed if USE_WEBSOCKET is true
const char* websocket_server = "192.168.0.199";  // Replace with your computer's IP address
const int websocket_port = 3001;                  // Should match your Node.js server port
const char* websocket_path = "/esp32";            // WebSocket endpoint path

// Serial Configuration - Only needed if USE_WEBSOCKET is false
const int serial_baud = 9600;                     // Must match Node.js server serial settings

// ESP-NOW Configuration
#define MAX_SLAVES            // Maximum number of slave ESP32s we can control
#define ESPNOW_CHANNEL 1       // ESP-NOW communication channel (1-14)

/*
 * IMPORTANT: MAC ADDRESS SETUP
 * Each ESP32 has a unique MAC address (like a fingerprint).
 * You need to:
 * 1. Flash the slave code to each ESP32
 * 2. Open Serial Monitor - each slave will print its MAC address
 * 3. Copy those MAC addresses into this array
 * 4. The order doesn't matter, but keep track of which is which!
 * 
 * Example MAC: 24:6F:28:AE:C4:40
 * In code: {0x24, 0x6F, 0x28, 0xAE, 0xC4, 0x40}
 */
uint8_t slave_macs[MAX_SLAVES][6] = {
  //{d4:8c:49:f8:40:6c}, // ESP32_MASTER
  {F0:24:f9:04:01:58},  // ESP32_1
  {f0:24:f9:f5:66:70},  // ESP32_2 
  {d4:8c:49:f8:40:d0},  // ESP32_3 
  {d4:8c:49:f8:40:6c},  // ESP32_4 
  {d4:8c:49:f8:40:d0},  // ESP32_5 
  {84:0d:8e:e6:69:7c}   // ESP32_6
  // {0x24, 0x6F, 0x28, 0xAE, 0xC4, 0x45}   // ESP32_7 EDIT THIS 
  // {0x24, 0x6F, 0x28, 0xAE, 0xC4, 0x45}   // ESP32_8 EDIT THIS
};

// ==================== DATA STRUCTURES ====================

/*
 * ESP-NOW Message Structure - FULL VERSION
 * This is the complete "packet" of data we send to slave ESP32s.
 * Both master and slaves must use EXACTLY the same structure!
 * 
 * Think of it like a form that both sender and receiver understand:
 * - deviceId: Which ESP32 should act (0 = all, 1-6 = specific device)
 * - angle: Servo position (0-180 degrees) - optional, slaves can ignore if not needed
 * - direction: Animation direction (0=up/reverse, 1=down/forward)
 * - speed: How fast to animate (0-255) - optional, slaves can ignore if not needed
 * - interval: Timing between animations (milliseconds) - THIS IS THE KEY DATA!
 * - delay_offset: Stagger timing for this specific device (milliseconds)
 * - timestamp: When this command was sent (for debugging)
 */
typedef struct {
  int deviceId;              // Target device: 0=broadcast to all, 1-6=specific device
  int angle;                 // Servo angle: 0-180 degrees (optional - slaves can ignore)
  int direction;             // Direction: 0=up/reverse, 1=down/forward  
  int speed;                 // Animation speed: 0-255 (optional - slaves can ignore)
  unsigned long interval;    // KEY: Timing between animations (milliseconds)
  unsigned long delay_offset; // KEY: Device-specific timing offset (milliseconds)
  unsigned long timestamp;   // When command was created (for debugging)
} esp_now_message_t;

/*
 * ALTERNATIVE: Simple Timing-Only Structure
 * 
 * If your slaves only need timing data and don't care about angles/speed and handle that stuff on their own,
 * you can use a simpler structure that only contains the timing information.
 * You can replace the above struct with this simpler version if needed:
 * 
 * typedef struct {
 *   int deviceId;              // Target device: 0=all, 1-6=specific device
 *   int direction;             // Direction: 0=up/reverse, 1=down/forward
 *   unsigned long interval;    // Timing between animations (milliseconds)
 * } esp_now_timing_message_t;
 * 
 * To use this version:
 * 1. Swap these two structs in the code
 * 2. Replace all "esp_now_message_t" with "esp_now_timing_message_t" in the code
 * 3. Update the slaves to use the same timing-only struct
 */

// ==================== GLOBAL VARIABLES ====================

// Communication objects
WebSocketsClient webSocket;           // Handles connection to Node.js server

// Connection status flags
bool wifi_connected = false;          // True when connected to WiFi
bool websocket_connected = false;     // True when connected to WebSocket server

// Serial communication variables (for Serial mode)
String serialInputString = "";        // String to hold incoming serial data
bool serialStringComplete = false;    // Whether the serial string is complete

// Timing variables (ESP32 doesn't have delay() in main loop - bad practice!)
unsigned long last_heartbeat = 0;         // Last time we sent "I'm alive" message
unsigned long last_reconnect_attempt = 0; // Last time we tried to reconnect
const unsigned long heartbeat_interval = 30000;   // Send heartbeat every 30 seconds
const unsigned long reconnect_interval = 5000;    // Try reconnecting every 5 seconds

// Last received data for fallback behavior
esp_now_message_t lastMessage = {0, 90, 0, 100, 1000, 0, 0}; // Default safe values





// ==================== SETUP ====================

void setup() {
  // Start serial communication for debugging
  Serial.begin(USE_WEBSOCKET ? 115200 : serial_baud);
  delay(1000);  // Give serial monitor time to connect
  
  Serial.println("\n" + String("=").repeat(50));
  Serial.println("ESP32 ESP-NOW Master Controller Starting...");
  Serial.println("Device Role: Master Controller");
  Serial.println("Communication Mode: " + String(USE_WEBSOCKET ? "WiFi WebSocket" : "Serial USB"));
  Serial.println("ESP-NOW Protocol: Enabled");
  Serial.println("Max Slaves: " + String(MAX_SLAVES));
  Serial.println(String("=").repeat(50));
  
  // Step 1: Initialize ESP-NOW (always needed for talking to slave ESP32s)
  Serial.println("\n[STEP 1] Setting up ESP-NOW communication...");
  setupESPNOW();
  
  if (USE_WEBSOCKET) {
    // Step 2A: Connect to WiFi (needed for WebSocket to Node.js)
    Serial.println("\n[STEP 2A] Setting up WiFi connection...");
    setupWiFi();
    
    // Step 3A: Connect to Node.js server via WebSocket
    Serial.println("\n[STEP 3A] Setting up WebSocket connection...");
    setupWebSocket();
  } else {
    // Step 2B: Setup Serial communication
    Serial.println("\n[STEP 2B] Setting up Serial communication...");
    Serial.println("Serial baud rate: " + String(serial_baud));
    Serial.println("Expecting format: 'angle,direction\\n' (same as Motor Control sketch)");
    Serial.println("Example: '90,1' means angle=90°, direction=forward");
  }
  
  Serial.println("\n" + String("=").repeat(50));
  Serial.println("Setup Complete! Master is ready to receive commands.");
  if (USE_WEBSOCKET) {
    Serial.println("Waiting for scroll data from Node.js server via WebSocket...");
  } else {
    Serial.println("Waiting for commands via Serial (format: angle,direction)...");
  }
  Serial.println(String("=").repeat(50) + "\n");
}

// ==================== LOOP ====================

void loop() {
  // Main program loop - this runs continuously
  
  if (USE_WEBSOCKET) {
    // WebSocket Mode: Handle WebSocket communication
    webSocket.loop();
    
    // Check if WiFi connection is still alive
    if (WiFi.status() != WL_CONNECTED) {
      wifi_connected = false;
      websocket_connected = false;
      
      // Try to reconnect (but not too often - every 5 seconds)
      if (millis() - last_reconnect_attempt > reconnect_interval) {
        Serial.println("\n[WARNING] WiFi disconnected! Attempting reconnection...");
        setupWiFi();
        last_reconnect_attempt = millis();
      }
    }
    
    // Send periodic "I'm alive" message to server (every 30 seconds)
    if (websocket_connected && millis() - last_heartbeat > heartbeat_interval) {
      sendHeartbeat();
      last_heartbeat = millis();
    }
    
  } else {
    // Serial Mode: Handle serial communication
    handleSerialInput();
  }
  
  // Small delay to prevent overwhelming the CPU
  delay(10);
}

// ==================== CUSTOM FUNCTIONS ====================

/*
 * WiFi Setup Function
 * Connects the master ESP32 to your WiFi network so it can reach the Node.js server
 */
void setupWiFi() {
  Serial.print("Connecting to WiFi network: ");
  Serial.println(ssid);
  Serial.println("Please wait...");
  
  // Start WiFi connection
  WiFi.begin(ssid, password);
  
  // Wait for connection (maximum 10 seconds)
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifi_connected = true;
    Serial.println("\n WiFi connected successfully!");
    Serial.println("Network details:");
    Serial.println("   IP address: " + WiFi.localIP().toString());
    Serial.println("   MAC address: " + WiFi.macAddress());
    Serial.println("   Signal strength: " + String(WiFi.RSSI()) + " dBm");
  } else {
    Serial.println("\nWiFi connection failed!");
    Serial.println("Troubleshooting tips:");
    Serial.println("   1. Check WiFi name and password in code");
    Serial.println("   2. Make sure you're close to the router");
    Serial.println("   3. Verify the network is 2.4GHz (ESP32 doesn't support 5GHz)");
    wifi_connected = false;
  }
}

/*
 * ESP-NOW Setup Function
 * This is where the magic happens! Sets up ESP-NOW to talk to slave ESP32s
 */
void setupESPNOW() {
  Serial.println("Initializing ESP-NOW communication...");
  
  // IMPORTANT: ESP32 must be in AP+STA mode for ESP-NOW to work properly
  // AP = Access Point mode (can create its own network)
  // STA = Station mode (can connect to WiFi)
  // ESP-NOW needs both modes active simultaneously
  WiFi.mode(WIFI_AP_STA);
  Serial.println("Set WiFi mode to AP+STA (required for ESP-NOW)");
  
  // Initialize the ESP-NOW protocol
  if (esp_now_init() != ESP_OK) {
    Serial.println("ERROR: ESP-NOW initialization failed!");
    Serial.println("Try restarting the ESP32");
    return;
  }
  Serial.println(" ESP-NOW protocol initialized");
  
  // Register callback function for when we send data
  // This tells us if our message was successfully delivered
  esp_now_register_send_cb(onDataSent);
  Serial.println("Registered send callback function");
  
  // Add each slave ESP32 as a "peer" (friend we can talk to)
  Serial.println("Adding slave ESP32s as peers...");
  for (int i = 0; i < MAX_SLAVES; i++) {
    esp_now_peer_info_t peerInfo;
    memcpy(peerInfo.peer_addr, slave_macs[i], 6);  // Copy MAC address
    peerInfo.channel = ESPNOW_CHANNEL;              // Set communication channel
    peerInfo.encrypt = false;                       // No encryption for simplicity
    
    // Try to add this peer
    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
      Serial.println("Failed to add ESP32_" + String(i + 1));
      Serial.println("Check MAC address in slave_macs array");
    } else {
      Serial.print("Added ESP32_" + String(i + 1) + " (MAC: ");
      printMACAddress(slave_macs[i]);
      Serial.println(")");
    }
  }
  Serial.println();
  Serial.println();
  Serial.println("ESP-NOW setup complete! Ready to communicate with slaves.");
}

/*
 * WebSocket Setup Function
 * Connects to the Node.js server so we can receive scroll commands
 */
void setupWebSocket() {
  if (!wifi_connected) {
    Serial.println("Cannot setup WebSocket - WiFi not connected");
    return;
  }
  
  Serial.println("Setting up WebSocket connection to Node.js server...");
  
  // Configure WebSocket client
  webSocket.begin(websocket_server, websocket_port, websocket_path);
  webSocket.onEvent(webSocketEvent);            // Set callback function
  webSocket.setReconnectInterval(5000);         // Auto-reconnect every 5 seconds
  
  Serial.println("WebSocket configuration:");
  Serial.println("   Server: " + String(websocket_server));
  Serial.println("   Port: " + String(websocket_port));
  Serial.println("   Path: " + String(websocket_path));
  Serial.println("   Full URL: ws://" + String(websocket_server) + ":" + String(websocket_port) + String(websocket_path));
  Serial.println("Connecting...");
}

/*
 * WebSocket Event Handler
 * This function is called automatically when WebSocket events happen
 * (connect, disconnect, receive message, error, etc.)
 */
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("[WebSocket] Disconnected from server");
      websocket_connected = false;
      break;
      
    case WStype_CONNECTED:
      Serial.print("[WebSocket] Connected to server: ");
      Serial.println((char*)payload);
      websocket_connected = true;
      
      // Tell the server we're the master controller
      registerDevice();
      break;
      
    case WStype_TEXT:
      Serial.print("[WebSocket] Received message: ");
      Serial.println((char*)payload);
      
      // Process the incoming command
      handleWebSocketMessage((char*)payload);
      break;
      
    case WStype_ERROR:
      Serial.print("[WebSocket] Error: ");
      Serial.println((char*)payload);
      websocket_connected = false;
      break;
      
    default:
      // Other event types (binary, ping, pong) - we don't need these
      break;
  }
}

/*
 * Device Registration Function
 * Tells the Node.js server that we're the master controller
 */
void registerDevice() {
  Serial.println("Registering as master device with server...");
  
  // Create JSON message using Arduino_JSON library
  JSONVar registration;
  registration["type"] = "register";
  registration["deviceId"] = "esp32_master";
  registration["role"] = "master";
  registration["slaves"] = MAX_SLAVES;
  registration["timestamp"] = millis();
  
  // Convert JSON to string and send
  String message = JSON.stringify(registration);
  webSocket.sendTXT(message);
  
  Serial.println("Registration sent: " + message);
}

/*
 * Heartbeat Function
 * Sends periodic "I'm alive" messages to the server
 */
void sendHeartbeat() {
  if (!websocket_connected) return;
  
  // Create heartbeat JSON message
  JSONVar heartbeat;
  heartbeat["type"] = "heartbeat";
  heartbeat["deviceId"] = "esp32_master";
  heartbeat["timestamp"] = millis();
  heartbeat["wifi_rssi"] = WiFi.RSSI();         // Include WiFi signal strength
  heartbeat["free_heap"] = ESP.getFreeHeap();   // Include memory usage
  
  String message = JSON.stringify(heartbeat);
  webSocket.sendTXT(message);
  
  Serial.println("Heartbeat sent (Signal: " + String(WiFi.RSSI()) + " dBm, Free RAM: " + String(ESP.getFreeHeap()) + " bytes)");
}

/*
 * Handle incoming WebSocket messages
 * Parses JSON messages from Node.js server and converts them to ESP-NOW commands
 */
void handleWebSocketMessage(const char* message) {
  Serial.print("[WebSocket] Processing message: ");
  Serial.println(message);
  
  // Parse JSON using Arduino_JSON library
  JSONVar messageObj = JSON.parse(message);
  
  // Check if parsing was successful
  if (JSON.typeof(messageObj) == "undefined") {
    Serial.println("[JSON] Parse error - invalid JSON");
    return;
  }
  
  // Get message type
  String messageType = messageObj["type"];
  Serial.println("Message type: " + messageType);
  
  if (messageType == "scroll_data") {
    // Extract scroll data and convert to ESP-NOW format
    int angle = messageObj["angle"];
    int direction = messageObj["direction"]; 
    int speed = messageObj["speed"] | 100;  // Default to 100 if not provided
    
    // Convert scroll data to timing-focused ESP-NOW message
    // You can customize this mapping based on your needs
    unsigned long interval = 1000;  // Default 1 second interval
    unsigned long base_delay = 100; // Base delay between devices
    
    Serial.println("   Converting scroll data to timing commands:");
    Serial.println("   Angle: " + String(angle) + "°");
    Serial.println("   Direction: " + String(direction ? "forward" : "reverse"));
    Serial.println("   Speed: " + String(speed));
    Serial.println("   Interval: " + String(interval) + "ms");
    
    // Broadcast to all slaves with staggered timing
    broadcastTimingToSlaves(0, angle, direction, speed, interval, base_delay);
    
  } else if (messageType == "device_command") {
    // Command for specific device
    int deviceId = messageObj["deviceId"];
    int angle = messageObj["angle"];
    int direction = messageObj["direction"];
    int speed = messageObj["speed"] | 100;
    unsigned long interval = messageObj["interval"] | 1000;
    unsigned long delay_offset = messageObj["delay_offset"] | 0;
    
    Serial.println("   Device-specific command:");
    Serial.println("   Target: ESP32_" + String(deviceId));
    Serial.println("   Angle: " + String(angle) + "°");
    Serial.println("   Direction: " + String(direction ? "forward" : "reverse"));
    Serial.println("   Interval: " + String(interval) + "ms");
    Serial.println("   Delay offset: " + String(delay_offset) + "ms");
    
    sendTimingToDevice(deviceId, angle, direction, speed, interval, delay_offset);
  }
}

/*
 * Handle Serial Input (when USE_WEBSOCKET = false)
 * Parses commands in format "angle,direction" same as Motor Control sketch
 */
void handleSerialInput() {
  // Read serial data
  while (Serial.available()) {
    char inChar = (char)Serial.read();
    
    // Add valid characters to input string
    if (inChar >= 32 && inChar <= 126) {  // Printable ASCII characters
      serialInputString += inChar;
    }
    
    // Check for end of command
    if (inChar == '\n') {
      serialStringComplete = true;
    }
  }
  
  // Process complete command
  if (serialStringComplete) {
    Serial.println("[Serial] Received command: " + serialInputString);
    
    // Parse the command (format: "angle,direction")
    int commaIndex = serialInputString.indexOf(',');
    if (commaIndex != -1) {
      String angleStr = serialInputString.substring(0, commaIndex);
      String dirStr = serialInputString.substring(commaIndex + 1);
      
      int angle = angleStr.toInt();
      int direction = dirStr.toInt();
      
      // Validate the parsed values (same validation as Motor Control sketch)
      if (angle >= 0 && angle <= 180 && (direction == 0 || direction == 1)) {
        Serial.println("[Serial] Valid command - Angle: " + String(angle) + "°, Direction: " + String(direction ? "forward" : "reverse"));
        
        // Convert to timing command and broadcast to all slaves
        unsigned long interval = 1000;  // Default 1 second interval
        unsigned long base_delay = 100; // Base delay between devices
        
        broadcastTimingToSlaves(0, angle, direction, 100, interval, base_delay);
      } else {
        Serial.println("[Serial] Invalid values - Angle must be 0-180, Direction must be 0 or 1");
      }
    } else {
      Serial.println("[Serial] Invalid format - Expected 'angle,direction'");
    }
    
    // Clear for next command
    serialInputString = "";
    serialStringComplete = false;
  }
}

// ==================== ESP-NOW COMMUNICATION FUNCTIONS ====================

/*
 * Broadcast timing data to all slaves with staggered delays
 * This is the main function that sends timing information to all ESP32 slaves
 */
void broadcastTimingToSlaves(int deviceId, int angle, int direction, int speed, unsigned long interval, unsigned long base_delay) {
  Serial.println("\n [ESP-NOW] Broadcasting timing data to all slaves:");
  Serial.println("   Angle: " + String(angle) + "°");
  Serial.println("   Direction: " + String(direction ? "forward" : "reverse"));
  Serial.println("   Base interval: " + String(interval) + "ms");
  Serial.println("   Base delay: " + String(base_delay) + "ms");
  
  // Send to each slave with increasing delay offset
  for (int i = 0; i < MAX_SLAVES; i++) {
    unsigned long device_delay = base_delay * i;  // Stagger timing: 0ms, 100ms, 200ms, etc.
    
    Serial.println("Sending to ESP32_" + String(i + 1) + " with " + String(device_delay) + "ms offset");
    sendTimingToDevice(i + 1, angle, direction, speed, interval, device_delay);
    
    delay(10);  // Small delay between transmissions to avoid ESP-NOW conflicts
  }
  
  // Store as last known good command for fallback
  lastMessage.deviceId = deviceId;
  lastMessage.angle = angle;
  lastMessage.direction = direction;
  lastMessage.speed = speed;
  lastMessage.interval = interval;
  lastMessage.delay_offset = base_delay;
  lastMessage.timestamp = millis();
  
  Serial.println("[ESP-NOW] Broadcast complete!");
}

/*
 * Send timing data to a specific slave device
 * deviceId: 1-6 for specific device
 */
void sendTimingToDevice(int deviceId, int angle, int direction, int speed, unsigned long interval, unsigned long delay_offset) {
  if (deviceId < 1 || deviceId > MAX_SLAVES) {
    Serial.println("[ESP-NOW] Invalid device ID: " + String(deviceId) + " (must be 1-" + String(MAX_SLAVES) + ")");
    return;
  }
  
  // Create the message
  esp_now_message_t message;
  message.deviceId = deviceId;
  message.angle = angle;
  message.direction = direction;
  message.speed = speed;
  message.interval = interval;
  message.delay_offset = delay_offset;
  message.timestamp = millis();
  
  // Send to the specific device
  esp_err_t result = esp_now_send(slave_macs[deviceId - 1], (uint8_t*)&message, sizeof(message));
  
  if (result == ESP_OK) {
    Serial.println("[ESP-NOW] Message sent to ESP32_" + String(deviceId));
  } else {
    Serial.println("[ESP-NOW] Send failed to ESP32_" + String(deviceId) + " (Error: " + String(result) + ")");
  }
}

/*
 * ESP-NOW Send Callback
 * This function is called automatically when ESP-NOW tries to send data
 * It tells us if our message was successfully delivered
 */
void onDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  // Find which device this MAC address belongs to
  String deviceName = "Unknown";
  for (int i = 0; i < MAX_SLAVES; i++) {
    if (memcmp(mac_addr, slave_macs[i], 6) == 0) {
      deviceName = "ESP32_" + String(i + 1);
      break;
    }
  }
  
  if (status == ESP_NOW_SEND_SUCCESS) {
    Serial.println(" [ESP-NOW] Delivery confirmed to " + deviceName);
  } else {
    Serial.println("[ESP-NOW] Delivery failed to " + deviceName);
    Serial.println("Tip: Check if the slave is powered on and within range");
  }
}

/*
 * Helper function to print MAC addresses in readable format
 */
void printMACAddress(uint8_t* mac) {
  for (int i = 0; i < 6; i++) {
    if (mac[i] < 16) Serial.print("0");
    Serial.print(mac[i], HEX);
    if (i < 5) Serial.print(":");
  }
}

// ==================== LEGACY/COMPATIBILITY FUNCTIONS ====================
// These functions maintain compatibility with older code

/*
 * Legacy function for simple broadcasts (compatibility)
 * Use broadcastTimingToSlaves() for new code
 */
void broadcastToSlaves(int deviceId, int angle, int direction, int speed) {
  // Convert to timing-based call with default values
  unsigned long default_interval = 1000;  // 1 second
  unsigned long default_delay = 100;      // 100ms stagger
  
  broadcastTimingToSlaves(deviceId, angle, direction, speed, default_interval, default_delay);
}

/*
 * Legacy function for single device commands (compatibility)
 * Use sendTimingToDevice() for new code
 */
void sendToDevice(int deviceId, int angle, int direction, int speed) {
  // Convert to timing-based call with default values
  unsigned long default_interval = 1000;  // 1 second
  unsigned long default_delay = 0;        // No offset for single device
  
  sendTimingToDevice(deviceId, angle, direction, speed, default_interval, default_delay);
}
