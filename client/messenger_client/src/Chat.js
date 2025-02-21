import React, { useEffect, useState } from 'react';

const Chat = () => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [ws, setWs] = useState(null);

    useEffect(() => {
        const websocket = new WebSocket('ws://localhost:4000');
        setWs(websocket);

        websocket.onmessage = (event) => {
            setMessages((prev) => [...prev, event.data]);
        };

        return () => {
            websocket.close();
        };
    }, []);

    const sendMessage = () => {
        if (ws && input) {
            ws.send(input);
            setInput('');
        }
    };

    return (
        <div>
            <div style={{ height: '300px', overflowY: 'scroll', border: '1px solid black' }}>
                {messages.map((msg, index) => (
                    <div key={index}>{msg}</div>
                ))}
            </div>
            <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            />
            <button onClick={sendMessage}>Send</button>
        </div>
    );
};

export default Chat;
