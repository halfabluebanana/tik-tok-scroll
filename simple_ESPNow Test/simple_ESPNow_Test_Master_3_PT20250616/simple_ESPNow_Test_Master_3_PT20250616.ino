#include <WiFi.h>
#include <esp_now.h>
#include <Arduino_JSON.h>

// Structure to send data
typedef struct struct_message {
  uint8_t deviceId;
  int16_t angle;
  int8_t direction;
  float speed;
  uint16_t interval;
} struct_message;

struct_message outgoingData;

// MAC addresses of the Slave ESP32s
uint8_t slaveAddresses[][6] = {
  {0xF0, 0x24, 0xF9, 0x04, 0x01, 0x58},  // ESP32_1 (deviceId = 1)
  {0xF0, 0x24, 0xF9, 0xF5, 0x66, 0x70},  // ESP32_2 (deviceId = 2)
  {0xD0, 0xEF, 0x76, 0x7A, 0x35, 0x40}   // ESP32_4 (deviceId = 4)
};

// Device ID mapping for each slave
const uint8_t slaveDeviceIds[] = {1, 2, 4};  // Corresponding device IDs for each slave
const int numSlaves = 3;

// Serial data handling
String serialBuffer = "";
bool serialDataReady = false;

// Default values (fallback) - will be randomized
int defaultAngle = 90;
int defaultDirection = 1;
float defaultSpeed = 1.5;
int defaultInterval = 100;

// Function to generate random fallback values
void generateRandomFallbacks() {
  defaultAngle = random(45, 136);  // Random angle between 45-135 degrees
  defaultDirection = random(0, 2);  // Random direction 0 or 1
  defaultSpeed = random(50, 200) / 100.0;  // Random speed between 0.5-2.0
  defaultInterval = random(80, 150);  // Random interval between 80-150ms
}

void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  char macStr[18];
  snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
           mac_addr[0], mac_addr[1], mac_addr[2], mac_addr[3], mac_addr[4], mac_addr[5]);
  
  Serial.println("\n=== Sending Data ===");
  Serial.print("To MAC: ");
  Serial.println(macStr);
  Serial.print("Status: ");
  Serial.println(status == ESP_NOW_SEND_SUCCESS ? "Delivery Success" : "Delivery Fail");
  
  // Create JSON object for transmission log
  JSONVar logData;
  logData["status"] = status == ESP_NOW_SEND_SUCCESS ? "success" : "fail";
  logData["mac"] = macStr;
  
  JSONVar dataObj;
  dataObj["deviceId"] = outgoingData.deviceId;
  dataObj["angle"] = outgoingData.angle;
  dataObj["direction"] = outgoingData.direction;
  dataObj["speed"] = outgoingData.speed;
  dataObj["interval"] = outgoingData.interval;
  
  logData["data"] = dataObj;
  
  // Log transmission to server
  Serial.print("LOG_TRANSMISSION:master,");
  Serial.println(JSON.stringify(logData));
}

// Logging function to send messages back to server
void logToServer(String type, String message) {
  JSONVar logData;
  logData["type"] = type;
  logData["message"] = message;
  logData["timestamp"] = millis();
  logData["device"] = "master";
  
  Serial.print("LOG_MASTER:");
  Serial.println(JSON.stringify(logData));
}

// Function to find slave index by device ID
int findSlaveIndex(uint8_t deviceId) {
  for (int i = 0; i < numSlaves; i++) {
    if (slaveDeviceIds[i] == deviceId) {
      return i;
    }
  }
  return -1; // Not found
}

// Function to send data to specific slave or broadcast
void sendToSlaves(uint8_t targetDeviceId, int16_t angle, int8_t direction, float speed, uint16_t interval) {
  if (targetDeviceId == 0) {
    // Broadcast to all slaves
    logToServer("broadcast", "Sending data to all slaves");
    
    for (int i = 0; i < numSlaves; i++) {
      outgoingData.deviceId = slaveDeviceIds[i];
      outgoingData.angle = angle;
      outgoingData.direction = direction;
      outgoingData.speed = speed;
      outgoingData.interval = interval;

      esp_err_t result = esp_now_send(slaveAddresses[i], (uint8_t *) &outgoingData, sizeof(outgoingData));
      
      if (result == ESP_OK) {
        logToServer("success", "Sent to device " + String(slaveDeviceIds[i]));
      } else {
        logToServer("error", "Failed to send to device " + String(slaveDeviceIds[i]) + " - Error: " + String(result));
      }
    }
  } else {
    // Send to specific slave
    int slaveIndex = findSlaveIndex(targetDeviceId);
    if (slaveIndex >= 0) {
      outgoingData.deviceId = targetDeviceId;
      outgoingData.angle = angle;
      outgoingData.direction = direction;
      outgoingData.speed = speed;
      outgoingData.interval = interval;

      esp_err_t result = esp_now_send(slaveAddresses[slaveIndex], (uint8_t *) &outgoingData, sizeof(outgoingData));
      
      if (result == ESP_OK) {
        logToServer("success", "Sent to specific device " + String(targetDeviceId));
      } else {
        logToServer("error", "Failed to send to device " + String(targetDeviceId) + " - Error: " + String(result));
      }
    } else {
      logToServer("error", "Device ID " + String(targetDeviceId) + " not found");
    }
  }
}

// Function to handle incoming serial data
void handleSerialData() {
  while (Serial.available()) {
    char incomingChar = Serial.read();
    
    if (incomingChar == '\n' || incomingChar == '\r') {
      if (serialBuffer.length() > 0) {
        serialDataReady = true;
        break;
      }
    } else {
      serialBuffer += incomingChar;
    }
  }
}

// Function to process received JSON data
void processSerialData() {
  if (!serialDataReady || serialBuffer.length() == 0) {
    return;
  }
  
  logToServer("received", "Processing serial data: " + serialBuffer.substring(0, 100) + (serialBuffer.length() > 100 ? "..." : ""));
  
  // Parse JSON
  JSONVar jsonData = JSON.parse(serialBuffer);
  
  if (JSON.typeof(jsonData) == "undefined") {
    logToServer("error", "Failed to parse JSON data - using random fallback values");
    generateRandomFallbacks();
    // Use random fallback values
    sendToSlaves(0, defaultAngle, defaultDirection, defaultSpeed, defaultInterval);
    serialBuffer = "";
    serialDataReady = false;
    return;
  }
  
  // Extract values with defaults
  String type = JSON.stringify(jsonData["type"]);
  type.replace("\"", ""); // Remove quotes
  
  if (type != "scroll_data") {
    logToServer("warning", "Unknown data type: " + type + " - using random fallback values");
    generateRandomFallbacks();
    // Use random fallback values
    sendToSlaves(0, defaultAngle, defaultDirection, defaultSpeed, defaultInterval);
    serialBuffer = "";
    serialDataReady = false;
    return;
  }
  
  // Generate fresh random fallbacks for missing fields
  generateRandomFallbacks();
  
  uint8_t deviceId = jsonData.hasOwnProperty("deviceId") ? (int)jsonData["deviceId"] : 0;
  int16_t angle = jsonData.hasOwnProperty("angle") ? (int)jsonData["angle"] : defaultAngle;
  int8_t direction = jsonData.hasOwnProperty("direction") ? (int)jsonData["direction"] : defaultDirection;
  float speed = jsonData.hasOwnProperty("speed") ? (double)jsonData["speed"] : defaultSpeed;
  uint16_t interval = jsonData.hasOwnProperty("interval") ? (int)jsonData["interval"] : defaultInterval;
  
  // Validate ranges
  angle = constrain(angle, 0, 180);
  direction = constrain(direction, 0, 1);
  speed = constrain(speed, 0.0, 255.0);
  interval = constrain(interval, 50, 5000);
  
  logToServer("parsed", "DeviceID: " + String(deviceId) + ", Angle: " + String(angle) + ", Direction: " + String(direction) + ", Speed: " + String(speed) + ", Interval: " + String(interval));
  
  // Send data to slaves
  sendToSlaves(deviceId, angle, direction, speed, interval);
  
  // Clear buffer
  serialBuffer = "";
  serialDataReady = false;
}

void setup() {
  Serial.begin(115200);
  delay(1000); // Give some time for serial to initialize
  
  // Set device as a Wi-Fi Station
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100); // Give some time for disconnect
  
  // Print MAC address
  Serial.print("ESP32 Master MAC Address: ");
  Serial.println(WiFi.macAddress());
  
  logToServer("startup", "ESP32 Master initializing...");

  // Init ESP-NOW
  if (esp_now_init() != ESP_OK) {
    Serial.println("Error initializing ESP-NOW");
    logToServer("error", "Failed to initialize ESP-NOW");
    return;
  }
  Serial.println("ESP-NOW initialized successfully");
  logToServer("success", "ESP-NOW initialized successfully");

  // Register for a callback function that will be called when data is sent
  esp_now_register_send_cb(OnDataSent);

  // Register peers
  for (int i = 0; i < numSlaves; i++) {
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, slaveAddresses[i], 6);
    peerInfo.channel = 0;  
    peerInfo.encrypt = false;

    // Add peer        
    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
      Serial.print("Failed to add peer ");
      Serial.println(i);
      logToServer("error", "Failed to add peer " + String(i) + " (Device ID: " + String(slaveDeviceIds[i]) + ")");
      return;
    }
    Serial.print("Peer ");
    Serial.print(i);
    Serial.print(" (Device ID: ");
    Serial.print(slaveDeviceIds[i]);
    Serial.println(") added successfully");
    logToServer("success", "Added peer " + String(i) + " (Device ID: " + String(slaveDeviceIds[i]) + ")");
  }
  
  Serial.println("ESP32 Master initialized and ready to receive serial data");
  logToServer("ready", "ESP32 Master ready to receive serial data");
  
  // Initialize random seed
  randomSeed(analogRead(0) + millis());
  generateRandomFallbacks();
  logToServer("startup", "Random fallback values initialized");
}

void loop() {
  // Handle incoming serial data
  handleSerialData();
  
  // Process any complete serial messages
  processSerialData();
  
  // Small delay to prevent overwhelming the system
  delay(10);
}

// End of code


