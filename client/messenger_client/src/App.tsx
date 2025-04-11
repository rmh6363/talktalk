// App.tsx - 수정된 버전
import React, { useEffect, useRef, useState } from 'react';
import styled from '@emotion/styled';
import { useWebRTC } from './WebRTCService';

// 타입 정의
type Message = {
  author: string;
  content: string;
  timestamp: number;
};

type ChatRoomProps = {
  name: string;
  room: string;
  onExit: () => void;
};

// 입장 화면 컴포넌트
const EntryForm = ({ onEnter }: { onEnter: (name: string, room: string) => void }) => {
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name && room) {
      setIsLoading(true);
      setError(null);
      
      try {
        // 이름과 방 번호 유효성 검사할 수 있음
        onEnter(name, room);
      } catch (err) {
        console.error('Failed to enter room:', err);
        setError('방 입장에 실패했습니다. 다시 시도해주세요.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <EntryFormContainer>
      <Form onSubmit={handleSubmit}>
        <Title>화상 채팅 서비스</Title>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        
        <Input
          type="text"
          placeholder="이름을 입력하세요"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isLoading}
        />
        <Input
          type="text"
          placeholder="채팅방 번호"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          disabled={isLoading}
        />
        <EnterButton type="submit" disabled={isLoading}>
          {isLoading ? '연결 중...' : '입장하기'}
        </EnterButton>
      </Form>
    </EntryFormContainer>
  );
};

// 채팅방 컴포넌트 - WebRTC 연결 통합
const ChatRoom = ({ name, room, onExit }: ChatRoomProps) => {
  const [message, setMessage] = useState('');
  const {
    initialize,
    sendMessage,
    disconnect,
    localStream,
    remoteStreams,
    isConnected,
    users,
    messages
  } = useWebRTC();
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  
  // 연결 초기화
  useEffect(() => {
    const initConnection = async () => {
      // WebSocket 서버 경로 확인 (개발 환경과 프로덕션 환경에 따라 조정)
      const success = await initialize(name, room);
      if (!success) {
        alert('연결에 실패했습니다.');
        onExit();
      }
    };
    
    initConnection();
    
    return () => {
      disconnect();
    };
  }, [name, room, initialize, disconnect, onExit]);
  
  // 로컬 스트림 표시
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);
  
  // 원격 스트림 표시 (첫 번째 연결된 사용자만)
  useEffect(() => {
    if (remoteStreams.size > 0 && remoteVideoRef.current) {
      // 첫 번째 원격 스트림을 가져옴
      const firstRemoteStream = Array.from(remoteStreams.values())[0];
      remoteVideoRef.current.srcObject = firstRemoteStream;
    }
  }, [remoteStreams]);
  
  // 채팅 메시지 전송
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && isConnected) {
      sendMessage(message);
      setMessage('');
    }
  };
  
  // 연결 종료 및 방 나가기
  const handleLeave = () => {
    disconnect();
    onExit();
  };
  
  // 타임스탬프 포맷팅 함수
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <ChatContainer>
      <VideoSection>
        <RemoteVideoContainer>
          {/* 상대방 비디오 표시 영역 */}
          <video ref={remoteVideoRef} autoPlay playsInline />
          {!remoteStreams.size && <NoRemoteStream>다른 참가자 대기 중...</NoRemoteStream>}
        </RemoteVideoContainer>
        
        <LocalVideoContainer>
          {/* 내 비디오 미리보기 */}
          <video ref={localVideoRef} autoPlay playsInline muted />
        </LocalVideoContainer>
        
        <ControlsContainer>
          <RoomInfo>{room} 번 방 | 참가자: {users.length}명</RoomInfo>
          <LeaveButton onClick={handleLeave}>나가기</LeaveButton>
        </ControlsContainer>
      </VideoSection>

      <ChatSection>
        <ChatHeader>{room} 번 방</ChatHeader>
        <ChatMessages>
          {messages.map((msg, index) => (
            <MessageBubble key={index} isMine={msg.author === 'Me'}>
              <Author>{msg.author}</Author>
              <Content>{msg.content}</Content>
              <Timestamp>{formatTimestamp(msg.timestamp)}</Timestamp>
            </MessageBubble>
          ))}
        </ChatMessages>
        <MessageForm onSubmit={handleSendMessage}>
          <MessageInput
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="메시지 입력..."
            disabled={!isConnected}
          />
          <SendButton type="submit" disabled={!isConnected}>전송</SendButton>
        </MessageForm>
      </ChatSection>
    </ChatContainer>
  );
};

// 메인 앱 컴포넌트
const App = () => {
  const [entered, setEntered] = useState(false);
  const [userInfo, setUserInfo] = useState({ name: '', room: '' });

  const handleEnter = (name: string, room: string) => {
    setUserInfo({ name, room });
    setEntered(true);
  };
  
  const handleExit = () => {
    setEntered(false);
    setUserInfo({ name: '', room: '' });
  };

  return (
    <MainContainer>
      {!entered ? (
        <EntryForm onEnter={handleEnter} />
      ) : (
        <ChatRoom name={userInfo.name} room={userInfo.room} onExit={handleExit} />
      )}
    </MainContainer>
  );
};

// 추가 스타일 컴포넌트
const Title = styled.h1`
  text-align: center;
  color: #1877f2;
  margin-bottom: 1.5rem;
`;

const ErrorMessage = styled.div`
  color: #f44336;
  margin-bottom: 1rem;
  padding: 0.5rem;
  background-color: #ffebee;
  border-radius: 4px;
`;

const NoRemoteStream = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-size: 1.2rem;
  text-align: center;
  background: rgba(0, 0, 0, 0.7);
  padding: 1rem;
  border-radius: 5px;
`;

const ControlsContainer = styled.div`
  position: absolute;
  bottom: 20px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  padding: 0 20px;
  align-items: center;
  z-index: 10;
`;

const RoomInfo = styled.div`
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  font-size: 0.9rem;
`;

const LeaveButton = styled.button`
  background: #f44336;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.9rem;

  &:hover {
    background: #d32f2f;
  }
`;

const Timestamp = styled.div`
  font-size: 0.7rem;
  color: #888;
  text-align: right;
  margin-top: 0.2rem;
`;

// 메시지 버블 스타일 확장
interface MessageBubbleProps {
  isMine: boolean;
}

const MessageBubble = styled.div<MessageBubbleProps>`
  margin-bottom: 1rem;
  padding: 0.8rem;
  background: ${(props) => (props.isMine ? '#e3f2fd' : '#f0f2f5')};
  border-radius: 10px;
  align-self: ${(props) => (props.isMine ? 'flex-end' : 'flex-start')};
  max-width: 80%;
`;

// 기존 스타일 컴포넌트 (원래 코드에서 가져옴)
const MainContainer = styled.div`
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #f0f2f5;
`;

const EntryFormContainer = styled.div`
  background: white;
  padding: 2rem;
  border-radius: 10px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  width: 90%;
  max-width: 400px;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Input = styled.input`
  padding: 0.8rem;
  border: 1px solid #ddd;
  border-radius: 5px;
  font-size: 1rem;
`;

const EnterButton = styled.button`
  padding: 1rem;
  background: #1877f2;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 1rem;

  &:hover {
    background: #166fe5;
  }
  
  &:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
`;

const ChatContainer = styled.div`
  width: 100%;
  height: 100vh;
  display: flex;
`;

const VideoSection = styled.div`
  flex: 3;
  position: relative;
  background: #000;
`;

const RemoteVideoContainer = styled.div`
  width: 100%;
  height: 100%;
  position: relative;

  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const LocalVideoContainer = styled.div`
  position: absolute;
  top: 20px;
  right: 20px;
  width: 200px;
  height: 150px;
  border: 2px solid white;
  border-radius: 5px;
  overflow: hidden;
  z-index: 5;

  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const ChatSection = styled.div`
  flex: 1;
  background: white;
  display: flex;
  flex-direction: column;
`;

const ChatHeader = styled.div`
  padding: 1rem;
  background: #f5f6f7;
  border-bottom: 1px solid #ddd;
  font-weight: bold;
`;

const ChatMessages = styled.div`
  flex: 1;
  padding: 1rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const Author = styled.div`
  font-weight: bold;
  margin-bottom: 0.3rem;
  color: #1877f2;
`;

const Content = styled.div`
  word-break: break-word;
`;

const MessageForm = styled.form`
  display: flex;
  padding: 1rem;
  gap: 0.5rem;
  border-top: 1px solid #ddd;
`;

const MessageInput = styled.input`
  flex: 1;
  padding: 0.8rem;
  border: 1px solid #ddd;
  border-radius: 5px;
`;

const SendButton = styled.button`
  padding: 0.8rem 1.5rem;
  background: #1877f2;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;

  &:hover {
    background: #166fe5;
  }
  
  &:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
`;

export default App;