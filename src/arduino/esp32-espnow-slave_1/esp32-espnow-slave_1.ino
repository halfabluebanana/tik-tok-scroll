/*
 * ESP32 ESP-NOW Slave
 * Compatible with master_v2 implementation
 */

// ==================== LIBRARIES ====================

#include <esp_now.h>             // ESP-NOW protocol for receiving messages
#include <WiFi.h>                // Required for ESP-NOW (but we don't connect to WiFi)
#include <ESP32Servo.h>          // ESP32-specific servo library

// ==================== ESP-NOW MESSAGE STRUCTURE ====================
// This matches the structure in master_v2

typedef struct {
  int deviceId;              // Target device: 0=all, 1-6=specific device
  int angle;                 // Servo angle: 0-180 degrees
  int direction;             // Direction: 0=up/reverse, 1=down/forward  
  int speed;                 // Animation speed: 0-255
  unsigned long interval;    // Timing between animations (milliseconds)
  unsigned long delay_offset; // Device-specific timing offset (milliseconds)
  unsigned long timestamp;   // When command was created (for debugging)
} esp_now_message_t;

// ==================== CONFIGURATION SECTION ====================

#define MY_DEVICE_ID 1           // CHANGE THIS for each slave device (1-6)
#define ESPNOW_CHANNEL 1         // Must match master_v2
#define SERVO_PIN 13             // GPIO pin for servo motor

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

// ==================== SETUP ====================

void setup() {
  // Start serial communication for debugging
  Serial.begin(115200);
  delay(1000);  // Give serial monitor time to connect
  
  Serial.println("\n" + repeatString("=", 50));
  Serial.println("ESP32 ESP-NOW Slave");
  Serial.println("Device ID: " + String(MY_DEVICE_ID));
  Serial.println(repeatString("=", 50));
  
  // Initialize servo
  ESP32PWM::allocateTimer(0);  // Allocate timer for servo
  myServo.setPeriodHertz(50);  // Standard 50hz servo
  myServo.attach(SERVO_PIN);
  myServo.write(currentAngle);
  Serial.println("Servo initialized at " + String(currentAngle) + "°");
  
  // ESP-NOW Setup
  WiFi.mode(WIFI_STA);  // Station mode for ESP-NOW
  Serial.println("\nIMPORTANT: Copy this MAC address to the master ESP32:");
  Serial.println("MAC Address: " + WiFi.macAddress());
  Serial.println("Add this to the slave_macs array in the master code!");
  Serial.println(repeatString("=", 50));
  
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
  
  Serial.println("\n" + repeatString("=", 50));
  Serial.println("Slave ESP32 ready!");
  Serial.println("Device ID: " + String(MY_DEVICE_ID));
  Serial.println("Waiting for commands from master...");
  Serial.println("MAC: " + WiFi.macAddress());
  Serial.println(repeatString("=", 50) + "\n");
}

// ==================== LOOP ====================

void loop() {
  // Check connection status
  if (hasReceivedMessage && (millis() - lastMessageTime > CONNECTION_TIMEOUT)) {
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
      Serial.println("Servo moved to: " + String(currentAngle) + "°");
    }
  }
  
  delay(10); // Small delay to prevent overwhelming the CPU
}

// ==================== ESP-NOW MESSAGE HANDLER ====================

void onDataReceived(const esp_now_recv_info_t *esp_now_info, const uint8_t *data, int len) {
  // Validate message size
  if (len != sizeof(esp_now_message_t)) {
    Serial.println("[ESP-NOW] Received message with wrong size: " + String(len) + " bytes");
    return;
  }
  
  // Parse the message
  esp_now_message_t* message = (esp_now_message_t*)data;
  
  // Check if message is for this device
  if (message->deviceId != 0 && message->deviceId != MY_DEVICE_ID) {
    return; // Message is for a different device
  }
  
  // Print received message details
  Serial.println("\n[ESP-NOW] Message received from master:");
  Serial.println("   Target Device: " + String(message->deviceId == 0 ? "All devices" : "Device " + String(message->deviceId)));
  Serial.println("   Angle: " + String(message->angle) + "°");
  Serial.println("   Direction: " + String(message->direction ? "forward" : "reverse"));
  Serial.println("   Speed: " + String(message->speed));
  Serial.println("   Interval: " + String(message->interval) + "ms");
  Serial.println("   Delay Offset: " + String(message->delay_offset) + "ms");
  Serial.println("   Timestamp: " + String(message->timestamp) + "ms");
  
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
    
    Serial.println("Servo set to: " + String(targetAngle) + "°");
  }
  
  Serial.println("[ESP-NOW] Message processed successfully");
} 