#include <WiFi.h>
#include <esp_now.h>

// Built-in LED pin
#define LED_PIN 2

// Slave MAC address
uint8_t slaveAddress[] = { 0xF0, 0x24, 0xF9, 0xF5, 0x66, 0x70 }; // Mac address for slave 3

// Optimized data structure for motor commands
typedef struct {
    uint8_t deviceId;    // 1 byte for device ID (0-255)
    int16_t angle;       // 2 bytes for angle (-32768 to 32767)
    int8_t direction;    // 1 byte for direction (-128 to 127)
    uint16_t interval;   // 2 bytes for interval (0-65535)
    uint32_t timestamp;  // 4 bytes for timestamp
} MotorCommand;

MotorCommand outgoingData;
bool lastSendSuccess = false;
unsigned long lastSendTime = 0;
const unsigned long SEND_INTERVAL = 1000; // 1 second between sends

// LED patterns
void blinkLED(int times, int onTime, int offTime) {
    for (int i = 0; i < times; i++) {
        digitalWrite(LED_PIN, HIGH);
        delay(onTime);
        digitalWrite(LED_PIN, LOW);
        delay(offTime);
    }
}

void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
    lastSendSuccess = (status == ESP_NOW_SEND_SUCCESS);
    
    // Update LED based on send status
    if (lastSendSuccess) {
        // Quick double blink for success
        blinkLED(2, 50, 50);
    } else {
        // Single long blink for failure
        blinkLED(1, 200, 0);
    }
    
    // Send acknowledgment to server
    Serial.print("{\"type\":\"espnow_ack\",\"success\":");
    Serial.print(lastSendSuccess ? "true" : "false");
    Serial.print(",\"timestamp\":");
    Serial.print(millis());
    Serial.println("}");
}

void setup() {
    Serial.begin(115200);
    
    // Initialize LED
    pinMode(LED_PIN, OUTPUT);
    
    // Initial LED sequence - 3 quick blinks
    blinkLED(3, 100, 100);
    
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    
    if (esp_now_init() != ESP_OK) {
        Serial.println("ESPNow Init Failed");
        // Error pattern - 5 long blinks
        blinkLED(5, 200, 200);
        return;
    }
    
    esp_now_register_send_cb(OnDataSent);
    
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, slaveAddress, 6);
    peerInfo.channel = 0;
    peerInfo.encrypt = false;
    
    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
        Serial.println("Failed to add peer");
        // Error pattern - 5 long blinks
        blinkLED(5, 200, 200);
        return;
    }
    
    // Initialization complete - solid on
    digitalWrite(LED_PIN, HIGH);
}

void loop() {
    // Read incoming serial data
    if (Serial.available() > 0) {
        String input = Serial.readStringUntil('\n');
        
        // Parse JSON-like input
        // Expected format: {"type":"scroll_data","deviceId":0,"angle":90,"direction":1,"speed":50,"interval":1000}
        if (input.indexOf("\"type\":\"scroll_data\"") != -1) {
            // Extract values using simple string parsing
            int deviceIdStart = input.indexOf("\"deviceId\":") + 11;
            int angleStart = input.indexOf("\"angle\":") + 8;
            int directionStart = input.indexOf("\"direction\":") + 12;
            int intervalStart = input.indexOf("\"interval\":") + 11;
            
            outgoingData.deviceId = input.substring(deviceIdStart, input.indexOf(",", deviceIdStart)).toInt();
            outgoingData.angle = input.substring(angleStart, input.indexOf(",", angleStart)).toInt();
            outgoingData.direction = input.substring(directionStart, input.indexOf(",", directionStart)).toInt();
            outgoingData.interval = input.substring(intervalStart, input.indexOf("}", intervalStart)).toInt();
            outgoingData.timestamp = millis();
            
            // Send data to slave
            esp_now_send(slaveAddress, (uint8_t *)&outgoingData, sizeof(outgoingData));
            lastSendTime = millis();
        }
    }
    
    // Blink LED every second to show activity
    if (millis() - lastSendTime > SEND_INTERVAL) {
        digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    }
}
