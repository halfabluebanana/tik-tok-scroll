import React, { useEffect, useState } from 'react';
import s from 'styled-components';

const ScrollMonitor = () => {
  const [logs, setLogs] = useState([]);
  const [ws, setWs] = useState(null);

  useEffect(() => {
    // Connect to WebSocket
    const socket = new WebSocket('ws://localhost:3001/monitor');
    
    socket.onopen = () => {
      console.log('Connected to monitor WebSocket');
    };

    socket.onmessage = (event) => {
      const log = JSON.parse(event.data);
      setLogs(prev => [log, ...prev].slice(0, 100)); // Keep last 100 logs
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    socket.onclose = () => {
      console.log('Disconnected from monitor WebSocket');
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, []);

  return (
    <MonitorContainer>
      <MonitorTitle>Scroll Event Monitor</MonitorTitle>
      <LogContainer>
        {logs.map((log, index) => (
          <LogEntry key={index} type={log.type}>
            <LogTimestamp>{new Date(log.timestamp).toLocaleTimeString()}</LogTimestamp>
            <LogContent>
              <LogType>{log.type}</LogType>
              <LogData>{JSON.stringify(log.data, null, 2)}</LogData>
            </LogContent>
          </LogEntry>
        ))}
      </LogContainer>
    </MonitorContainer>
  );
};

const MonitorContainer = s.div`
  position: fixed;
  top: 20px;
  left: 20px;
  width: 600px;
  height: calc(100vh - 40px);
  background: rgba(0, 0, 0, 0.9);
  color: white;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  font-family: monospace;
  z-index: 1000;
`;

const MonitorTitle = s.h2`
  margin: 0;
  padding: 15px;
  font-size: 18px;
  color: #fff;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
`;

const LogContainer = s.div`
  flex: 1;
  overflow-y: auto;
  padding: 10px;
`;

const LogEntry = s.div`
  margin: 5px 0;
  padding: 10px;
  border-radius: 5px;
  background: ${props => {
    switch (props.type) {
      case 'client': return 'rgba(0, 100, 255, 0.2)';
      case 'server': return 'rgba(0, 255, 100, 0.2)';
      case 'master': return 'rgba(255, 100, 0, 0.2)';
      case 'slave': return 'rgba(255, 0, 100, 0.2)';
      default: return 'rgba(255, 255, 255, 0.1)';
    }
  }};
`;

const LogTimestamp = s.div`
  font-size: 12px;
  color: #888;
  margin-bottom: 5px;
`;

const LogContent = s.div`
  display: flex;
  flex-direction: column;
`;

const LogType = s.span`
  font-weight: bold;
  color: ${props => {
    switch (props.type) {
      case 'client': return '#00aaff';
      case 'server': return '#00ffaa';
      case 'master': return '#ffaa00';
      case 'slave': return '#ff00aa';
      default: return '#ffffff';
    }
  }};
`;

const LogData = s.pre`
  margin: 5px 0 0 0;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
`;

export default ScrollMonitor; 