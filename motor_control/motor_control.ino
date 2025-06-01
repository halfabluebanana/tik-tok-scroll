#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

// Create PWM controller instance with default I2C address (0x40)
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver();

// Define motor pins (0-15 on PCA9685)
#define MOTOR1 0
#define MOTOR2 4
#define MOTOR3 8
#define MOTOR4 12

// Define motor limits
#define MOTOR_MIN_PULSE  500  // Min pulse length (microseconds)
#define MOTOR_MAX_PULSE  2500 // Max pulse length (microseconds)
#define MOTOR_FREQ 50 // Analog motors run at ~50 Hz

String inputString = "";    // String to hold incoming data
boolean stringComplete = false;  // Whether the string is complete

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
    pwm.writeMicroseconds(motorNum, MOTOR_MIN_PULSE);
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
      String posStr = inputString.substring(0, commaIndex); // To test, make this 255
      String dirStr = inputString.substring(commaIndex + 1); // To test make this 0
      
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
        
        // Map scroll position (0-255) to motor speed (-100 to 100)
        int motorSpeed = map(scrollPosition, 0, 255, -100, 100);
        
        Serial.print("Mapped to motor speed: ");
        Serial.println(motorSpeed);
        
        // Control motors based on scroll direction
        if (scrollDirection == 1) {  // Scrolling down
          Serial.println("Scrolling down - Setting motors");
          setMotorSpeed(MOTOR1, motorSpeed);
          setMotorSpeed(MOTOR2, -motorSpeed);
          setMotorSpeed(MOTOR3, motorSpeed);
          setMotorSpeed(MOTOR4, -motorSpeed);
        } else {  // Scrolling up
          Serial.println("Scrolling up - Setting motors");
          setMotorSpeed(MOTOR1, -motorSpeed);
          setMotorSpeed(MOTOR2, motorSpeed);
          setMotorSpeed(MOTOR3, -motorSpeed);
          setMotorSpeed(MOTOR4, motorSpeed);
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