#include <WiFi.h>
#include <esp_now.h>
#include <Arduino_JSON.h>

uint8_t slaveAddress[] = { 0xF0, 0x24, 0xF9, 0xF5, 0x66, 0x70 };

typedef struct struct_message {
  uint8_t deviceId;
  int16_t angle;
  int8_t direction;
  float speed;
  uint16_t interval;
} struct_message;

struct_message outgoingData;
String inputString = "";
bool stringComplete = false;

void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  Serial.print("Send Status: ");
  Serial.println(status == ESP_NOW_SEND_SUCCESS ? "Success" : "Fail");
}

void setup() {
  Serial.begin(115200);  // Match Node server baud rate
  inputString.reserve(200);
  
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();

  if (esp_now_init() != ESP_OK) {
    Serial.println("ESPNow Init Failed");
    return;
  }

  esp_now_register_send_cb(OnDataSent);

  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, slaveAddress, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;

  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("Failed to add peer");
    return;
  }
  
  Serial.println("ESP32 Master Ready");
}

void serialEvent() {
  while (Serial.available()) {
    char inChar = (char)Serial.read();
    inputString += inChar;
    if (inChar == '\n') {
      stringComplete = true;
    }
  }
}

void loop() {
  if (stringComplete) {
    JSONVar doc = JSON.parse(inputString);
    
    if (JSON.typeof(doc) != "undefined") {
      // Extract data from JSON using proper type conversion
      outgoingData.deviceId = (uint8_t)(int)doc["deviceId"];
      outgoingData.angle = (int16_t)(int)doc["angle"];
      outgoingData.direction = (int8_t)(int)doc["direction"];
      outgoingData.speed = (float)(double)doc["speed"];
      outgoingData.interval = (uint16_t)(int)doc["interval"];
      
      // Send data to slave
      esp_err_t result = esp_now_send(slaveAddress, (uint8_t *)&outgoingData, sizeof(outgoingData));
      
      if (result == ESP_OK) {
        Serial.println("Data sent to slave");
      } else {
        Serial.println("Error sending data");
      }
    } else {
      Serial.println("JSON parsing failed");
    }
    
    // Clear the string for next input
    inputString = "";
    stringComplete = false;
  }
} 