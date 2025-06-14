#include <WiFi.h>
#include <esp_now.h>
#include <ArduinoJson.h>

// Configuration
#define ESPNOW_CHANNEL 1
#define MAX_SLAVES 6
#define BROADCAST_INTERVAL 100  // ms between broadcasts
#define CASCADE_DELAY 50       // ms delay between each slave

// ESP-NOW message structure
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

// Slave MAC addresses
uint8_t slave_macs[MAX_SLAVES][6] = {
    {0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0x01},  // Slave 1
    {0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0x02},  // Slave 2
    {0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0x03},  // Slave 3
    {0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0x04},  // Slave 4
    {0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0x05},  // Slave 5
    {0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0x06}   // Slave 6
};

// Last received message
esp_now_message_t lastMessage = {
    .deviceId = 0,
    .angle = 90,
    .direction = 1,
    .speed = 100,
    .interval = BROADCAST_INTERVAL,
    .delay_offset = 0,
    .timestamp = 0,
    .currentContainer = "",
    .timeSpent = 0,
    .timeBetween = 0
};

// Helper function to repeat a string
String repeatString(const char* str, int times) {
    String result = "";
    for (int i = 0; i < times; i++) {
        result += str;
    }
    return result;
}

// Send log to server
void sendLog(const char* type, const char* message) {
    StaticJsonDocument<256> doc;
    doc["type"] = "log";
    doc["source"] = "master";
    doc["message"] = message;
    doc["timestamp"] = millis();
    
    serializeJson(doc, Serial);
    Serial.println();
}

void setup() {
    Serial.begin(115200);
    Serial.println("\nESP32 ESP-NOW Master");
    Serial.println(repeatString("=", 50));

    // Initialize ESP-NOW
    if (esp_now_init() != ESP_OK) {
        sendLog("error", "Error initializing ESP-NOW");
        return;
    }

    // Register callback
    esp_now_register_send_cb(OnDataSent);

    // Add peers
    for (int i = 0; i < MAX_SLAVES; i++) {
        esp_now_peer_info_t peerInfo = {};
        memcpy(peerInfo.peer_addr, slave_macs[i], 6);
        peerInfo.channel = ESPNOW_CHANNEL;
        peerInfo.encrypt = false;

        if (esp_now_add_peer(&peerInfo) != ESP_OK) {
            char message[50];
            snprintf(message, sizeof(message), "Failed to add peer %d", i + 1);
            sendLog("error", message);
            return;
        }
    }

    sendLog("info", "ESP-NOW initialized");
    Serial.println(repeatString("=", 50));
}

void loop() {
    if (Serial.available()) {
        String jsonStr = Serial.readStringUntil('\n');
        processSerialInput(jsonStr);
    }
}

void processSerialInput(String jsonStr) {
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, jsonStr);

    if (error) {
        char message[100];
        snprintf(message, sizeof(message), "deserializeJson() failed: %s", error.c_str());
        sendLog("error", message);
        return;
    }

    // Extract scroll data
    if (doc.containsKey("type") && strcmp(doc["type"], "scroll_data") == 0) {
        lastMessage.angle = doc["angle"] | 90;
        lastMessage.direction = doc["direction"] | 1;
        lastMessage.speed = doc["speed"] | 100;
        lastMessage.timestamp = millis();

        // Extract container metrics if available
        if (doc.containsKey("containerMetrics")) {
            JsonObject metrics = doc["containerMetrics"];
            if (metrics.containsKey("currentContainer")) {
                strncpy(lastMessage.currentContainer, 
                       metrics["currentContainer"] | "", 
                       sizeof(lastMessage.currentContainer) - 1);
            }
            lastMessage.timeSpent = metrics["timeSpent"] | 0;
            lastMessage.timeBetween = metrics["timeBetween"] | 0;
        }

        // Log received data
        char message[100];
        snprintf(message, sizeof(message), "Received scroll data: angle=%d, dir=%d, speed=%d",
                lastMessage.angle, lastMessage.direction, lastMessage.speed);
        sendLog("info", message);

        // Broadcast to all slaves with cascading delay
        broadcastToAllSlaves();
    }
}

void broadcastToAllSlaves() {
    for (int i = 0; i < MAX_SLAVES; i++) {
        esp_now_message_t message = lastMessage;
        message.deviceId = i + 1;  // Set target device ID
        message.delay_offset = i * CASCADE_DELAY;  // Add delay for cascading effect

        esp_err_t result = esp_now_send(slave_macs[i], (uint8_t*)&message, sizeof(message));
        
        if (result == ESP_OK) {
            char logMessage[100];
            snprintf(logMessage, sizeof(logMessage), 
                    "Sent to slave %d: angle=%d, dir=%d, speed=%d, delay=%lu",
                    i + 1, message.angle, message.direction, message.speed, message.delay_offset);
            sendLog("info", logMessage);
        } else {
            char logMessage[50];
            snprintf(logMessage, sizeof(logMessage), "Failed to send to slave %d", i + 1);
            sendLog("error", logMessage);
        }
    }
}

void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
    char macStr[18];
    snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
             mac_addr[0], mac_addr[1], mac_addr[2], mac_addr[3], mac_addr[4], mac_addr[5]);
    
    char message[100];
    snprintf(message, sizeof(message), "Sent to %s: %s", 
             macStr, status == ESP_NOW_SEND_SUCCESS ? "Success" : "Fail");
    sendLog("info", message);
} 