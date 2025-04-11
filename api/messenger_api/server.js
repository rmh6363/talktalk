const WebSocket = require('ws');

const server = new WebSocket.Server({ port: 3030 });

let users = []; // 사용자 정보를 저장할 배열

server.on('connection', (socket) => {
    console.log('새로운 클라이언트가 연결되었습니다.');

    socket.on('message', (message) => {
        const data = JSON.parse(message);
        console.log("data  : " ,data);
        switch (data.type) {
            case 'Movement':
                // 사용자 이동 정보 업데이트
                
                const userIndex = users.findIndex(user => user.name === data.data.name);
                
                if (userIndex > -1) {
                    users[userIndex] = data.data; // 기존 사용자의 위치 업데이트
                } else {
                    users.push(data.data); // 새로운 사용자 추가
                }
        
                // 모든 클라이언트에 사용자 목록 전송
                broadcast(JSON.stringify(users));
                break;

            case 'Chat':
                // 채팅 메시지 처리
                console.log("Received chat message:", data.data);
                // 모든 클라이언트에게 채팅 메시지 전송
                broadcast(JSON.stringify({ type: "Chat", data: data.data }));
                break;

            default:
                console.log("알 수 없는 메시지 타입:", data.type);
                break;
        }
    });

    socket.on('close', () => {
        console.log('클라이언트가 연결을 종료했습니다.');
        // 연결 종료 시 사용자 목록에서 제거
        users = users.filter(user => user.socket !== socket);
        broadcast(JSON.stringify(users)); // 업데이트된 사용자 목록 전송
    });
});

// 모든 클라이언트에게 메시지를 브로드캐스트하는 함수
function broadcast(data) {
    server.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

console.log('웹소켓 서버가 포트 3030에서 실행 중입니다.');
