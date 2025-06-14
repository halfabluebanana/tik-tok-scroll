#include <WiFi.h>
#include <esp_now.h>
#include <Servo.h>
#include <Arduino_JSON.h>

// Configuration
#define ESPNOW_CHANNEL 1
#define SERVO_PIN 13  // GPIO pin for servo
#define DEVICE_ID 1   // Change this for each slave (1-6)

// ESP-NOW message structure
typedef struct {
    int deviceId;              // Target device: 0=broadcast to all, 1-6=specific device
    int angle;                 // Servo angle: 0-180 degrees
    int direction;             // Direction: 0=up/reverse, 1=down/forward  
    int speed;                 // Animation speed: 0-255
    unsigned long interval;    // Timing between animations (milliseconds)
    unsigned long delay_offset; // Device-specific timing offset (milliseconds)
    unsigned long timestamp;   // When command was created (for debugging)
} esp_now_message_t;

// Global variables
Servo servo;
esp_now_message_t lastMessage;
int currentAngle = 90;
unsigned long lastMoveTime = 0;

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

void setup() {
    Serial.begin(115200);
    Serial.println("\nESP32 ESP-NOW Slave");
    Serial.println("==================");

    // Initialize servo
    servo.attach(SERVO_PIN);
    servo.write(currentAngle);
    sendLog("info", "Servo initialized");

    // Initialize ESP-NOW
    if (esp_now_init() != ESP_OK) {
        sendLog("error", "Error initializing ESP-NOW");
        return;
    }

    // Register callback
    esp_now_register_recv_cb(OnDataReceived);
    sendLog("info", "ESP-NOW initialized");
}

void loop() {
    // Smooth servo movement
    if (currentAngle != lastMessage.angle) {
        unsigned long currentTime = millis();
        if (currentTime - lastMoveTime >= 20) {  // 20ms delay between movements
            int step = (lastMessage.angle > currentAngle) ? 1 : -1;
            currentAngle += step;
            servo.write(currentAngle);
            lastMoveTime = currentTime;
        }
    }
}

void OnDataReceived(const uint8_t *mac_addr, const uint8_t *data, int data_len) {
    if (data_len != sizeof(esp_now_message_t)) {
        sendLog("error", "Invalid message length");
        return;
    }

    esp_now_message_t message;
    memcpy(&message, data, sizeof(message));

    // Only process messages for this device or broadcast messages
    if (message.deviceId != 0 && message.deviceId != DEVICE_ID) {
        return;
    }

    // Update last message
    memcpy(&lastMessage, &message, sizeof(message));

    // Log received data
    char logMessage[100];
    snprintf(logMessage, sizeof(logMessage), 
            "Received: angle=%d, dir=%d, speed=%d",
            message.angle, message.direction, message.speed);
    sendLog("info", logMessage);
} 