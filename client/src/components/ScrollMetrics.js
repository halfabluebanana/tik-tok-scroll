import React, { useEffect, useState, useRef, useCallback, memo } from 'react';
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
  // console.log('ScrollMetrics component mounted');

  const [isVisible, setIsVisible] = useState(true);
  const [metrics, setMetrics] = useState({
    currentSpeed: 0,
    averageSpeed: 0,
    totalDistance: 0,
    scrollPosition: 0,
    direction: 'none' // 'up', 'down', or 'none'
  });
  
  // Refs for scroll detection
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const lastScrollDirectionRef = useRef('none');
  const lastScrollStartTimeRef = useRef(0);
  const lastScrollYRef = useRef(0);
  const lastScrollTimeRef = useRef(Date.now());
  const speedHistoryRef = useRef([]);
  const totalDistanceRef = useRef(0);
  const isInitialMountRef = useRef(true);
  const hasScrolledRef = useRef(false);

  // Function to handle scroll start
  const handleScrollStart = useCallback((direction) => {
    // Skip if this is the initial mount or if we haven't scrolled yet
    if (isInitialMountRef.current || !hasScrolledRef.current) {
      isInitialMountRef.current = false;
      hasScrolledRef.current = true;
      return;
    }

    const now = Date.now();
    // Only trigger if we're not already scrolling or if enough time has passed since last scroll
    if (!isScrollingRef.current || (now - lastScrollStartTimeRef.current > 500)) {
      console.log('Scroll started:', direction);
      isScrollingRef.current = true;
      lastScrollStartTimeRef.current = now;
      sendMotorCommand(255, direction === 'down' ? 1 : 0);
    }
  }, []);

  // Function to handle scroll end
  const handleScrollEnd = useCallback(() => {
    if (isScrollingRef.current) {
      console.log('Scroll ended');
      isScrollingRef.current = false;
    }
  }, []);

  // Function to send metrics to backend
  const sendMetricsToBackend = useCallback(async (metrics) => {
    // Skip if this is the initial mount or if we haven't scrolled yet
    if (isInitialMountRef.current || !hasScrolledRef.current) {
      return;
    }

    try {
      const response = await fetch('http://localhost:3001/api/scroll-metrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scrollPosition: Math.min(100, Math.max(0, (metrics.scrollPosition / window.innerHeight) * 100)),
          scrollDirection: metrics.direction === 'down' ? 1 : 0
        }),
      });
      
      if (!response.ok) {
        console.error('Failed to send metrics to backend');
      }
    } catch (error) {
      console.error('Error sending metrics to backend:', error);
    }
  }, []);

  useEffect(() => {
    console.log('ScrollMetrics useEffect running - initial setup');
    const scrollWindow = document.getElementById('scroll-window');
    if (!scrollWindow) {
      console.error('Scroll window element not found!');
      return;
    }

    const handleScroll = () => {
      const currentTime = Date.now();
      const currentScrollY = scrollWindow.scrollTop;
      const timeDiff = currentTime - lastScrollTimeRef.current;
      const scrollDiff = currentScrollY - lastScrollYRef.current;
      
      // Calculate direction
      let direction = 'none';
      if (scrollDiff > 0) direction = 'down';
      else if (scrollDiff < 0) direction = 'up';

      // Calculate current speed (pixels per second)
      const currentSpeed = Math.abs(scrollDiff / (timeDiff / 1000));
      
      // Update speed history
      const newSpeedHistory = [...speedHistoryRef.current, currentSpeed].slice(-10);
      const averageSpeed = newSpeedHistory.reduce((a, b) => a + b, 0) / newSpeedHistory.length;
      speedHistoryRef.current = newSpeedHistory;

      // Update total distance
      totalDistanceRef.current += Math.abs(scrollDiff);

      const newMetrics = {
        currentSpeed: Math.round(currentSpeed),
        averageSpeed: Math.round(averageSpeed),
        totalDistance: Math.round(totalDistanceRef.current),
        scrollPosition: Math.round(currentScrollY),
        direction: direction
      };

      setMetrics(newMetrics);
      lastScrollYRef.current = currentScrollY;
      lastScrollTimeRef.current = currentTime;

      // Send metrics to backend
      sendMetricsToBackend(newMetrics);

      // Handle scroll start/end detection
      if (direction !== 'none' && direction !== lastScrollDirectionRef.current) {
        handleScrollStart(direction);
      }
      lastScrollDirectionRef.current = direction;

      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Set new timeout for scroll end
      scrollTimeoutRef.current = setTimeout(handleScrollEnd, 150);
    };

    scrollWindow.addEventListener('scroll', handleScroll);
    
    return () => {
      console.log('Cleaning up scroll event listener');
      scrollWindow.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (motorCommandTimeout) {
        clearTimeout(motorCommandTimeout);
      }
    };
  }, [handleScrollStart, handleScrollEnd, sendMetricsToBackend]);

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
            <MetricLabel>Current Speed:</MetricLabel>
            <MetricValue>{metrics.currentSpeed} px/s</MetricValue>
          </MetricItem>
          <MetricItem>
            <MetricLabel>Average Speed:</MetricLabel>
            <MetricValue>{metrics.averageSpeed} px/s</MetricValue>
          </MetricItem>
          <MetricItem>
            <MetricLabel>Total Distance:</MetricLabel>
            <MetricValue>{metrics.totalDistance} px</MetricValue>
          </MetricItem>
          <MetricItem>
            <MetricLabel>Scroll Position:</MetricLabel>
            <MetricValue>{metrics.scrollPosition} px</MetricValue>
          </MetricItem>
          <MetricItem>
            <MetricLabel>Direction:</MetricLabel>
            <MetricValue style={{ 
              color: metrics.direction === 'up' ? '#4CAF50' : 
                     metrics.direction === 'down' ? '#2196F3' : '#9E9E9E'
            }}>
              {metrics.direction.toUpperCase()}
            </MetricValue>
          </MetricItem>
        </MetricsPanel>
      )}
    </MetricsContainer>
  );
};

const MetricsContainer = styled.div`
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1000;
`;

const ToggleButton = styled.button`
  background: #2196F3;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 5px;
  cursor: pointer;
  font-weight: bold;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  
  &:hover {
    background: #1976D2;
  }
`;

const MetricsPanel = styled.div`
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 20px;
  border-radius: 10px;
  margin-top: 10px;
  min-width: 200px;
  position: relative;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
`;

const CloseButton = styled.button`
  position: absolute;
  top: 5px;
  right: 5px;
  background: none;
  border: none;
  color: white;
  font-size: 20px;
  cursor: pointer;
  padding: 5px;
  
  &:hover {
    color: #ff4444;
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
  margin-right: 10px;
`;

const MetricValue = styled.span`
  font-family: monospace;
  font-size: 1.1em;
`;

// Memoize the entire component
export default memo(ScrollMetrics); 