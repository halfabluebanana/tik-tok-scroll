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
  const currentContainerIndex = useRef(0);
  const totalContainers = useRef(0);
  const debounceTimeout = useRef(null);
  const DEBOUNCE_DELAY = 100; // 100ms debounce

  const getCurrentContainerIndex = useCallback(() => {
    const scrollWindow = document.getElementById('scroll-window');
    if (!scrollWindow) return -1;

    const videoContainers = document.querySelectorAll('.video-container');
    if (!videoContainers.length) return -1;

    const scrollTop = scrollWindow.scrollTop;
    const windowHeight = window.innerHeight;
    const centerPoint = scrollTop + (windowHeight / 2);

    for (let i = 0; i < videoContainers.length; i++) {
      const container = videoContainers[i];
      const rect = container.getBoundingClientRect();
      const containerTop = rect.top + scrollTop;
      const containerBottom = containerTop + rect.height;

      if (centerPoint >= containerTop && centerPoint <= containerBottom) {
        return i;
      }
    }

    return -1;
  }, []);

  const handleScroll = useCallback((event) => {
    const container = event.target;
    if (!container) return;

    // Clear any existing timeout
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    // Set new timeout
    debounceTimeout.current = setTimeout(() => {
      const now = Date.now();
      const timeSinceLastScroll = now - lastScrollTime.current;
      const scrollSpeed = timeSinceLastScroll > 0 ? Math.abs(event.deltaY) / timeSinceLastScroll : 0;
      
      // Update last scroll time
      lastScrollTime.current = now;

      // Calculate direction
      const direction = event.deltaY > 0 ? 'down' : 'up';

      // Get current container index
      const newContainerIndex = getCurrentContainerIndex();
      
      // Update container index if changed
      if (newContainerIndex !== currentContainerIndex.current) {
        currentContainerIndex.current = newContainerIndex;
        containerEnterTime.current = now;
      }

      // Log scroll event
      console.log('\nScroll Event:', {
        direction,
        speed: Math.round(scrollSpeed * 100) / 100,
        position: Math.round(container.scrollTop),
        containerIndex: currentContainerIndex.current
      });

      // Send metrics to server
      fetch('/api/scroll-metrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scrollPosition: container.scrollTop,
          direction,
          currentSpeed: scrollSpeed,
          containerIndex: currentContainerIndex.current,
          totalContainers: document.querySelectorAll('.video-container').length,
          timeInContainer: now - containerEnterTime.current
        })
      })
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(data => {
        if (!data.success) {
          console.error('\nServer error:', data.error);
        }
      })
      .catch(error => {
        console.error('\nError sending metrics:', error.message);
      });
    }, DEBOUNCE_DELAY);
  }, [getCurrentContainerIndex]);

  useEffect(() => {
    const container = document.getElementById('scroll-window');
    if (container) {
      container.addEventListener('wheel', handleScroll);
      return () => container.removeEventListener('wheel', handleScroll);
    }
  }, [handleScroll]);
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