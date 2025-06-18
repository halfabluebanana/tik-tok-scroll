// ✅ Ensure correct ESP32 board is selected in Arduino IDE
// ✅ Board: Tools > Board > ESP32 Dev Module

// Required libraries
#include <Arduino.h>
#include <esp_now.h>
#include <WiFi.h>
#include <Arduino_JSON.h>
#include <driver/mcpwm.h>

// Fan control pins
#define FAN_PWM_PIN      18          // GPIO connected to fan PWM (yellow)
#define FAN_ONOFF_PIN    23          // GPIO connected to fan on/off control
#define FAN_PWM_FREQ     25000       // Fan expects 25kHz PWM

// Debug settings
#define DEBUG_LEVEL 1                // 0=none, 1=basic, 2=verbose

// ESP-NOW data structure
typedef struct struct_message {
  uint8_t deviceId;
  int16_t speed;      // 0-255 for fan speed
  int8_t direction;   // 0=off, 1=on
  float multiplier;   // Speed multiplier (0.1-2.0)
  uint16_t interval;  // Update interval
} struct_message;

struct_message incomingReadings;

// Current fan state
int currentSpeed = 0;
bool fanEnabled = false;

// Debug print function
void debugPrint(String message, int level = 1) {
  if (DEBUG_LEVEL >= level) {
    Serial.println("[DEBUG] " + message);
  }
}

// Updated ESP-NOW callback function signature
void OnDataRecv(const esp_now_recv_info_t *esp_now_info, const uint8_t *data, int len) {
  memcpy(&incomingReadings, data, sizeof(incomingReadings));
  
  if (DEBUG_LEVEL >= 1) {
    Serial.print("Received data - Speed: ");
    Serial.print(incomingReadings.speed);
    Serial.print(", Direction: ");
    Serial.println(incomingReadings.direction);
  }
  
  // Update fan state
  currentSpeed = constrain(incomingReadings.speed, 0, 255);
  fanEnabled = (incomingReadings.direction == 1);
  
  // Apply speed and on/off state
  if (fanEnabled) {
    // Convert 0-255 to 0-100%
    float duty = (currentSpeed * 100.0) / 255.0;
    mcpwm_set_duty(MCPWM_UNIT_0, MCPWM_TIMER_0, MCPWM_OPR_A, duty);
    digitalWrite(FAN_ONOFF_PIN, HIGH);
    debugPrint("Fan ON at speed: " + String(currentSpeed));
  } else {
    mcpwm_set_duty(MCPWM_UNIT_0, MCPWM_TIMER_0, MCPWM_OPR_A, 0);
    digitalWrite(FAN_ONOFF_PIN, LOW);
    debugPrint("Fan OFF");
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  debugPrint("ESP32 Fan Controller Starting...", 1);
  
  // Initialize fan control pins
  pinMode(FAN_ONOFF_PIN, OUTPUT);
  digitalWrite(FAN_ONOFF_PIN, LOW);  // Start with fan off
  
  // Configure MCPWM
  mcpwm_config_t pwm_config = {
    .frequency = FAN_PWM_FREQ,
    .cmpr_a = 0,    // duty cycle of PWMxA = 0
    .cmpr_b = 0,    // duty cycle of PWMxB = 0
    .duty_mode = MCPWM_DUTY_MODE_0,
    .counter_mode = MCPWM_UP_COUNTER
  };
  
  // Initialize MCPWM
  mcpwm_init(MCPWM_UNIT_0, MCPWM_TIMER_0, &pwm_config);
  mcpwm_gpio_init(MCPWM_UNIT_0, MCPWM0A, FAN_PWM_PIN);
  
  // Initialize WiFi for ESP-NOW
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);
  
  debugPrint("WiFi MAC: " + WiFi.macAddress(), 1);
  
  // Initialize ESP-NOW
  if (esp_now_init() != ESP_OK) {
    debugPrint("ESP-NOW initialization failed!", 1);
    return;
  }
  
  esp_now_register_recv_cb(OnDataRecv);
  debugPrint("ESP-NOW initialized and callback registered", 1);
  debugPrint("Setup complete - ready to receive data", 1);
}

void loop() {
  // Main loop is empty as all control is handled by ESP-NOW callbacks
  delay(10);  // Small delay to prevent watchdog timer issues
}
