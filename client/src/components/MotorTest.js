import React from 'react';
import styled from 'styled-components';

const MotorTest = () => {
  const sendMotorCommand = async (speed, direction) => {
    console.log('Yooooooooooooooo  ~~~~~~~~~~~~~~~~~~~');
    try {
      const response = await fetch('http://localhost:3001/api/scroll-metrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scrollPosition: speed,
          scrollDirection: direction
        }),
      });
      
      if (!response.ok) {
        console.error('Failed to send motor command');
      }
    } catch (error) {
      console.error('Error sending motor command:', error);
    }
  };

  return (
    <TestContainer>
      <h2>Motor Test Controls</h2>
      <ButtonGroup>
        <TestButton onClick={() => sendMotorCommand(255, 1)}>
          Full Speed Forward
        </TestButton>
        <TestButton onClick={() => sendMotorCommand(127, 1)}>
          Half Speed Forward
        </TestButton>
        <TestButton onClick={() => sendMotorCommand(0, 0)}>
          Stop
        </TestButton>
        <TestButton onClick={() => sendMotorCommand(127, 0)}>
          Half Speed Backward
        </TestButton>
        <TestButton onClick={() => sendMotorCommand(255, 0)}>
          Full Speed Backward
        </TestButton>
      </ButtonGroup>
    </TestContainer>
  );
};

const TestContainer = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.8);
  padding: 20px;
  border-radius: 10px;
  color: white;
  text-align: center;
  z-index: 1000;
`;

const ButtonGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 20px;
`;

const TestButton = styled.button`
  background: #2196F3;
  color: white;
  border: none;
  padding: 15px 30px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
  transition: background 0.3s ease;
  
  &:hover {
    background: #1976D2;
  }
  
  &:active {
    background: #1565C0;
  }
`;

export default MotorTest; 