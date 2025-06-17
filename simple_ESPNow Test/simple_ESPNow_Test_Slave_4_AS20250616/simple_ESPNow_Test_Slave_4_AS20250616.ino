#include <esp_now.h>
#include <WiFi.h>
#include <Arduino_JSON.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

// ========== CONFIGURATION SECTION ==========
// Easy to adjust settings
#define DEVICE_ID 4                    // This device's ID
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
int currentDirection = 1;               // Direction from ESP-NOW
unsigned long animationTriggerInterval = DEFAULT_TRIGGER_INTERVAL;  // Time between animation triggers
bool animationSystemEnabled = true;    // Global animation enable/disable
bool sequentialMovement = true;         // True for sequential, false for parallel movement

// Animation timing (non-blocking, single animation cycle)
unsigned long lastAnimationUpdate = 0;
unsigned long lastAnimationComplete = 0;  // When last animation finished
unsigned long animationStartTime = 0;
bool animationActive = false;

// Current motor positions for smooth animations
int currentMotorPositions[NUM_MOTORS];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * @brief Debug print function with level control
 * @param message Message to print
 * @param level Debug level required (1=basic, 2=verbose)
 */
void debugPrint(String message, int level = 1) {
  if (DEBUG_LEVEL >= level) {
    Serial.println("[DEBUG] " + message);
  }
}

/**
 * @brief Convert angle (0-180°) to PCA9685 pulse count
 * @param angle Servo angle in degrees (0-180)
 * @return PCA9685 pulse count value
 */
uint16_t angleToPulse(int angle) {
  angle = constrain(angle, 0, 180);
  return map(angle, 0, 180, SERVO_MIN, SERVO_MAX);
}

/**
 * @brief Set motor position directly
 * @param angle Target angle in degrees (0-180) - defaults to center position
 * @param motorIndex Motor index (0-14), or -1 for all motors (default: all motors)
 */
void setMotorPosition(int angle = SERVO_CENTER, int motorIndex = -1) {
  angle = constrain(angle, 0, 180);
  uint16_t pulseCount = angleToPulse(angle);
  
  if (motorIndex == -1) {
    // Set all motors
    for (int i = 0; i < NUM_MOTORS; i++) {
      pwm.setPWM(i, 0, pulseCount);
      if (DEBUG_MOTORS && DEBUG_LEVEL >= 2) {
        Serial.print("Motor "); Serial.print(i); 
        Serial.print(" -> "); Serial.print(angle); 
        Serial.print("° ("); Serial.print(pulseCount); Serial.println(")");
      }
    }
    if (DEBUG_MOTORS && DEBUG_LEVEL >= 1) {
      Serial.print("All motors set to "); Serial.print(angle); Serial.println("°");
    }
  } else if (motorIndex >= 0 && motorIndex < NUM_MOTORS) {
    // Set single motor
    pwm.setPWM(motorIndex, 0, pulseCount);
    if (DEBUG_MOTORS && DEBUG_LEVEL >= 1) {
      Serial.print("Motor "); Serial.print(motorIndex); 
      Serial.print(" -> "); Serial.print(angle); 
      Serial.print("° ("); Serial.print(pulseCount); Serial.println(")");
    }
  } else {
    debugPrint("Invalid motor index: " + String(motorIndex), 1);
  }
}

// ============================================================================
// ANIMATION FUNCTIONS
// ============================================================================

/**
 * @brief Initialize motor position tracking array
 */
void initMotorPositions() {
  for (int i = 0; i < NUM_MOTORS; i++) {
    currentMotorPositions[i] = SERVO_CENTER;
  }
}

/**
 * @brief Update animation parameters from ESP-NOW data
 * @param baseAngle Base angle for the animation (0-180°)
 * @param direction Animation direction (0=reverse, 1=forward)  
 * @param speed Speed multiplier (0.1-2.0)
 * @param triggerInterval Time between animation triggers in milliseconds
 */
void updateAnimationParams(int baseAngle = SERVO_CENTER, int direction = 1, float speed = 1.0, unsigned long triggerInterval = DEFAULT_TRIGGER_INTERVAL) {
  currentBaseAngle = constrain(baseAngle, 0, 180);
  currentDirection = direction;
  currentAnimationSpeed = constrain(speed, 0.1, 2.0);
  animationTriggerInterval = constrain(triggerInterval, 1000, 60000);  // 1-60 seconds
  
  if (DEBUG_ANIMATION && DEBUG_LEVEL >= 1) {
    Serial.print("Animation params updated: base="); Serial.print(currentBaseAngle);
    Serial.print("°, dir="); Serial.print(currentDirection);
    Serial.print(", speed="); Serial.print(currentAnimationSpeed);
    Serial.print(", trigger interval="); Serial.print(animationTriggerInterval); Serial.println("ms");
  }
}

/**
 * @brief Enable or disable the animation system
 * @param enabled True to enable animations, false to disable and stop any current animation
 */
void setAnimationEnabled(bool enabled) {
  animationSystemEnabled = enabled;
  if (!enabled && animationActive) {
    stopAnimation();
  }
  
  if (DEBUG_ANIMATION && DEBUG_LEVEL >= 1) {
    debugPrint("Animation system " + String(enabled ? "enabled" : "disabled"), 1);
  }
}

/**
 * @brief Set animation movement mode
 * @param sequential True for sequential movement (default), false for parallel movement
 */
void setAnimationMode(bool sequential) {
  sequentialMovement = sequential;
  
  if (DEBUG_ANIMATION && DEBUG_LEVEL >= 1) {
    debugPrint("Animation mode set to " + String(sequential ? "sequential" : "parallel"), 1);
  }
}

/**
 * @brief Start a new animation
 */
void startAnimation() {
  if (!animationSystemEnabled) return;
  
  animationStartTime = millis();
  animationActive = true;
  
  if (DEBUG_ANIMATION && DEBUG_LEVEL >= 1) {
    debugPrint("Animation started", 1);
  }
}

/**
 * @brief Stop current animation and return all motors to base position
 */
void stopAnimation() {
  animationActive = false;
  lastAnimationComplete = millis();  // Record when animation stopped
  setMotorPosition(currentBaseAngle);
  if (DEBUG_ANIMATION && DEBUG_LEVEL >= 1) {
    debugPrint("Animation stopped, motors returned to base position", 1);
  }
}

/**
 * @brief Calculate animation position for a specific motor
 * @param motorIndex Motor index (0-14)
 * @param progress Animation progress (0.0-1.0)
 * @param sequential True for sequential movement (default), false for parallel movement
 * @return Target angle for the motor
 */
int calculateAnimationPosition(int motorIndex, float progress, bool sequential = true) {
  if (sequential) {
    // Sequential activation: each motor activates in sequence
    float motorTriggerPoint = (float)motorIndex / NUM_MOTORS;
    float motorProgress = (progress - motorTriggerPoint) * NUM_MOTORS;
    
    if (motorProgress < 0.0 || motorProgress > 1.0) {
      return currentBaseAngle;  // Motor not active yet or already finished
    }
    
    // Animation motion for sequential mode
    float motion = sin(motorProgress * PI);  // 0 to 1 and back to 0
    int offset = motion * ANIMATION_AMPLITUDE * currentDirection;
    
    return constrain(currentBaseAngle + offset, 0, 180);
  } else {
    // Parallel movement: all motors move together with the same timing
    float motion = sin(progress * PI);  // 0 to 1 and back to 0
    int offset = motion * ANIMATION_AMPLITUDE * currentDirection;
    
    return constrain(currentBaseAngle + offset, 0, 180);
  }
}

/**
 * @brief Update animation (call this in loop() for non-blocking animation)
 * Handles timing: trigger → play → wait → repeat cycle
 */
void updateAnimation() {
  if (!animationSystemEnabled) return;
  
  unsigned long currentTime = millis();
  
  // Check if it's time to trigger a new animation (after interval has passed since last completion)
  if (!animationActive && (currentTime - lastAnimationComplete >= animationTriggerInterval)) {
    startAnimation();
  }
  
  if (!animationActive) return;
  
  // Check if it's time for the next animation frame
  if (currentTime - lastAnimationUpdate < ANIMATION_UPDATE_INTERVAL) {
    return;
  }
  
  lastAnimationUpdate = currentTime;
  
  // Calculate animation progress (0.0 to 1.0)
  float totalDuration = ANIMATION_DURATION / currentAnimationSpeed;
  float progress = (float)(currentTime - animationStartTime) / totalDuration;
  
  // Stop animation after duration (let it complete fully)
  if (progress >= 1.0) {
    animationActive = false;
    lastAnimationComplete = currentTime;  // Record completion time for interval timing
    setMotorPosition(currentBaseAngle);  // Return to base position
    if (DEBUG_ANIMATION && DEBUG_LEVEL >= 1) {
      debugPrint("Animation complete, waiting " + String(animationTriggerInterval) + "ms for next trigger", 1);
    }
    return;
  }
  
  // Update each motor based on animation
  for (int i = 0; i < NUM_MOTORS; i++) {
    int targetAngle = calculateAnimationPosition(i, progress, sequentialMovement);
    
    // Only update if position changed
    if (currentMotorPositions[i] != targetAngle) {
      currentMotorPositions[i] = targetAngle;
      setMotorPosition(targetAngle, i);
    }
  }
  
  if (DEBUG_ANIMATION && DEBUG_LEVEL >= 2) {
    Serial.print("Animation update: progress="); Serial.print(progress * 100, 1); Serial.println("%");
  }
}

// ============================================================================
// ESP-NOW COMMUNICATION
// ============================================================================

/**
 * @brief Callback function when ESP-NOW data is received
 * @param esp_now_info Sender information
 * @param incomingData Received data buffer
 * @param len Data length
 */
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

/**
 * @brief Process incoming ESP-NOW data and update animation parameters
 * ESP-NOW messages adjust animation parameters; interval controls trigger timing
 */
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

// ============================================================================
// SETUP & LOOP
// ============================================================================

void setup() {
  Serial.begin(115200);
  delay(1000);

  debugPrint("ESP32 Servo Controller v3.0 Starting...", 1);
  debugPrint("Device ID: " + String(DEVICE_ID), 1);
  debugPrint("Motors: " + String(NUM_MOTORS), 1);

  // Initialize motor position tracking
  initMotorPositions();
  debugPrint("Motor position tracking initialized", 1);

  // Initialize I2C with explicit pins (from working example)
  Wire.begin(SDA_PIN, SCL_PIN);
  debugPrint("I2C initialized (SDA:" + String(SDA_PIN) + ", SCL:" + String(SCL_PIN) + ")", 1);

  // Initialize PCA9685 (simplified from working example)
  pwm.begin();
  pwm.setPWMFreq(SERVO_FREQ);  // No oscillator frequency setting
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

  // ========== CUSTOM SETUP ADDITIONS ==========
  // Add any additional setup code here
  
  // Initialize animation timing
  lastAnimationComplete = millis() - DEFAULT_TRIGGER_INTERVAL;  // Start first animation immediately
  updateAnimationParams(SERVO_CENTER, 1, 1.0, DEFAULT_TRIGGER_INTERVAL);
  setAnimationEnabled(true);  // Enable animation system by default
  
  // =============================================

  debugPrint("Setup complete - ready to receive data", 1);
}

void loop() {
  // Update the animation (non-blocking, handles triggering → play → wait → repeat)
  updateAnimation();
  
  // ========== CUSTOM LOOP ADDITIONS ==========
  // Add any additional loop code here
  
  // Periodic status update
  static unsigned long lastStatusUpdate = 0;
  if (millis() - lastStatusUpdate > 10000) {  // Every 10 seconds
    lastStatusUpdate = millis();
    if (DEBUG_LEVEL >= 2) {
      Serial.print("Status: ");
      if (!animationSystemEnabled) {
        Serial.print("System disabled");
      } else {
        Serial.print(animationActive ? "Animating" : "Waiting");
        Serial.print(" (base="); Serial.print(currentBaseAngle); 
        Serial.print("°, trigger every "); Serial.print(animationTriggerInterval / 1000.0, 1); 
        Serial.print("s)");
      }
      Serial.println();
    }
  }
  
  
  delay(1);  // Small delay to prevent watchdog issues
}