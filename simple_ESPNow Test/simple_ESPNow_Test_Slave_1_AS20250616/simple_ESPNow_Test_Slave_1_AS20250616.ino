// Required libraries
#include <Arduino.h>
#include <esp_now.h>
#include <WiFi.h>
#include <Arduino_JSON.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

// ========== CONFIGURATION SECTION ==========
// Easy to adjust settings
#define DEVICE_ID 1                    // This device's ID
#define NUM_MOTORS 15                  // Number of servos connected
#define SERVO_FREQ 50                  // Servo frequency (Hz)
#define DEBUG_LEVEL 1                  // 0=none, 1=basic, 2=verbose

// Debug flags
#define DEBUG_MOTORS true              // Enable motor debug output
#define DEBUG_ESP_NOW true             // Enable ESP-NOW debug output
#define DEBUG_ANIMATION true           // Enable animation debug output

// I2C pins for ESP32
#define SDA_PIN 21                     // I2C SDA pin
#define SCL_PIN 22                     // I2C SCL pin

// Servo pulse width ranges (PCA9685 count values, not microseconds!)
#define SERVO_MIN 150                  // Minimum pulse count
#define SERVO_MAX 600                  // Maximum pulse count
#define SERVO_CENTER 90                // Center position in degrees

// Animation settings  
#define ANIMATION_UPDATE_INTERVAL 20   // ms between animation frame updates
#define ANIMATION_DURATION 1000        // ms total animation length
#define ANIMATION_AMPLITUDE 30         // degrees amplitude for animation
#define DEFAULT_TRIGGER_INTERVAL 5000  // ms standard interval between triggers

// ========== GLOBAL VARIABLES ==========
// ESP-NOW data structure
typedef struct struct_message {
  uint8_t deviceId;
  int16_t angle;
  int8_t direction;
  float speed;
  uint16_t interval;
} struct_message;

struct_message incomingReadings;

// PCA9685 setup
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver();

// Animation state variables (adjustable by ESP-NOW messages)
float currentAnimationSpeed = 1.0;     // Speed multiplier from ESP-NOW
int currentBaseAngle = SERVO_CENTER;   // Base angle from ESP-NOW  
int currentDirection = 1;              // Direction from ESP-NOW
unsigned long lastAnimationComplete = 0; // Last animation completion time
bool animationEnabled = true;          // Animation system enabled flag

// Motor position tracking
int currentMotorPositions[15];         // Current position of each motor

// Debug print function
void debugPrint(String message, int level = 1) {
  if (DEBUG_LEVEL >= level) {
    Serial.println("[DEBUG] " + message);
  }
}

// Initialize motor position tracking
void initMotorPositions() {
  for (int i = 0; i < NUM_MOTORS; i++) {
    currentMotorPositions[i] = SERVO_CENTER;
  }
}

// Set motor position with smooth movement
void setMotorPosition(int targetAngle) {
  for (int i = 0; i < NUM_MOTORS; i++) {
    int currentAngle = currentMotorPositions[i];
    int pulse = map(targetAngle, 0, 180, SERVO_MIN, SERVO_MAX);
    pwm.setPWM(i, 0, pulse);
    currentMotorPositions[i] = targetAngle;
    
    if (DEBUG_MOTORS && DEBUG_LEVEL >= 2) {
      Serial.print("Motor "); Serial.print(i);
      Serial.print(": "); Serial.print(currentAngle);
      Serial.print("° -> "); Serial.print(targetAngle);
      Serial.println("°");
    }
  }
}

// Update animation parameters
void updateAnimationParams(int baseAngle, int direction, float speed, unsigned long interval) {
  currentBaseAngle = baseAngle;
  currentDirection = direction;
  currentAnimationSpeed = speed;
  
  if (DEBUG_ANIMATION && DEBUG_LEVEL >= 1) {
    Serial.print("Animation params updated: base="); Serial.print(baseAngle);
    Serial.print("°, dir="); Serial.print(direction);
    Serial.print(", speed="); Serial.print(speed);
    Serial.print(", interval="); Serial.print(interval);
    Serial.println("ms");
  }
}

// Enable/disable animation system
void setAnimationEnabled(bool enabled) {
  animationEnabled = enabled;
  if (DEBUG_ANIMATION && DEBUG_LEVEL >= 1) {
    Serial.print("Animation system "); Serial.println(enabled ? "enabled" : "disabled");
  }
}

// ESP-NOW callback function
void OnDataRecv(const esp_now_recv_info_t *esp_now_info, const uint8_t *incomingData, int len) {
  char macStr[18];
  snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
           esp_now_info->src_addr[0], esp_now_info->src_addr[1], esp_now_info->src_addr[2],
           esp_now_info->src_addr[3], esp_now_info->src_addr[4], esp_now_info->src_addr[5]);

  // Copy the received data
  memcpy(&incomingReadings, incomingData, sizeof(incomingReadings));

  // Only process data meant for this device
  if (incomingReadings.deviceId != DEVICE_ID) {
    if (DEBUG_ESP_NOW && DEBUG_LEVEL >= 2) {
      Serial.print("Ignoring data for device "); Serial.print(incomingReadings.deviceId);
      Serial.print(" (this is device "); Serial.print(DEVICE_ID); Serial.println(")");
    }
    return;
  }

  if (DEBUG_ESP_NOW && DEBUG_LEVEL >= 1) {
    Serial.println("\n=== ESP-NOW Data Received ===");
    Serial.print("From: "); Serial.println(macStr);
    Serial.print("Device ID: "); Serial.println(incomingReadings.deviceId);
    Serial.print("Angle: "); Serial.println(incomingReadings.angle);
    Serial.print("Direction: "); Serial.println(incomingReadings.direction);
    Serial.print("Speed: "); Serial.println(incomingReadings.speed);
    Serial.print("Interval: "); Serial.println(incomingReadings.interval);
  }

  // Process the received data and trigger animation
  processIncomingData();

  // Send log back to server
  if (DEBUG_ESP_NOW) {
    JSONVar logData;
    logData["mac"] = macStr;
    
    JSONVar dataObj;
    dataObj["deviceId"] = incomingReadings.deviceId;
    dataObj["angle"] = incomingReadings.angle;
    dataObj["direction"] = incomingReadings.direction;
    dataObj["speed"] = incomingReadings.speed;
    dataObj["interval"] = incomingReadings.interval;
    
    logData["data"] = dataObj;
    
    Serial.print("LOG_TRANSMISSION:slave"); Serial.print(DEVICE_ID); Serial.print(":");
    Serial.println(JSON.stringify(logData));
  }
}

// Process incoming ESP-NOW data
void processIncomingData() {
  // Normalize the received values
  int baseAngle = constrain(incomingReadings.angle, 0, 180);
  int direction = constrain(incomingReadings.direction, 0, 1);
  float speed = constrain(incomingReadings.speed / 100.0, 0.1, 2.0);  // Normalize speed
  unsigned long triggerInterval = constrain(incomingReadings.interval, 1000, 25000);  // 1-60 seconds
  
  // Update animation parameters
  updateAnimationParams(baseAngle, direction, speed, triggerInterval);
  
  if (DEBUG_ESP_NOW && DEBUG_LEVEL >= 1) {
    Serial.print("Processed data: angle="); Serial.print(baseAngle);
    Serial.print("°, direction="); Serial.print(direction);
    Serial.print(", speed="); Serial.print(speed);
    Serial.print(", trigger interval="); Serial.print(triggerInterval); Serial.println("ms");
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  debugPrint("ESP32 Servo Controller v3.0 Starting...", 1);
  debugPrint("Device ID: " + String(DEVICE_ID), 1);
  debugPrint("Motors: " + String(NUM_MOTORS), 1);

  // Initialize motor position tracking
  initMotorPositions();
  debugPrint("Motor position tracking initialized", 1);

  // Initialize I2C with explicit pins
  Wire.begin(SDA_PIN, SCL_PIN);
  debugPrint("I2C initialized (SDA:" + String(SDA_PIN) + ", SCL:" + String(SCL_PIN) + ")", 1);

  // Initialize PCA9685
  pwm.begin();
  pwm.setPWMFreq(SERVO_FREQ);
  delay(10);
  debugPrint("PCA9685 initialized", 1);

  // Set all motors to center position
  setMotorPosition(SERVO_CENTER);
  delay(500);
  debugPrint("Motors initialized to center position", 1);

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

  // Initialize animation timing
  lastAnimationComplete = millis() - DEFAULT_TRIGGER_INTERVAL;
  updateAnimationParams(SERVO_CENTER, 1, 1.0, DEFAULT_TRIGGER_INTERVAL);
  setAnimationEnabled(true);

  debugPrint("Setup complete - ready to receive data", 1);
}

void loop() {
  // Main loop is empty as all control is handled by ESP-NOW callbacks
  delay(10);  // Small delay to prevent watchdog timer issues
}
