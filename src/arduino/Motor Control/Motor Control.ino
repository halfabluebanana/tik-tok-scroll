#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include <Servo.h>
// #include <noise.h>

// Create PWM controller instance with default I2C address (0x40)
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver();

// Create servo objects for pins 1-15
Servo servos[15];

// Define servo limits
#define SERVO_MIN_PULSE  500   // Minimum pulse width
#define SERVO_MAX_PULSE  2500  // Maximum pulse width
#define SERVO_FREQ 50          // Servos run at ~50 Hz

String inputString = "";    // String to hold incoming data
boolean stringComplete = false;  // Whether the string is complete

// Add timing variables
unsigned long lastServoStartTime = 0;
const unsigned long SERVO_DELAY = 100; // 100ms delay between servos
int currentServoIndex = 0;
bool isServoSequenceActive = false;
int currentAngle = 0;
int currentDirection = 0;

void setup() {
  // Initialize serial communication
  Serial.begin(9600);
  
  Serial.println("Scroll-Controlled Servo System");
  Serial.println("Waiting for commands...");
  
  // Initialize I2C
  Wire.begin();
  
  // Initialize PCA9685
  pwm.begin();
  pwm.setOscillatorFrequency(27000000);
  pwm.setPWMFreq(SERVO_FREQ);
  
  delay(100);
  
  // Attach servos to pins 1-15
  for (int i = 0; i < 15; i++) {
    Serial.print("Attaching servo to pin ");
    Serial.println(i + 1);
    servos[i].attach(i + 1);  // Attach to pins 1-15
    servos[i].write(90);      // Initialize to center position
    delay(100);  // Add delay between servo attachments
  }
  
  Serial.println("Servos initialized to center position");
  
  // Test movement
  Serial.println("Testing servo movement...");
  for (int i = 0; i < 15; i++) {
    Serial.print("Testing servo ");
    Serial.println(i + 1);
    servos[i].write(0);
    delay(500);
    servos[i].write(180);
    delay(500);
    servos[i].write(90);
    delay(500);
  }
  Serial.println("Servo test complete");
}

// Helper function to set servo angle
void setServoAngle(uint8_t servoNum, int angle) {
  if (angle < 0) angle = 0;
  if (angle > 180) angle = 180;
  
  Serial.print("Setting servo ");
  Serial.print(servoNum + 1);  // Add 1 because we're using pins 1-15
  Serial.print(" to angle ");
  Serial.println(angle);
  
  servos[servoNum].write(angle);
  delay(20);  // Add small delay for servo movement
}

void loop() {
  // Check if we have received a complete command
  if (stringComplete) {
    Serial.print("Processing command: ");
    Serial.println(inputString);
    
    // Parse the command (format: "angle,direction")
    int commaIndex = inputString.indexOf(',');
    if (commaIndex != -1) {
      String angleStr = inputString.substring(0, commaIndex);
      String dirStr = inputString.substring(commaIndex + 1);
      
      // Debug: Print parsed values
      Serial.print("Parsed angle: ");
      Serial.println(angleStr);
      Serial.print("Parsed direction: ");
      Serial.println(dirStr);
      
      int angle = angleStr.toInt();
      int direction = dirStr.toInt();
      
      // Validate the parsed values
      if (angle >= 0 && angle <= 180 && 
          (direction == 0 || direction == 1)) {
        
        Serial.print("Valid values - Angle: ");
        Serial.print(angle);
        Serial.print(", Direction: ");
        Serial.println(direction);
        
        currentAngle = angle;
        currentDirection = direction;
        
        // Start the servo sequence
        isServoSequenceActive = true;
        currentServoIndex = 0;
        lastServoStartTime = millis();
        
        // Start the first servo immediately
        if (currentDirection == 1) {  // Scrolling down
          Serial.println("Starting servo sequence - forward");
          setServoAngle(0, currentAngle);
        } else {  // Scrolling up
          Serial.println("Starting servo sequence - backward");
          setServoAngle(0, 180 - currentAngle);
        }
      } else {
        Serial.println("Error: Invalid angle or direction values");
      }
    } else {
      Serial.println("Error: Invalid command format - missing comma");
    }
    // Clear the string for the next command
    inputString = "";
    stringComplete = false;
  }

  // Handle servo sequence timing
  if (isServoSequenceActive) {
    unsigned long currentTime = millis();
    if (currentTime - lastServoStartTime >= SERVO_DELAY) {
      currentServoIndex++;
      if (currentServoIndex < 15) {  // We have 15 servos
        if (currentDirection == 1) {
          setServoAngle(currentServoIndex, currentAngle);
        } else {
          setServoAngle(currentServoIndex, 180 - currentAngle);
        }
        
        lastServoStartTime = currentTime;
      } else {
        isServoSequenceActive = false;
      }
    }
  }
}

// Serial event handler
void serialEvent() {
  while (Serial.available()) {
    char inChar = (char)Serial.read();
    
    // Debug: Print received character
    Serial.print("Received char: ");
    Serial.println(inChar);
    
    // Only add valid characters to the input string
    if (inChar >= 32 && inChar <= 126) {  // Printable ASCII characters
      inputString += inChar;
    }
    
    if (inChar == '\n') {
      stringComplete = true;
      Serial.print("Complete command received: ");
      Serial.println(inputString);
    }
  }
} 