#include <esp_now.h>
#include <WiFi.h>

#define DEVICE_ID 5              // This slave's ID
#define FAN_PIN 18               // Native PWM pin for the fan
#define PWM_CHANNEL 0
#define PWM_FREQ 25000          // 25kHz recommended for PC fans
#define PWM_RESOLUTION 8        // 8-bit resolution (0-255)

typedef struct struct_message {
  uint8_t deviceId;
  int16_t angle;     // Used as speed control (0-180)
  int8_t direction;
  float speed;
  uint16_t interval;
} struct_message;

struct_message incomingReadings;

void debugPrint(String msg) {
  Serial.println("[DEBUG] " + msg);
}

void setup() {
  Serial.begin(115200);
  debugPrint("Starting ESP32 Native Fan Controller (Slave 5)");

  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);
  debugPrint("MAC Address: " + WiFi.macAddress());

  // PWM setup
  ledcSetup(PWM_CHANNEL, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(FAN_PIN, PWM_CHANNEL);
  ledcWrite(PWM_CHANNEL, 0);  // Start with fan off

  if (esp_now_init() != ESP_OK) {
    debugPrint("ESP-NOW init failed!");
    return;
  }

  esp_now_register_recv_cb(OnDataRecv);
  debugPrint("ESP-NOW ready and listening...");
}

void loop() {
  delay(10);
}

void OnDataRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  memcpy(&incomingReadings, data, sizeof(incomingReadings));
  
  if (incomingReadings.deviceId != DEVICE_ID) return;

  int angle = constrain(incomingReadings.angle, 0, 180);
  int pwmValue = map(angle, 0, 180, 0, 255);  // Convert to 8-bit PWM

  ledcWrite(PWM_CHANNEL, pwmValue);

  debugPrint("Received speed command:");
  debugPrint("Angle (0–180): " + String(angle) + " → PWM: " + String(pwmValue));
}
