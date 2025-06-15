#include <WiFi.h>
#include <esp_now.h>
#include <Arduino_JSON.h>

typedef struct struct_message {
  uint8_t deviceId;
  int16_t angle;
  int8_t direction;
  float speed;
  uint16_t interval;
} struct_message;

struct_message incomingData;

void OnDataRecv(const esp_now_recv_info_t *esp_now_info, const uint8_t *data, int data_len) {
  memcpy(&incomingData, data, sizeof(incomingData));
  
  // Create JSON object for serial output
  JSONVar json;
  json["deviceId"] = (int)incomingData.deviceId;
  json["angle"] = (int)incomingData.angle;
  json["direction"] = (int)incomingData.direction;
  json["speed"] = (double)incomingData.speed;
  json["interval"] = (int)incomingData.interval;
  
  // Print received data
  Serial.println(JSON.stringify(json));
}

void setup() {
  Serial.begin(115200);
  
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();

  if (esp_now_init() != ESP_OK) {
    Serial.println("ESPNow Init Failed");
    return;
  }

  esp_now_register_recv_cb(OnDataRecv);
  Serial.println("ESP32 Slave 2 Ready");
}

void loop() {
  // Slave only receives data, no need for loop logic
  delay(100);
} 