import React, { useEffect, useState } from 'react';
import s from 'styled-components';

const ScrollMetrics = () => {
  const [metrics, setMetrics] = useState({
    scrollSpeed: 0,
    lastScrollTop: 0,
    lastScrollTime: Date.now(),
    totalScrollDistance: 0,
    averageSpeed: 0
  });

  useEffect(() => {
    const scrollWindow = document.getElementById('scroll-window');
    let scrollCount = 0;
    let totalSpeed = 0;

    const handleScroll = () => {
      const currentTime = Date.now();
      const currentScrollTop = scrollWindow.scrollTop;
      const timeDiff = currentTime - metrics.lastScrollTime;
      const scrollDiff = Math.abs(currentScrollTop - metrics.lastScrollTop);
      
      // Calculate scroll speed (pixels per second)
      const currentSpeed = (scrollDiff / timeDiff) * 1000;
      
      // Update metrics
      scrollCount++;
      totalSpeed += currentSpeed;
      
      setMetrics({
        scrollSpeed: Math.round(currentSpeed),
        lastScrollTop: currentScrollTop,
        lastScrollTime: currentTime,
        totalScrollDistance: metrics.totalScrollDistance + scrollDiff,
        averageSpeed: Math.round(totalSpeed / scrollCount)
      });
    };

    scrollWindow.addEventListener('scroll', handleScroll);
    return () => scrollWindow.removeEventListener('scroll', handleScroll);
  }, [metrics.lastScrollTime, metrics.lastScrollTop, metrics.totalScrollDistance]);

  return (
    <MetricsContainer>
      <MetricsTitle>Scroll Metrics</MetricsTitle>
      <MetricItem>
        <MetricLabel>Current Speed:</MetricLabel>
        <MetricValue>{metrics.scrollSpeed} px/s</MetricValue>
      </MetricItem>
      <MetricItem>
        <MetricLabel>Average Speed:</MetricLabel>
        <MetricValue>{metrics.averageSpeed} px/s</MetricValue>
      </MetricItem>
      <MetricItem>
        <MetricLabel>Total Distance:</MetricLabel>
        <MetricValue>{Math.round(metrics.totalScrollDistance)} px</MetricValue>
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
  margin: 0 0 10px 0;
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