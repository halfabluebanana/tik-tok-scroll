import React, { useEffect, useRef } from 'react';

const ScrollMonitor = () => {
  const lastUpdateTime = useRef(Date.now());

  useEffect(() => {
    const scrollWindow = document.getElementById('scroll-window');
    if (!scrollWindow) return;

    const updateMetrics = async (metrics) => {
      try {
        await fetch('http://localhost:3001/api/scroll-metrics', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(metrics),
        });
      } catch (error) {
        console.error('Error sending metrics:', error);
      }
    };

    const handleScroll = () => {
      const currentTime = Date.now();
      // Only update every 100ms to prevent too many requests
      if (currentTime - lastUpdateTime.current < 100) return;
      
      const currentPosition = scrollWindow.scrollTop;
      const videoHeight = scrollWindow.firstChild?.offsetHeight || 0;
      const totalHeight = scrollWindow.scrollHeight;

      // Send raw scroll data to server
      updateMetrics({
        scrollPosition: currentPosition,
        videoHeight,
        totalHeight,
        timestamp: currentTime
      });

      lastUpdateTime.current = currentTime;
    };

    // Add scroll event listener
    scrollWindow.addEventListener('scroll', handleScroll);

    // Cleanup
    return () => {
      scrollWindow.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return null; // This component doesn't render anything
};

export default ScrollMonitor; 