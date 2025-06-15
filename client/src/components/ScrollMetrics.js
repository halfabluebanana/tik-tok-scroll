import React, { useEffect, useState, useRef, useCallback } from 'react';
import styled from 'styled-components';

// Move motor command outside component and make it a singleton
let motorCommandTimeout = null;
const sendMotorCommand = async (speed, direction) => {
  // Clear any existing timeout
  if (motorCommandTimeout) {
    clearTimeout(motorCommandTimeout);
  }

  // Debounce the motor command
  motorCommandTimeout = setTimeout(async () => {
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
  }, 100); // 100ms debounce
};

const ScrollMetrics = () => {
  const [isVisible, setIsVisible] = useState(true);
  
  // Refs for scroll tracking
  const lastScrollYRef = useRef(0);
  const lastContainerIndexRef = useRef(-1);
  const lastContainerTimeRef = useRef(Date.now());
  const lastSpeedRef = useRef(0);
  const smoothingFactor = 0.3; // For exponential smoothing
  const containerRef = useRef(null);
  const lastScrollTime = useRef(Date.now());
  const containerEnterTime = useRef(Date.now());
  const currentContainerIndex = useRef(-1);
  const totalContainers = useRef(0);

  const handleScroll = useCallback((event) => {
    if (!containerRef.current) return;

    const now = Date.now();
    const timeSinceLastScroll = now - lastScrollTime.current;
    const container = containerRef.current;
    
    // Calculate scroll speed (pixels per second)
    const scrollSpeed = timeSinceLastScroll > 0 
      ? Math.abs(event.deltaY) / (timeSinceLastScroll / 1000)
      : 0;
    
    // Update last scroll time
    lastScrollTime.current = now;

    // Get container metrics
    const containerMetrics = {
      containerIndex: currentContainerIndex.current,
      timeSpentInContainer: now - containerEnterTime.current
    };

    // Log essential metrics
    console.log('Scroll Event:', {
      timestamp: new Date().toISOString(),
      scrollPosition: container.scrollTop,
      direction: event.deltaY > 0 ? 'down' : 'up',
      speed: Math.round(scrollSpeed),
      containerIndex: currentContainerIndex.current
    });

    // Send updated metrics to server
    fetch('/api/scroll-metrics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scrollPosition: container.scrollTop,
        direction: event.deltaY > 0 ? 'down' : 'up',
        currentSpeed: scrollSpeed,
        containerIndex: currentContainerIndex.current,
        totalContainers: totalContainers.current,
        containerMetrics
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    })
    .catch(error => {
      console.error('Error sending metrics:', error.message);
    });
  }, [currentContainerIndex, totalContainers]);

  useEffect(() => {
    console.log('[Browser] Setting up scroll event listener');
    const scrollWindow = document.getElementById('scroll-window');
    if (!scrollWindow) {
      console.error('[Browser] Scroll window element not found!');
      return;
    }

    scrollWindow.addEventListener('scroll', handleScroll);
    
    return () => {
      console.log('[Browser] Cleaning up scroll event listener');
      scrollWindow.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  if (!isVisible) {
    return (
      <ToggleButton onClick={() => setIsVisible(true)}>
        Show Metrics
      </ToggleButton>
    );
  }

  return (
    <MetricsContainer>
      <ToggleButton onClick={() => setIsVisible(!isVisible)}>
        {isVisible ? 'Hide Metrics' : 'Show Metrics'}
      </ToggleButton>
      {isVisible && (
        <MetricsPanel>
          <CloseButton onClick={() => setIsVisible(false)}>×</CloseButton>
          <MetricItem>
            <MetricLabel>Scroll Direction:</MetricLabel>
            <MetricValue>{lastScrollYRef.current > 0 ? 'Scrolling' : 'Idle'}</MetricValue>
          </MetricItem>
          <MetricItem>
            <MetricLabel>Current Container:</MetricLabel>
            <MetricValue>{lastContainerIndexRef.current + 1}</MetricValue>
          </MetricItem>
        </MetricsPanel>
      )}
    </MetricsContainer>
  );
};

const MetricsContainer = styled.div`
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
`;

const ToggleButton = styled.button`
  padding: 10px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  
  &:hover {
    background-color: #0056b3;
  }
`;

const MetricsPanel = styled.div`
  position: absolute;
  bottom: 60px;
  right: 0;
  background-color: white;
  padding: 20px;
  border-radius: 5px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  min-width: 200px;
`;

const CloseButton = styled.button`
  position: absolute;
  top: 5px;
  right: 5px;
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #666;
  
  &:hover {
    color: #000;
  }
`;

const MetricItem = styled.div`
  margin: 10px 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const MetricLabel = styled.span`
  font-weight: bold;
  color: #666;
`;

const MetricValue = styled.span`
  color: #333;
`;

export default ScrollMetrics; 