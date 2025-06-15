class ScrollHandler {
  constructor() {
    this.lastScrollTime = Date.now();
    this.lastScrollPosition = 0;
    this.scrollSpeeds = [];
    this.containerEnterTime = Date.now();
    this.currentContainer = 0;
    this.latestMetrics = {
      scrollPosition: 0,
      direction: 'none',
      currentSpeed: 0,
      averageSpeed: 0,
      containerIndex: 0,
      totalContainers: 0,
      containerMetrics: {
        containerIndex: 0,
        timeSpentInContainer: 0
      }
    };
  }

  calculateSpeed(currentPosition, lastPosition, currentTime, lastTime) {
    const distance = currentPosition - lastPosition;
    const time = currentTime - lastTime;
    return (distance / time) * 1000; // Convert to containers per second
  }

  updateMetrics(metrics) {
    const currentTime = Date.now();
    const currentPosition = metrics.scrollPosition;
    const videoHeight = metrics.videoHeight || 0;
    
    // Calculate current container
    const newContainer = Math.floor(currentPosition / videoHeight);
    
    // Calculate speed
    const speed = this.calculateSpeed(
      currentPosition,
      this.lastScrollPosition,
      currentTime,
      this.lastScrollTime
    );

    // Update speed history
    this.scrollSpeeds.push(speed);
    if (this.scrollSpeeds.length > 10) {
      this.scrollSpeeds.shift();
    }

    // Calculate average speed
    const averageSpeed = this.scrollSpeeds.reduce((a, b) => a + b, 0) / this.scrollSpeeds.length;

    // Determine direction
    const direction = currentPosition > this.lastScrollPosition ? 'down' : 'up';

    // Update container metrics if container changed
    if (newContainer !== this.currentContainer) {
      this.containerEnterTime = currentTime;
      this.currentContainer = newContainer;
    }

    // Update latest metrics
    this.latestMetrics = {
      scrollPosition: currentPosition,
      direction,
      currentSpeed: speed,
      averageSpeed,
      containerIndex: newContainer,
      totalContainers: Math.ceil(metrics.totalHeight / videoHeight),
      containerMetrics: {
        containerIndex: newContainer,
        timeSpentInContainer: currentTime - this.containerEnterTime
      }
    };

    // Update tracking variables
    this.lastScrollTime = currentTime;
    this.lastScrollPosition = currentPosition;

    return this.latestMetrics;
  }

  getLatestMetrics() {
    return this.latestMetrics;
  }
}

module.exports = ScrollHandler; 