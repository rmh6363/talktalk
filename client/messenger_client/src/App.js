import React, { useState, useEffect } from 'react';

const App = () => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [ws, setWs] = useState(null);
  const width = 50;  // 캐릭터의 너비
  const height = 50; // 캐릭터의 높이

  useEffect(() => {
    const websocket = new WebSocket('ws://localhost:3030/ws');
    setWs(websocket);

    websocket.onmessage = (event) => {
      setMessages((prev) => [...prev, event.data]); // 수신한 메시지를 상태에 추가
    };

    return () => {
      websocket.close();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      setPosition((prev) => {
        let newX = prev.x;
        let newY = prev.y;

        switch (event.key) {
          case 'ArrowUp':
            newY = Math.max(prev.y - 10, 0);
            break;
          case 'ArrowDown':
            newY = Math.min(prev.y + 10, window.innerHeight - height);
            break;
          case 'ArrowLeft':
            newX = Math.max(prev.x - 10, 0);
            break;
          case 'ArrowRight':
            newX = Math.min(prev.x + 10, window.innerWidth - width);
            break;
          default:
            break;
        }

        return { x: newX, y: newY };
      });
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const sendMessage = () => {
    if (ws && input) {
      ws.send(input);
      setInput('');
    }
  };

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100vw', backgroundColor: '#f0f0f0' }}>
      <h2>Position: ({position.x}, {position.y})</h2>
      <div
        style={{
          position: 'absolute',
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: '50px',
          height: '50px',
          backgroundColor: 'blue',
        }}
      />
      <div>
        <h3>Chat:</h3>
        <div style={{ height: '200px', overflowY: 'scroll', border: '1px solid black' }}>
          {messages.map((msg, index) => (
            <div key={index}>{msg}</div> // 수신한 메시지를 표시
          ))}
        </div>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
};

export default App;
