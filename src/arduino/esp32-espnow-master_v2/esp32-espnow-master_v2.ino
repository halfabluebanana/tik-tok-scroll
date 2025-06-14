#include <WiFi.h>
#include <WebSocketsClient.h>
#include <Arduino_JSON.h>
#include <esp_now.h>

// ==================== CONFIGURATION SECTION ====================

// Communication Mode Selection
const bool USE_WEBSOCKET = false;  // Change to false for Serial mode

// WiFi Configuration
const char* ssid = "MIFI-70F9";
const char* password = "12345678";

// Node.js Server Configuration
const char* websocket_server = "192.168.0.199";
const int websocket_port = 3001;
const char* websocket_path = "/esp32";

// Serial Configuration
const int serial_baud = 9600;

// ESP-NOW Configuration
#define MAX_SLAVES 6
#define ESPNOW_CHANNEL 1
#define BROADCAST_INTERVAL 100  // ms between broadcasts
#define CASCADE_DELAY 50       // ms delay between each slave

// MAC addresses of slave ESP32s
uint8_t slave_macs[MAX_SLAVES][6] = {
  {0xF0, 0x24, 0xF9, 0x04, 0x01, 0x58},  // ESP32_1
  {0xF0, 0x24, 0xF9, 0xF5, 0x66, 0x70},  // ESP32_2 
  {0xD4, 0x8C, 0x49, 0xF8, 0x40, 0xD0},  // ESP32_3 
  {0xD4, 0x8C, 0x49, 0xF8, 0x40, 0x6C},  // ESP32_4 
  {0xD4, 0x8C, 0x49, 0xF8, 0x40, 0xD0},  // ESP32_5 
  {0x84, 0x0D, 0x8E, 0xE6, 0x69, 0x7C}   // ESP32_6
};

// ESP-NOW Message Structure
typedef struct {
  int deviceId;              // Target device: 0=broadcast to all, 1-6=specific device
  int angle;                 // Servo angle: 0-180 degrees
  int direction;             // Direction: 0=up/reverse, 1=down/forward  
  int speed;                 // Animation speed: 0-255
  unsigned long interval;    // Timing between animations (milliseconds)
  unsigned long delay_offset; // Device-specific timing offset (milliseconds)
  unsigned long timestamp;   // When command was created (for debugging)
} esp_now_message_t;

// Global Variables
WebSocketsClient webSocket;
bool wifi_connected = false;
bool websocket_connected = false;
String serialInputString = "";
bool serialStringComplete = false;
unsigned long last_heartbeat = 0;
unsigned long last_reconnect_attempt = 0;
const unsigned long heartbeat_interval = 30000;
const unsigned long reconnect_interval = 5000;
esp_now_message_t lastMessage = {0, 90, 0, 100, 1000, 0, 0};

// Helper function to repeat strings
String repeatString(const char* str, int times) {
  String result = "";
  for(int i = 0; i < times; i++) {
    result += str;
  }
  return result;
}

// Send log to server
void sendLog(const char* type, const char* message) {
  JSONVar doc;
  doc["type"] = "log";
  doc["source"] = "master";
  doc["message"] = message;
  doc["timestamp"] = millis();
  
  String jsonString = JSON.stringify(doc);
  Serial.println(jsonString);
}

void setup() {
  Serial.begin(USE_WEBSOCKET ? 115200 : serial_baud);
  delay(1000);
  
  Serial.println("\n" + repeatString("=", 50));
  Serial.println("ESP32 ESP-NOW Master Controller Starting...");
  Serial.println("Device Role: Master Controller");
  Serial.println("Communication Mode: " + String(USE_WEBSOCKET ? "WiFi WebSocket" : "Serial USB"));
  Serial.println("ESP-NOW Protocol: Enabled");
  Serial.println("Max Slaves: " + String(MAX_SLAVES));
  Serial.println(repeatString("=", 50));
  
  setupESPNOW();
  
  if (USE_WEBSOCKET) {
    setupWiFi();
    setupWebSocket();
  } else {
    Serial.println("\n[STEP 2B] Setting up Serial communication...");
    Serial.println("Serial baud rate: " + String(serial_baud));
    Serial.println("Expecting format: 'angle,direction\\n'");
  }
  
  Serial.println("\n" + repeatString("=", 50));
  Serial.println("Setup Complete! Master is ready to receive commands.");
  Serial.println(repeatString("=", 50) + "\n");
}

void loop() {
  if (USE_WEBSOCKET) {
    webSocket.loop();
    
    if (WiFi.status() != WL_CONNECTED) {
      wifi_connected = false;
      websocket_connected = false;
      
      if (millis() - last_reconnect_attempt > reconnect_interval) {
        Serial.println("\n[WARNING] WiFi disconnected! Attempting reconnection...");
        setupWiFi();
        last_reconnect_attempt = millis();
      }
    }
    
    if (websocket_connected && millis() - last_heartbeat > heartbeat_interval) {
      sendHeartbeat();
      last_heartbeat = millis();
    }
  } else {
    handleSerialInput();
  }
  
  delay(10);
}

void setupWiFi() {
  Serial.print("Connecting to WiFi network: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifi_connected = true;
    Serial.println("\nWiFi connected successfully!");
    Serial.println("IP address: " + WiFi.localIP().toString());
  } else {
    Serial.println("\nWiFi connection failed!");
    wifi_connected = false;
  }
}

void setupESPNOW() {
  Serial.println("Initializing ESP-NOW communication...");
  
  WiFi.mode(WIFI_AP_STA);
  
  if (esp_now_init() != ESP_OK) {
    sendLog("error", "Error initializing ESP-NOW");
    return;
  }
  
  esp_now_register_send_cb(OnDataSent);
  
  for (int i = 0; i < MAX_SLAVES; i++) {
    esp_now_peer_info_t peerInfo;
    memcpy(peerInfo.peer_addr, slave_macs[i], 6);
    peerInfo.channel = ESPNOW_CHANNEL;
    peerInfo.encrypt = false;
    
    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
      char message[50];
      snprintf(message, sizeof(message), "Failed to add peer %d", i + 1);
      sendLog("error", message);
      return;
    } else {
      Serial.print("Added ESP32_" + String(i + 1) + " (MAC: ");
      printMACAddress(slave_macs[i]);
      Serial.println(")");
    }
  }
  
  sendLog("info", "ESP-NOW initialized");
  Serial.println(repeatString("=", 50));
}

void setupWebSocket() {
  if (!wifi_connected) return;
  
  webSocket.begin(websocket_server, websocket_port, websocket_path);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      websocket_connected = false;
      break;
      
    case WStype_CONNECTED:
      websocket_connected = true;
      registerDevice();
      break;
      
    case WStype_TEXT:
      handleWebSocketMessage((char*)payload);
      break;
      
    case WStype_ERROR:
      websocket_connected = false;
      break;
  }
}

void registerDevice() {
  JSONVar registration;
  registration["type"] = "register";
  registration["deviceId"] = "esp32_master";
  registration["role"] = "master";
  registration["slaves"] = MAX_SLAVES;
  registration["timestamp"] = millis();
  
  String message = JSON.stringify(registration);
  webSocket.sendTXT(message);
}

void sendHeartbeat() {
  if (!websocket_connected) return;
  
  JSONVar heartbeat;
  heartbeat["type"] = "heartbeat";
  heartbeat["deviceId"] = "esp32_master";
  heartbeat["timestamp"] = millis();
  heartbeat["wifi_rssi"] = WiFi.RSSI();
  heartbeat["free_heap"] = ESP.getFreeHeap();
  
  String message = JSON.stringify(heartbeat);
  webSocket.sendTXT(message);
}

void handleWebSocketMessage(const char* message) {
  JSONVar messageObj = JSON.parse(message);
  
  if (JSON.typeof(messageObj) == "undefined") {
    Serial.println("[JSON] Parse error - invalid JSON");
    return;
  }
  
  String messageType = messageObj["type"];
  
  if (messageType == "scroll_data") {
    int angle = messageObj["angle"];
    int direction = messageObj["direction"]; 
    int speed = messageObj.hasOwnProperty("speed") ? (int)messageObj["speed"] : 100;
    
    unsigned long interval = 1000;
    unsigned long base_delay = 100;
    
    broadcastTimingToSlaves(0, angle, direction, speed, interval, base_delay);
    
  } else if (messageType == "device_command") {
    int deviceId = messageObj["deviceId"];
    int angle = messageObj["angle"];
    int direction = messageObj["direction"];
    int speed = messageObj.hasOwnProperty("speed") ? (int)messageObj["speed"] : 100;
    unsigned long interval = messageObj.hasOwnProperty("interval") ? (unsigned long)messageObj["interval"] : 1000;
    unsigned long delay_offset = messageObj.hasOwnProperty("delay_offset") ? (unsigned long)messageObj["delay_offset"] : 0;
    
    sendTimingToDevice(deviceId, angle, direction, speed, interval, delay_offset);
  }
}

void handleSerialInput() {
  while (Serial.available()) {
    char inChar = (char)Serial.read();
    
    if (inChar >= 32 && inChar <= 126) {
      serialInputString += inChar;
    }
    
    if (inChar == '\n') {
      serialStringComplete = true;
    }
  }
  
  if (serialStringComplete) {
    Serial.println("\n[Serial] Received command: " + serialInputString);
    
    // Parse JSON input
    JSONVar input = JSON.parse(serialInputString);
    
    // Check if parsing was successful
    if (JSON.typeof(input) == "undefined") {
      Serial.println("[Serial] Error: Invalid JSON format");
      Serial.println("Expected format: {\"deviceId\":0,\"angle\":90,\"direction\":1,\"speed\":100,\"interval\":1000,\"delay_offset\":0}");
      serialInputString = "";
      serialStringComplete = false;
      return;
    }
    
    // Extract and validate deviceId
    int deviceId = input.hasOwnProperty("deviceId") ? (int)input["deviceId"] : 0;
    if (deviceId < 0 || deviceId > MAX_SLAVES) {
      Serial.println("[Serial] Error: Invalid deviceId (must be 0-" + String(MAX_SLAVES) + ")");
      serialInputString = "";
      serialStringComplete = false;
      return;
    }
    
    // Extract and validate angle
    int angle = input.hasOwnProperty("angle") ? (int)input["angle"] : 90;
    if (angle < 0 || angle > 180) {
      Serial.println("[Serial] Error: Invalid angle (must be 0-180)");
      serialInputString = "";
      serialStringComplete = false;
      return;
    }
    
    // Extract and validate direction
    int direction = input.hasOwnProperty("direction") ? (int)input["direction"] : 0;
    if (direction != 0 && direction != 1) {
      Serial.println("[Serial] Error: Invalid direction (must be 0 or 1)");
      serialInputString = "";
      serialStringComplete = false;
      return;
    }
    
    // Extract and validate speed
    int speed = input.hasOwnProperty("speed") ? (int)input["speed"] : 100;
    if (speed < 0 || speed > 255) {
      Serial.println("[Serial] Error: Invalid speed (must be 0-255)");
      serialInputString = "";
      serialStringComplete = false;
      return;
    }
    
    // Extract and validate interval
    unsigned long interval = input.hasOwnProperty("interval") ? (unsigned long)input["interval"] : 1000;
    if (interval < 10 || interval > 10000) {
      Serial.println("[Serial] Error: Invalid interval (must be 10-10000ms)");
      serialInputString = "";
      serialStringComplete = false;
      return;
    }
    
    // Extract and validate delay_offset
    unsigned long delay_offset = input.hasOwnProperty("delay_offset") ? (unsigned long)input["delay_offset"] : 0;
    if (delay_offset > 5000) {
      Serial.println("[Serial] Error: Invalid delay_offset (must be 0-5000ms)");
      serialInputString = "";
      serialStringComplete = false;
      return;
    }
    
    // All validations passed, print command details
    Serial.println("[Serial] Valid command:");
    Serial.println("   Device ID: " + String(deviceId) + (deviceId == 0 ? " (broadcast)" : ""));
    Serial.println("   Angle: " + String(angle) + "°");
    Serial.println("   Direction: " + String(direction ? "forward" : "reverse"));
    Serial.println("   Speed: " + String(speed));
    Serial.println("   Interval: " + String(interval) + "ms");
    Serial.println("   Delay offset: " + String(delay_offset) + "ms");
    
    // Send command to slaves
    if (deviceId == 0) {
      Serial.println("[Serial] Broadcasting to all slaves...");
      broadcastTimingToSlaves(deviceId, angle, direction, speed, interval, delay_offset);
    } else {
      Serial.println("[Serial] Sending to device " + String(deviceId) + "...");
      sendTimingToDevice(deviceId, angle, direction, speed, interval, delay_offset);
    }
    
    serialInputString = "";
    serialStringComplete = false;
  }
}

void broadcastTimingToSlaves(int deviceId, int angle, int direction, int speed, unsigned long interval, unsigned long base_delay) {
  for (int i = 0; i < MAX_SLAVES; i++) {
    unsigned long device_delay = base_delay * i;
    sendTimingToDevice(i + 1, angle, direction, speed, interval, device_delay);
    delay(10);
  }
  
  lastMessage.deviceId = deviceId;
  lastMessage.angle = angle;
  lastMessage.direction = direction;
  lastMessage.speed = speed;
  lastMessage.interval = interval;
  lastMessage.delay_offset = base_delay;
  lastMessage.timestamp = millis();
}

void sendTimingToDevice(int deviceId, int angle, int direction, int speed, unsigned long interval, unsigned long delay_offset) {
  if (deviceId < 1 || deviceId > MAX_SLAVES) return;
  
  esp_now_message_t message;
  message.deviceId = deviceId;
  message.angle = angle;
  message.direction = direction;
  message.speed = speed;
  message.interval = interval;
  message.delay_offset = delay_offset;
  message.timestamp = millis();
  
  esp_err_t result = esp_now_send(slave_macs[deviceId - 1], (uint8_t*)&message, sizeof(message));
}

void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  char macStr[18];
  snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
           mac_addr[0], mac_addr[1], mac_addr[2], mac_addr[3], mac_addr[4], mac_addr[5]);
  
  char message[100];
  snprintf(message, sizeof(message), "Sent to %s: %s", 
           macStr, status == ESP_NOW_SEND_SUCCESS ? "Success" : "Fail");
  sendLog("info", message);
}

void printMACAddress(uint8_t* mac) {
  for (int i = 0; i < 6; i++) {
    if (mac[i] < 16) Serial.print("0");
    Serial.print(mac[i], HEX);
    if (i < 5) Serial.print(":");
  }
} 