/*
 * ESP32 ESP-NOW Slave
 * Compatible with master_v2 implementation
 */

// ==================== LIBRARIES ====================

#include <esp_now.h>             // ESP-NOW protocol for receiving messages
#include <WiFi.h>                // Required for ESP-NOW (but we don't connect to WiFi)
#include <ESP32Servo.h>          // ESP32-specific servo library
#include <Arduino_JSON.h>

// ==================== ESP-NOW MESSAGE STRUCTURE ====================
// This matches the structure in master_v2

typedef struct {
  int deviceId;              // Target device: 0=broadcast to all, 1-6=specific device
  int angle;                 // Servo angle: 0-180 degrees
  int direction;             // Direction: 0=up/reverse, 1=down/forward  
  int speed;                 // Animation speed: 0-255
  unsigned long interval;    // Timing between animations (milliseconds)
  unsigned long delay_offset; // Device-specific timing offset (milliseconds)
  unsigned long timestamp;   // When command was created (for debugging)
} esp_now_message_t;

// ==================== CONFIGURATION SECTION ====================

#define ESPNOW_CHANNEL 1         // Must match master_v2
#define SERVO_PIN 13             // GPIO pin for servo motor
#define DEVICE_ID 1              // This slave's ID

// ==================== GLOBAL VARIABLES ====================

Servo myServo;                   // Create servo object
int currentAngle = 90;           // Current servo position
int targetAngle = 90;            // Target servo position
unsigned long lastMoveTime = 0;   // Last time we moved the servo
bool isMoving = false;           // Whether servo is currently moving

// ==================== ESP-NOW GLOBALS ====================

esp_now_message_t lastReceivedMessage = {0, 90, 0, 100, 1000, 0, 0}; // Default safe values
bool hasReceivedMessage = false;        // True after first message received
unsigned long lastMessageTime = 0;      // When we last received a message
const unsigned long CONNECTION_TIMEOUT = 10000; // 10 seconds without message = disconnected

// Helper function to create repeated strings
String repeatString(const char* str, int times) {
  String result = "";
  for(int i = 0; i < times; i++) {
    result += str;
  }
  return result;
}

// Send log to server
void sendLog(const char* type, const char* message) {
    JSONVar doc;
    doc["type"] = "log";
    doc["source"] = "slave";
    doc["deviceId"] = DEVICE_ID;
    doc["message"] = message;
    doc["timestamp"] = millis();
    
    String jsonString = JSON.stringify(doc);
    Serial.println(jsonString);
}

// ==================== SETUP ====================

void setup() {
  // Start serial communication for debugging
  Serial.begin(115200);
  delay(1000);  // Give serial monitor time to connect
  
  Serial.println("\n" + repeatString("=", 50));
  Serial.println("ESP32 ESP-NOW Slave");
  Serial.println("Device ID: " + String(DEVICE_ID));
  Serial.println(repeatString("=", 50));
  
  // Initialize servo
  ESP32PWM::allocateTimer(0);  // Allocate timer for servo
  myServo.setPeriodHertz(50);  // Standard 50hz servo
  myServo.attach(SERVO_PIN);
  myServo.write(currentAngle);
  sendLog("info", "Servo initialized");
  
  // ESP-NOW Setup
  WiFi.mode(WIFI_STA);  // Station mode for ESP-NOW
  Serial.println("\nIMPORTANT: Copy this MAC address to the master ESP32:");
  Serial.println("MAC Address: " + WiFi.macAddress());
  Serial.println("Add this to the slave_macs array in the master code!");
  Serial.println(repeatString("=", 50));
  
  // Initialize ESP-NOW
  if (esp_now_init() != ESP_OK) {
    sendLog("error", "Error initializing ESP-NOW");
    return;
  }
  Serial.println("ESP-NOW initialized successfully");
  
  // Register callback function for receiving messages
  esp_now_register_recv_cb(OnDataReceived);
  Serial.println("Registered receive callback function");
  
  Serial.println("\n" + repeatString("=", 50));
  Serial.println("Slave ESP32 ready!");
  Serial.println("Device ID: " + String(DEVICE_ID));
  Serial.println("Waiting for commands from master...");
  Serial.println("MAC: " + WiFi.macAddress());
  Serial.println(repeatString("=", 50) + "\n");
}

// ==================== LOOP ====================

void loop() {
  // Check connection status
  if (!hasReceivedMessage && (millis() - lastMessageTime > CONNECTION_TIMEOUT)) {
    Serial.println("[WARNING] No messages from master for " + String(CONNECTION_TIMEOUT/1000) + " seconds");
    Serial.println("Using last known command as fallback");
    hasReceivedMessage = false;
  }
  
  // Handle servo movement
  if (isMoving) {
    unsigned long currentTime = millis();
    
    // Check if it's time to move based on interval and delay_offset
    if (currentTime - lastMoveTime >= lastReceivedMessage.interval) {
      // Calculate new angle based on direction
      if (lastReceivedMessage.direction == 1) { // Forward
        targetAngle = (targetAngle + 1) % 181;
      } else { // Reverse
        targetAngle = (targetAngle - 1 + 181) % 181;
      }
      
      // Move servo to new position
      myServo.write(targetAngle);
      currentAngle = targetAngle;
      lastMoveTime = currentTime;
      
      // Debug output
      char message[100];
      snprintf(message, sizeof(message), "Servo moved to: %d°", currentAngle);
      sendLog("info", message);
    }
  }
  
  delay(10); // Small delay to prevent overwhelming the CPU
}

// ==================== ESP-NOW MESSAGE HANDLER ====================

void OnDataReceived(const esp_now_recv_info_t *esp_now_info, const uint8_t *data, int len) {
  // Validate message size
  if (len != sizeof(esp_now_message_t)) {
    sendLog("error", "Invalid message length");
    return;
  }
  
  // Parse the message
  esp_now_message_t* message = (esp_now_message_t*)data;
  
  // Check if message is for this device
  if (message->deviceId != 0 && message->deviceId != DEVICE_ID) {
    return; // Message is for a different device
  }
  
  // Print received message details
  char logMessage[200];
  snprintf(logMessage, sizeof(logMessage), 
          "Received: angle=%d, dir=%d, speed=%d, interval=%lu, delay=%lu",
          message->angle, message->direction, message->speed,
          message->interval, message->delay_offset);
  sendLog("info", logMessage);
  
  // Store the message
  lastReceivedMessage = *message;
  hasReceivedMessage = true;
  lastMessageTime = millis();
  
  // Handle the message
  if (message->angle >= 0 && message->angle <= 180) {
    // Set target angle and start movement
    targetAngle = message->angle;
    currentAngle = targetAngle;
    myServo.write(targetAngle);
    isMoving = true;
    lastMoveTime = millis();
    
    char message[100];
    snprintf(message, sizeof(message), "Servo set to: %d°", targetAngle);
    sendLog("info", message);
  }
} 