#include <WiFi.h>
#include <esp_now.h>

uint8_t slaveAddress[] = { 0xF0, 0x24, 0xF9, 0xF5, 0x66, 0x70 };

typedef struct struct_message {
  int msg = 42;
} struct_message;

struct_message outgoingData;

void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  Serial.print("Send Status: ");
  Serial.println(status == ESP_NOW_SEND_SUCCESS ? "Success" : "Fail");
}

void setup() {
  Serial.begin(115200);
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
}

void loop() {
  esp_now_send(slaveAddress, (uint8_t *)&outgoingData, sizeof(outgoingData));
  Serial.println("Message sent");
  delay(2000);
}
