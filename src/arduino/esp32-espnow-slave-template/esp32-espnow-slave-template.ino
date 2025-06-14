/*
 * ESP32 ESP-NOW Slave Template
 * This is a TEMPLATE - copy this file and add in device specific code!
 */

// ==================== LIBRARIES ====================

#include <esp_now.h>             // ESP-NOW protocol for receiving messages
#include <WiFi.h>                // Required for ESP-NOW (but we don't connect to WiFi)
#include <Servo.h>                // For servo control
#include <ArduinoJson.h>          // For JSON serialization

// Add any libraries you need for your project:
// #include <Servo.h>              // For servo motors
// #include <Wire.h>               // For I2C devices

// [OTHER LIBRARY INCLUDES HERE]


// ==================== ESP-NOW MESSAGE STRUCTURE ====================
// This MUST match the structure in the master ESP32!
// If you want to use the simple timing-only version, 
// uncomment the second struct and comment out the first one.

// FULL VERSION (default)
typedef struct {
  int deviceId;              // Target device: 0=broadcast to all, 1-6=specific device
  int angle;                 // Servo angle: 0-180 degrees
  int direction;             // Direction: 0=up/reverse, 1=down/forward  
  int speed;                 // Animation speed: 0-255
  unsigned long interval;    // Timing between animations (milliseconds)
  unsigned long delay_offset; // Device-specific timing offset (milliseconds)
  unsigned long timestamp;   // When command was created (for debugging)
  // Container metrics
  char currentContainer[32]; // Current container ID
  unsigned long timeSpent;   // Time spent in current container (ms)
  unsigned long timeBetween; // Time between container changes (ms)
} esp_now_message_t;

// SIMPLE TIMING-ONLY VERSION (commented out)
// If you only care about timing data, uncomment this and comment out the full version above:
/*
typedef struct {
  int deviceId;              // Target device: 0=all, 1-6=specific device
  int direction;             // Direction: 0=up/reverse, 1=down/forward
  unsigned long interval;    // Timing between animations (milliseconds)
  unsigned long delay_offset; // Device-specific timing offset (milliseconds)
  unsigned long timestamp;   // When command was created (for debugging)
} esp_now_timing_message_t;
*/

// ==================== CONFIGURATION SECTION ====================
// TODO: Update these values for your specific device!

#define MY_DEVICE_ID 1           // This device's ID (1-6) - CHANGE THIS for each slave!
#define ESPNOW_CHANNEL 1         // Must match master (1-14)
#define SERVO_PIN 13             // GPIO pin for servo control

// ==================== GLOBAL VARIABLES ====================

// int interval = 1000;          // Default interval for animations
// other global variables

// Servo control
Servo servo;
int currentAngle = 90;
int targetAngle = 90;
unsigned long lastMoveTime = 0;

// ==================== ESP-NOW GLOBALS (DON'T MODIFY) ====================
// These variables handle ESP-NOW communication - don't change these!

esp_now_message_t lastReceivedMessage = {
    .deviceId = 0,
    .angle = 90,
    .direction = 1,
    .speed = 100,
    .interval = 100,
    .delay_offset = 0,
    .timestamp = 0,
    .currentContainer = "",
    .timeSpent = 0,
    .timeBetween = 0
}; // Default safe values
bool hasReceivedMessage = false;        // True after first message received
unsigned long lastMessageTime = 0;     // When we last received a message
const unsigned long CONNECTION_TIMEOUT = 10000; // 10 seconds without message = disconnected

// ==================== SETUP ====================

void setup() {
  // Start serial communication for debugging
  Serial.begin(115200);
  delay(1000);  // Give serial monitor time to connect
  
  Serial.println("\n" + String("=").repeat(50));
  Serial.println("ESP32 ESP-NOW Slave Template");
  Serial.println("Device ID: " + String(MY_DEVICE_ID));
  Serial.println(String("=").repeat(50));
  
  // ==================== ESP-NOW SETUP (DON'T MODIFY) ====================
  
  // Print MAC address - COPY THIS TO THE MASTER!
  WiFi.mode(WIFI_STA);  // Station mode for ESP-NOW
  Serial.println("\nIMPORTANT: Copy this MAC address to the master ESP32:");
  Serial.println("MAC Address: " + WiFi.macAddress());
  Serial.println("Add this to the slave_macs array in the master code!");
  Serial.println(String("=").repeat(50));
  
  // Initialize ESP-NOW
  if (esp_now_init() != ESP_OK) {
    Serial.println("ERROR: ESP-NOW initialization failed!");
    Serial.println("Try restarting the ESP32");
    return;
  }
  Serial.println("ESP-NOW initialized successfully");
  
  // Register callback function for receiving messages
  esp_now_register_recv_cb(onDataReceived);
  Serial.println("Registered receive callback function");
  
  // ==================== OTHER SETUP CODE ====================
  
  // Initialize servo
  servo.attach(SERVO_PIN);
  servo.write(currentAngle);
  
  Serial.println("\n" + String("=").repeat(50));
  Serial.println("Slave ESP32 ready!");
  Serial.println("Device ID: " + String(MY_DEVICE_ID));
  Serial.println("Waiting for commands from master...");
  Serial.println("MAC: " + WiFi.macAddress());
  Serial.println(String("=").repeat(50) + "\n");
}





// ==================== LOOP ====================

void loop() {
  // ==================== CONNECTION MONITORING (DON'T MODIFY) ====================
  
  // Check if we've lost connection to master
  if (hasReceivedMessage && (millis() - lastMessageTime > CONNECTION_TIMEOUT)) {
    Serial.println("[WARNING] No messages from master for " + String(CONNECTION_TIMEOUT/1000) + " seconds");
    Serial.println("Using last known command as fallback");
    
    // Reset the flag so we only print this warning once
    hasReceivedMessage = false;
  }
  
  // ==================== OTHER LOOP CODE ====================
  
  // Check if we need to move the servo
  if (currentAngle != targetAngle) {
    unsigned long now = millis();
    if (now - lastMoveTime >= lastReceivedMessage.interval) {
      // Calculate step size based on speed
      int step = map(lastReceivedMessage.speed, 0, 255, 1, 10);
      
      // Move towards target angle
      if (currentAngle < targetAngle) {
        currentAngle = min(currentAngle + step, targetAngle);
      } else {
        currentAngle = max(currentAngle - step, targetAngle);
      }
      
      servo.write(currentAngle);
      lastMoveTime = now;

      // Log movement
      if (currentAngle == targetAngle) {
        char message[100];
        snprintf(message, sizeof(message), "Servo reached target angle: %d", currentAngle);
        sendLog("info", message);
      }
    }
  }

  // Print container metrics every 5 seconds
  static unsigned long lastPrintTime = 0;
  if (millis() - lastPrintTime >= 5000) {
    char message[200];
    snprintf(message, sizeof(message), 
            "Container: %s, Time spent: %lu ms, Time between: %lu ms",
            lastReceivedMessage.currentContainer,
            lastReceivedMessage.timeSpent,
            lastReceivedMessage.timeBetween);
    sendLog("info", message);
    lastPrintTime = millis();
  }
  
  // Small delay to prevent overwhelming the CPU (keep this!)
  delay(10);
}

// ==================== ESP-NOW MESSAGE HANDLER ====================
// This function is called automatically when we receive an ESP-NOW message

void onDataReceived(const uint8_t *mac, const uint8_t *data, int len) {
  // ==================== MESSAGE VALIDATION (DON'T MODIFY) ====================
  
  // Check if message size is correct
  if (len != sizeof(esp_now_message_t)) {
    Serial.println("[ESP-NOW] Received message with wrong size: " + String(len) + " bytes");
    return;
  }
  
  // Parse the message
  esp_now_message_t* message = (esp_now_message_t*)data;
  
  // Check if this message is for us (deviceId 0 = broadcast to all, MY_DEVICE_ID = specific to us)
  if (message->deviceId != 0 && message->deviceId != MY_DEVICE_ID) {
    // This message is for a different device, ignore it
    return;
  }
  
  // ==================== MESSAGE PROCESSING (DON'T MODIFY) ====================
  
  Serial.println("\n[ESP-NOW] Message received from master:");
  Serial.println("   Target Device: " + String(message->deviceId == 0 ? "All devices" : "Device " + String(message->deviceId)));
  Serial.println("   Angle: " + String(message->angle) + "°");
  Serial.println("   Direction: " + String(message->direction ? "forward" : "reverse"));
  Serial.println("   Speed: " + String(message->speed));
  Serial.println("   Interval: " + String(message->interval) + "ms");
  Serial.println("   Delay Offset: " + String(message->delay_offset) + "ms");
  Serial.println("   Timestamp: " + String(message->timestamp) + "ms");
  
  // Store the message for use in main loop
  lastReceivedMessage = *message;
  hasReceivedMessage = true;
  lastMessageTime = millis();

  // Time to touch stuff again here
  
  // ==================== YOUR MESSAGE HANDLING CODE GOES HERE ====================
  
  // This is where you add code to respond to the received message!
  // The message data is available in the 'message' variable.
 
  // Update target angle
  targetAngle = message->angle;

  // Apply delay offset
  if (message->delay_offset > 0) {
    delay(message->delay_offset);
  }

  Serial.println("[ESP-NOW] Message processed successfully");
}

// ==================== CUSTOM FUNCTIONS ====================
// Add any helper functions you need for your project:

// Examples:
// void startAnimation() {
//   // Your animation start code
// }

// Send log to server
void sendLog(const char* type, const char* message) {
    StaticJsonDocument<256> doc;
    doc["type"] = type;
    doc["source"] = "slave";
    doc["deviceId"] = MY_DEVICE_ID;
    doc["message"] = message;
    doc["timestamp"] = millis();
    
    serializeJson(doc, Serial);
    Serial.println();
}