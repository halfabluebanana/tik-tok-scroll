import React, { useEffect, useState } from 'react';
import styled from 'styled-components';

const ScrollMetrics = () => {
  console.log('ScrollMetrics component mounted');

  const [isVisible, setIsVisible] = useState(true);
  const [metrics, setMetrics] = useState({
    currentSpeed: 0,
    averageSpeed: 0,
    totalDistance: 0,
    scrollPosition: 0,
    direction: 'none' // 'up', 'down', or 'none'
  });
  const [lastScrollY, setLastScrollY] = useState(0);
  const [lastScrollTime, setLastScrollTime] = useState(Date.now());
  const [speedHistory, setSpeedHistory] = useState([]);

  // Function to send metrics to backend
  const sendMetricsToBackend = async (metrics) => {
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
  };

  useEffect(() => {
    console.log('ScrollMetrics useEffect running');
    const scrollWindow = document.getElementById('scroll-window');
    if (!scrollWindow) {
      console.error('Scroll window element not found!');
      return;
    }
    console.log('Scroll window found:', scrollWindow);

    const handleScroll = () => {
      const currentTime = Date.now();
      const currentScrollY = scrollWindow.scrollTop;
      const timeDiff = currentTime - lastScrollTime;
      const scrollDiff = currentScrollY - lastScrollY;
      
      // Calculate direction
      let direction = 'none';
      if (scrollDiff > 0) direction = 'down';
      else if (scrollDiff < 0) direction = 'up';

      // Calculate current speed (pixels per second)
      const currentSpeed = Math.abs(scrollDiff / (timeDiff / 1000));
      
      // Update speed history
      const newSpeedHistory = [...speedHistory, currentSpeed].slice(-10);
      const averageSpeed = newSpeedHistory.reduce((a, b) => a + b, 0) / newSpeedHistory.length;

      const newMetrics = {
        currentSpeed: Math.round(currentSpeed),
        averageSpeed: Math.round(averageSpeed),
        totalDistance: Math.round(metrics.totalDistance + Math.abs(scrollDiff)),
        scrollPosition: Math.round(currentScrollY),
        direction: direction
      };

      console.log('Scroll Metrics:', newMetrics);
      setMetrics(newMetrics);
      setLastScrollY(currentScrollY);
      setLastScrollTime(currentTime);
      setSpeedHistory(newSpeedHistory);

      // Send metrics to backend
      sendMetricsToBackend(newMetrics);
    };

    scrollWindow.addEventListener('scroll', handleScroll);
    return () => scrollWindow.removeEventListener('scroll', handleScroll);
  }, [lastScrollY, lastScrollTime, speedHistory, metrics.totalDistance]);

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

export default ScrollMetrics; 