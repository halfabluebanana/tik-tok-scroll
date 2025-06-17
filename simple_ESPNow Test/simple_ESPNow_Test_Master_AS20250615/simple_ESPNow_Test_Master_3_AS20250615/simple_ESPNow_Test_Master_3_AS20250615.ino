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

int angle = 90;  // Example angle
int direction = 1;  // 1 for down, 0 for up
int speed = 1.5;  // Example speed
int interval = 100;  // Example interval

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

  // Init ESP-NOW
  if (esp_now_init() != ESP_OK) {
    Serial.println("Error initializing ESP-NOW");
    return;
  }
  Serial.println("ESP-NOW initialized successfully");

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
      return;
    }
    Serial.print("Peer ");
    Serial.print(i);
    Serial.print(" (Device ID: ");
    Serial.print(slaveDeviceIds[i]);
    Serial.println(") added successfully");
  }
  
  Serial.println("ESP32 Master initialized and ready to send data");
}

void loop() {
  // Send message to all slaves
  for (int i = 0; i < numSlaves; i++) {
    // Set values to send with appropriate device ID
    outgoingData.deviceId = slaveDeviceIds[i];  // Use the mapped device ID
    outgoingData.angle = 90;  // Example angle
    outgoingData.direction = 1;  // 1 for down, 0 for up
    outgoingData.speed = 1.5;  // Example speed
    outgoingData.interval = 100;  // Example interval

    esp_err_t result = esp_now_send(slaveAddresses[i], (uint8_t *) &outgoingData, sizeof(outgoingData));
    
    if (result == ESP_OK) {
      Serial.print("Sent to slave ");
      Serial.print(i);
      Serial.print(" (Device ID: ");
      Serial.print(outgoingData.deviceId);
      Serial.println(") with success");
    }
    else {
      Serial.print("Error sending to slave ");
      Serial.print(i);
      Serial.print(". Error code: ");
      Serial.println(result);
    }
  }

  // check if we get new data from serial but this probably should just be a callback
  
  delay(2000);  // Send data every 2 seconds
}


//void onSerialDataReceive

// format incoming data to the format that we need to send out

// We log a message to server that we are about to send out data

// Send out data

// Send copy of data back to server for debugging


