#include <WiFi.h>
#include <esp_now.h>

#define LED_PIN 2

void OnDataRecv(const esp_now_recv_info_t *recv_info, const uint8_t *incomingData, int len) {
  Serial.println(">> Callback triggered!");
  Serial.print("Received data: ");
  for (int i = 0; i < len; i++) {
    Serial.print(incomingData[i], HEX);
    Serial.print(" ");
  }
  Serial.println();

  digitalWrite(LED_PIN, HIGH);
  delay(100);
  digitalWrite(LED_PIN, LOW);
}

void setup() {
  Serial.begin(115200);
  delay(2000);  // Let Serial boot

  Serial.println("Booting slave...");
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  Serial.print("Slave MAC: ");
  Serial.println(WiFi.macAddress());

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW Init Failed");
    return;
  }

  esp_now_register_recv_cb(OnDataRecv);
  Serial.println("ESPNow slave ready.");
}

void loop() {
  // passive
}
