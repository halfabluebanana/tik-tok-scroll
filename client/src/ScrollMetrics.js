import React, { useEffect, useState, useRef } from 'react';
import s from 'styled-components';

const ScrollMetrics = () => {
  const [metrics, setMetrics] = useState({
    currentSpeed: 0,
    lastScrollTop: 0,
    lastScrollTime: Date.now(),
    totalScrollDistance: 0,
    averageSpeed: 0,
    direction: 'none',
    scrollPosition: 0,
    containerMetrics: {
      currentContainer: null,
      containerStartTime: null,
      containerTimes: {},
      lastContainerChange: null,
      timeBetweenContainers: []
    }
  });

  const scrollCount = useRef(0);
  const totalSpeed = useRef(0);

  useEffect(() => {
    const scrollWindow = document.getElementById('scroll-window');
    const containers = document.querySelectorAll('.video-container');
    
    const getCurrentContainer = () => {
      const scrollTop = scrollWindow.scrollTop;
      const windowHeight = window.innerHeight;
      const centerPoint = scrollTop + (windowHeight / 2);
      
      for (const container of containers) {
        const rect = container.getBoundingClientRect();
        const containerTop = rect.top + scrollTop;
        const containerBottom = containerTop + rect.height;
        
        if (centerPoint >= containerTop && centerPoint <= containerBottom) {
          return container.id;
        }
      }
      return null;
    };

    const updateContainerMetrics = (currentContainer) => {
      const now = Date.now();
      
      // If we're in a new container
      if (currentContainer !== metrics.containerMetrics.currentContainer) {
        // Record time spent in previous container
        if (metrics.containerMetrics.currentContainer && metrics.containerMetrics.containerStartTime) {
          const timeSpent = now - metrics.containerMetrics.containerStartTime;
          setMetrics(prev => ({
            ...prev,
            containerMetrics: {
              ...prev.containerMetrics,
              containerTimes: {
                ...prev.containerMetrics.containerTimes,
                [prev.containerMetrics.currentContainer]: 
                  (prev.containerMetrics.containerTimes[prev.containerMetrics.currentContainer] || 0) + timeSpent
              }
            }
          }));
        }

        // Record time between containers
        if (metrics.containerMetrics.lastContainerChange) {
          const timeBetween = now - metrics.containerMetrics.lastContainerChange;
          setMetrics(prev => ({
            ...prev,
            containerMetrics: {
              ...prev.containerMetrics,
              timeBetweenContainers: [...prev.containerMetrics.timeBetweenContainers, timeBetween]
            }
          }));
        }

        // Update container tracking
        setMetrics(prev => ({
          ...prev,
          containerMetrics: {
            ...prev.containerMetrics,
            currentContainer,
            containerStartTime: now,
            lastContainerChange: now
          }
        }));
      }
    };

    const handleScroll = () => {
      const currentTime = Date.now();
      const currentScrollTop = scrollWindow.scrollTop;
      const timeDiff = currentTime - metrics.lastScrollTime;
      const scrollDiff = currentScrollTop - metrics.lastScrollTop;
      
      // Calculate scroll speed (pixels per second)
      const currentSpeed = Math.abs((scrollDiff / timeDiff) * 1000);
      
      // Determine scroll direction
      const direction = scrollDiff > 0 ? 'down' : scrollDiff < 0 ? 'up' : 'none';
      
      // Calculate scroll position (0-255)
      const maxScroll = scrollWindow.scrollHeight - window.innerHeight;
      const scrollPosition = Math.round((currentScrollTop / maxScroll) * 255);
      
      // Update metrics
      scrollCount.current++;
      totalSpeed.current += currentSpeed;
      
      setMetrics(prev => ({
        currentSpeed: Math.round(currentSpeed),
        lastScrollTop: currentScrollTop,
        lastScrollTime: currentTime,
        totalScrollDistance: prev.totalScrollDistance + Math.abs(scrollDiff),
        averageSpeed: Math.round(totalSpeed.current / scrollCount.current),
        direction,
        scrollPosition,
        containerMetrics: prev.containerMetrics
      }));

      // Update container metrics
      updateContainerMetrics(getCurrentContainer());

      // Send metrics to server
      fetch('/api/scroll-metrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentSpeed: Math.round(currentSpeed),
          averageSpeed: Math.round(totalSpeed.current / scrollCount.current),
          totalDistance: metrics.totalScrollDistance + Math.abs(scrollDiff),
          scrollPosition,
          direction,
          containerMetrics: {
            currentContainer: getCurrentContainer(),
            timeSpent: metrics.containerMetrics.currentContainer && metrics.containerMetrics.containerStartTime
              ? Date.now() - metrics.containerMetrics.containerStartTime
              : 0,
            timeBetween: metrics.containerMetrics.timeBetweenContainers.length > 0
              ? metrics.containerMetrics.timeBetweenContainers[metrics.containerMetrics.timeBetweenContainers.length - 1]
              : 0
          }
        }),
      });
    };

    scrollWindow.addEventListener('scroll', handleScroll);
    return () => scrollWindow.removeEventListener('scroll', handleScroll);
  }, [metrics.lastScrollTime, metrics.lastScrollTop, metrics.totalScrollDistance, metrics.containerMetrics]);

  return (
    <MetricsContainer>
      <MetricsTitle>Scroll Metrics</MetricsTitle>
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
        <MetricValue>{Math.round(metrics.totalScrollDistance)} px</MetricValue>
      </MetricItem>
      <MetricItem>
        <MetricLabel>Direction:</MetricLabel>
        <MetricValue>{metrics.direction.toUpperCase()}</MetricValue>
      </MetricItem>
      <MetricItem>
        <MetricLabel>Scroll Position:</MetricLabel>
        <MetricValue>{metrics.scrollPosition}/255</MetricValue>
      </MetricItem>
      <MetricsTitle>Container Metrics</MetricsTitle>
      <MetricItem>
        <MetricLabel>Current Container:</MetricLabel>
        <MetricValue>{metrics.containerMetrics.currentContainer || 'None'}</MetricValue>
      </MetricItem>
      <MetricItem>
        <MetricLabel>Time in Container:</MetricLabel>
        <MetricValue>
          {metrics.containerMetrics.currentContainer && metrics.containerMetrics.containerStartTime
            ? Math.round((Date.now() - metrics.containerMetrics.containerStartTime) / 1000)
            : 0}s
        </MetricValue>
      </MetricItem>
    </MetricsContainer>
  );
};

const MetricsContainer = s.div`
  position: fixed;
  top: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 15px;
  border-radius: 10px;
  z-index: 1000;
  font-family: Arial, sans-serif;
  min-width: 200px;
`;

const MetricsTitle = s.h3`
  margin: 10px 0;
  font-size: 16px;
  color: #fff;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  padding-bottom: 5px;
`;

const MetricItem = s.div`
  display: flex;
  justify-content: space-between;
  margin: 5px 0;
  font-size: 14px;
`;

const MetricLabel = s.span`
  color: #aaa;
`;

const MetricValue = s.span`
  color: #fff;
  font-weight: bold;
`;

export default ScrollMetrics; 