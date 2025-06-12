#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
// #include <noise.h>

// Create PWM controller instance with default I2C address (0x40)
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver();

// Define motor pins (0-15 on PCA9685)
#define MOTOR1 0
#define MOTOR2 4
#define MOTOR3 8
#define MOTOR4 12

// Define motor limits - Increased range for more movement
#define MOTOR_MIN_PULSE  1000  // Increased from 500 for more range
#define MOTOR_MAX_PULSE  2000  // Adjusted from 2500 for better control
#define MOTOR_FREQ 50 // Analog motors run at ~50 Hz

String inputString = "";    // String to hold incoming data
boolean stringComplete = false;  // Whether the string is complete

// Add timing variables
unsigned long lastMotorStartTime = 0;
const unsigned long MOTOR_DELAY = 200; // 200ms delay between motors
int currentMotorIndex = 0;
bool isMotorSequenceActive = false;
int currentSpeed = 0;
int currentDirection = 0;

void setup() {
  // Initialize serial communication
  Serial.begin(9600);  // Changed to 9600 for Arduino Uno
  
  Serial.println("Scroll-Controlled Motor System");
  Serial.println("Waiting for commands...");
  
  // Initialize I2C
  Wire.begin();
  
  // Initialize PCA9685
  pwm.begin();
  pwm.setOscillatorFrequency(27000000);
  pwm.setPWMFreq(MOTOR_FREQ);
  
  delay(100);
  
  // Initialize all motors to stop
  setMotorSpeed(MOTOR1, 0);
  setMotorSpeed(MOTOR2, 0);
  setMotorSpeed(MOTOR3, 0);
  setMotorSpeed(MOTOR4, 0);
  
  Serial.println("Motors initialized to stop position");
}

// Helper function to set motor speed
void setMotorSpeed(uint8_t motorNum, int speed) {
  if (speed < -100) speed = -100;
  if (speed > 100) speed = 100;
  
  // Map speed (-100 to 100) to pulse width
  int pulse = map(abs(speed), 0, 100, MOTOR_MIN_PULSE, MOTOR_MAX_PULSE);
  
  Serial.print("Setting motor ");
  Serial.print(motorNum);
  Serial.print(" to speed ");
  Serial.print(speed);
  Serial.print(" (pulse: ");
  Serial.print(pulse);
  Serial.println(")");
  
  // Set direction based on speed sign
  if (speed >= 0) {
    pwm.writeMicroseconds(motorNum, pulse);
  } else {
    // For negative speeds, use the same pulse width but in the opposite direction
    pwm.writeMicroseconds(motorNum, MOTOR_MAX_PULSE - (pulse - MOTOR_MIN_PULSE));
  }
}

void loop() {
  // Check if we have received a complete command
  if (stringComplete) {
    Serial.print("Processing command: ");
    Serial.println(inputString);
    
    // Parse the command (format: "scrollPosition,scrollDirection")
    int commaIndex = inputString.indexOf(',');
    if (commaIndex != -1) {
      String posStr = inputString.substring(0, commaIndex);
      String dirStr = inputString.substring(commaIndex + 1);
      
      // Debug: Print parsed values
      Serial.print("Parsed position: ");
      Serial.println(posStr);
      Serial.print("Parsed direction: ");
      Serial.println(dirStr);
      
      int scrollPosition = posStr.toInt();
      int scrollDirection = dirStr.toInt();
      
      // Validate the parsed values
      if (scrollPosition >= 0 && scrollPosition <= 255 && 
          (scrollDirection == 0 || scrollDirection == 1)) {
        
        Serial.print("Valid values - Position: ");
        Serial.print(scrollPosition);
        Serial.print(", Direction: ");
        Serial.println(scrollDirection);
        
        // Map scroll position (0-255) to motor speed (0 to 100)
        currentSpeed = map(scrollPosition, 0, 255, 0, 100);
        currentDirection = scrollDirection;
        
        Serial.print("Mapped to motor speed: ");
        Serial.println(currentSpeed);
        
        // Start the motor sequence
        isMotorSequenceActive = true;
        currentMotorIndex = 0;
        lastMotorStartTime = millis();
        
        // Start the first motor immediately
        if (currentDirection == 1) {  // Scrolling down (counter-clockwise)
          Serial.println("Starting motor sequence - counter-clockwise");
          setMotorSpeed(MOTOR1, -currentSpeed);
        } else {  // Scrolling up (clockwise)
          Serial.println("Starting motor sequence - clockwise");
          setMotorSpeed(MOTOR1, currentSpeed);
        }
      } else {
        Serial.println("Error: Invalid position or direction values");
      }
    } else {
      Serial.println("Error: Invalid command format - missing comma");
    }
    // Clear the string for the next command
    inputString = "";
    stringComplete = false;
  }

  // Handle motor sequence timing
  if (isMotorSequenceActive) {
    unsigned long currentTime = millis();
    if (currentTime - lastMotorStartTime >= MOTOR_DELAY) {
      currentMotorIndex++;
      if (currentMotorIndex < 4) {  // We have 4 motors
        int motorPin;
        switch (currentMotorIndex) {
          case 1: motorPin = MOTOR2; break;
          case 2: motorPin = MOTOR3; break;
          case 3: motorPin = MOTOR4; break;
        }
        
        if (currentDirection == 1) {
          setMotorSpeed(motorPin, -currentSpeed);
        } else {
          setMotorSpeed(motorPin, currentSpeed);
        }
        
        lastMotorStartTime = currentTime;
      } else {
        isMotorSequenceActive = false; 
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