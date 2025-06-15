#include <esp_now.h>
#include <WiFi.h>
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

// MAC address of the Slave ESP32
uint8_t broadcastAddress[] = {0xF0, 0x24, 0xF9, 0xF5, 0x66, 0x70};  // ESP32_2 ; // Slave 2 MAC address

// Callback when data is sent
void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  char macStr[18];
  snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
           mac_addr[0], mac_addr[1], mac_addr[2], mac_addr[3], mac_addr[4], mac_addr[5]);
  
  Serial.println("\n=== Sending Data ===");
  Serial.print("To MAC: ");
  Serial.println(macStr);
  Serial.print("Status: ");
  Serial.println(status == ESP_NOW_SEND_SUCCESS ? "Delivery Success" : "Delivery Fail");
  
  Serial.println("\nData Contents:");
  Serial.print("Device ID: ");
  Serial.println(outgoingData.deviceId);
  Serial.print("Angle: ");
  Serial.println(outgoingData.angle);
  Serial.print("Direction: ");
  Serial.println(outgoingData.direction);
  Serial.print("Speed: ");
  Serial.println(outgoingData.speed);
  Serial.print("Interval: ");
  Serial.println(outgoingData.interval);
  Serial.println("==================\n");
  
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

void setup() {
  Serial.begin(115200);
  delay(1000); // Give some time for serial to initialize
  
  // Set device as a Wi-Fi Station
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(); // Disconnect from any existing WiFi connection
  delay(100); // Give some time for disconnect
  
  // Print MAC address
  Serial.print("ESP32 Master MAC Address: ");
  Serial.println(WiFi.macAddress());

  // Init ESP-NOW
  if (esp_now_init() != ESP_OK) {
    Serial.println("Error initializing ESP-NOW");
    return;
  }
  Serial.println("ESP-NOW initialized successfully");

  // Register peer
  esp_now_peer_info_t peerInfo;
  memcpy(peerInfo.peer_addr, broadcastAddress, 6);
  peerInfo.channel = 0;  
  peerInfo.encrypt = false;
  
  // Add peer        
  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("Failed to add peer");
    return;
  }
  Serial.println("Peer added successfully");

  // Register for a callback function that will be called when data is sent
  esp_now_register_send_cb(OnDataSent);
  Serial.println("Send callback registered");
  
  Serial.println("ESP32 Master initialized and ready to send data");
}

void loop() {
  // Set values to send
  outgoingData.deviceId = 1;
  outgoingData.angle = 90;  // Example angle
  outgoingData.direction = 1;  // 1 for down, 0 for up
  outgoingData.speed = 1.5;  // Example speed
  outgoingData.interval = 100;  // Example interval

  // Send message via ESP-NOW
  esp_err_t result = esp_now_send(broadcastAddress, (uint8_t *) &outgoingData, sizeof(outgoingData));
  
  if (result == ESP_OK) {
    Serial.println("Sent with success");
  }
  else {
    Serial.print("Error sending the data. Error code: ");
    Serial.println(result);
  }
  
  delay(2000);  // Send data every 2 seconds
}
