#include <esp_now.h>
#include <WiFi.h>
#include <Arduino_JSON.h>

// Structure to receive data - must match the Master's structure
typedef struct struct_message {
  uint8_t deviceId;
  int16_t angle;
  int8_t direction;
  float speed;
  uint16_t interval;
} struct_message;

struct_message incomingReadings;

// Callback when data is received
void OnDataRecv(const esp_now_recv_info_t *esp_now_info, const uint8_t *incomingData, int len) {
  char macStr[18];
  snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
           esp_now_info->src_addr[0], esp_now_info->src_addr[1], esp_now_info->src_addr[2],
           esp_now_info->src_addr[3], esp_now_info->src_addr[4], esp_now_info->src_addr[5]);
  
  Serial.println("\n=== Received Data ===");
  Serial.print("From MAC: ");
  Serial.println(macStr);
  Serial.print("Length: ");
  Serial.println(len);
  
  // Copy the received data into our structure
  memcpy(&incomingReadings, incomingData, sizeof(incomingReadings));
  
  Serial.println("\nData Contents:");
  Serial.print("Device ID: ");
  Serial.println(incomingReadings.deviceId);
  Serial.print("Angle: ");
  Serial.println(incomingReadings.angle);
  Serial.print("Direction: ");
  Serial.println(incomingReadings.direction);
  Serial.print("Speed: ");
  Serial.println(incomingReadings.speed);
  Serial.print("Interval: ");
  Serial.println(incomingReadings.interval);
  Serial.println("==================\n");
  
  // Create JSON object for transmission log
  JSONVar logData;
  logData["mac"] = macStr;
  
  JSONVar dataObj;
  dataObj["deviceId"] = incomingReadings.deviceId;
  dataObj["angle"] = incomingReadings.angle;
  dataObj["direction"] = incomingReadings.direction;
  dataObj["speed"] = incomingReadings.speed;
  dataObj["interval"] = incomingReadings.interval;
  
  logData["data"] = dataObj;
  
  // Log to server
  Serial.print("LOG_TRANSMISSION:slave,");
  Serial.println(JSON.stringify(logData));
}

void setup() {
  Serial.begin(115200);
  delay(1000); // Give some time for serial to initialize
  
  // Set device as a Wi-Fi Station
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(); // Disconnect from any existing WiFi connection
  delay(100); // Give some time for disconnect
  
  // Print MAC address
  Serial.print("ESP32 Slave MAC Address: ");
  Serial.println(WiFi.macAddress());

  // Init ESP-NOW
  if (esp_now_init() != ESP_OK) {
    Serial.println("Error initializing ESP-NOW");
    return;
  }
  Serial.println("ESP-NOW initialized successfully");

  // Register for a callback function that will be called when data is received
  esp_now_register_recv_cb(OnDataRecv);
  Serial.println("Receive callback registered");
  
  Serial.println("ESP32 Slave initialized and ready to receive data");
}

void loop() {
  // Nothing to do here - all work is done in the callback
  delay(1000);
} 