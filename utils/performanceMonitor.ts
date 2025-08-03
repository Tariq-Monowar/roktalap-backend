// Performance monitoring utilities for the messaging system
import { io } from "../socket";

interface PerformanceMetrics {
  messagesSent: number;
  messagesReceived: number;
  connectionsActive: number;
  callsInitiated: number;
  callsCompleted: number;
  avgResponseTime: number;
  errorCount: number;
  lastReset: Date;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    messagesSent: 0,
    messagesReceived: 0,
    connectionsActive: 0,
    callsInitiated: 0,
    callsCompleted: 0,
    avgResponseTime: 0,
    errorCount: 0,
    lastReset: new Date()
  };

  private responseTimes: number[] = [];
  private maxResponseTimesSaved = 100;

  // Track message sent
  trackMessageSent() {
    this.metrics.messagesSent++;
  }

  // Track message received
  trackMessageReceived() {
    this.metrics.messagesReceived++;
  }

  // Track connection
  trackConnection(isConnect: boolean) {
    if (isConnect) {
      this.metrics.connectionsActive++;
    } else {
      this.metrics.connectionsActive = Math.max(0, this.metrics.connectionsActive - 1);
    }
  }

  // Track call
  trackCall(type: 'initiated' | 'completed') {
    if (type === 'initiated') {
      this.metrics.callsInitiated++;
    } else {
      this.metrics.callsCompleted++;
    }
  }

  // Track response time
  trackResponseTime(responseTime: number) {
    this.responseTimes.push(responseTime);
    
    // Keep only last N response times
    if (this.responseTimes.length > this.maxResponseTimesSaved) {
      this.responseTimes.shift();
    }

    // Calculate average
    this.metrics.avgResponseTime = this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
  }

  // Track error
  trackError() {
    this.metrics.errorCount++;
  }

  // Get current metrics
  getMetrics(): PerformanceMetrics & { 
    uptimeSeconds: number;
    messagesPerSecond: number;
    errorRate: number;
  } {
    const now = new Date();
    const uptimeSeconds = (now.getTime() - this.metrics.lastReset.getTime()) / 1000;
    const messagesPerSecond = uptimeSeconds > 0 ? (this.metrics.messagesSent + this.metrics.messagesReceived) / uptimeSeconds : 0;
    const totalOperations = this.metrics.messagesSent + this.metrics.messagesReceived + this.metrics.callsInitiated;
    const errorRate = totalOperations > 0 ? this.metrics.errorCount / totalOperations : 0;

    return {
      ...this.metrics,
      uptimeSeconds,
      messagesPerSecond,
      errorRate
    };
  }

  // Reset metrics
  reset() {
    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      connectionsActive: this.metrics.connectionsActive, // Keep active connections
      callsInitiated: 0,
      callsCompleted: 0,
      avgResponseTime: 0,
      errorCount: 0,
      lastReset: new Date()
    };
    this.responseTimes = [];
  }

  // Get health status
  getHealthStatus(): 'healthy' | 'warning' | 'critical' {
    const metrics = this.getMetrics();
    
    if (metrics.errorRate > 0.1) return 'critical'; // > 10% error rate
    if (metrics.avgResponseTime > 1000) return 'warning'; // > 1 second avg response
    if (metrics.connectionsActive > 10000) return 'warning'; // High connection count
    
    return 'healthy';
  }

  // Log metrics periodically
  startPeriodicLogging(intervalMs: number = 60000) { // Default 1 minute
    setInterval(() => {
      const metrics = this.getMetrics();
      const health = this.getHealthStatus();
      
      console.log(`[Performance] Status: ${health}, Active Connections: ${metrics.connectionsActive}, Messages/sec: ${metrics.messagesPerSecond.toFixed(2)}, Avg Response: ${metrics.avgResponseTime.toFixed(2)}ms, Error Rate: ${(metrics.errorRate * 100).toFixed(2)}%`);
      
      // Emit metrics to admin clients if needed
      if (io) {
        io.emit('system_metrics', {
          ...metrics,
          health
        });
      }
    }, intervalMs);
  }

  // Performance timing decorator
  async measureAsync<T>(operation: () => Promise<T>, operationName?: string): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await operation();
      this.trackResponseTime(Date.now() - startTime);
      return result;
    } catch (error) {
      this.trackError();
      if (operationName) {
        console.error(`[Performance] Error in ${operationName}:`, error);
      }
      throw error;
    }
  }

  // Synchronous timing decorator
  measure<T>(operation: () => T, operationName?: string): T {
    const startTime = Date.now();
    try {
      const result = operation();
      this.trackResponseTime(Date.now() - startTime);
      return result;
    } catch (error) {
      this.trackError();
      if (operationName) {
        console.error(`[Performance] Error in ${operationName}:`, error);
      }
      throw error;
    }
  }
}

export const performanceMonitor = new PerformanceMonitor();

// Start periodic logging
performanceMonitor.startPeriodicLogging();