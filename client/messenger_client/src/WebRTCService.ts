import { useState, useEffect, useRef, useCallback } from 'react';

type Message = {
  author: string;
  content: string;
  timestamp: number;
};

interface WebRTCState {
  initialize: (name: string, room: string) => Promise<boolean>;
  sendMessage: (message: string) => void;
  disconnect: () => void;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  isConnected: boolean;
  users: string[];
  messages: Message[];
}

export const useWebRTC = (): WebRTCState => {
  const [websocket, setWebsocket] = useState<WebSocket | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [users, setUsers] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  
  // WebRTC 연결 관리
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  
  // 로컬 미디어 스트림 초기화
  const initLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('Failed to get local media stream:', err);
      return null;
    }
  }, []);
  
  // WebSocket 메시지 처리
  const handleWebSocketMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      console.log('Received message:', data);
      
      switch (data.event) {
        case 'room_users':
          setUsers(data.users);
          // 새 사용자에게 WebRTC offer 생성
          data.users.forEach((user: string) => {
            if (user !== userId && !peerConnections.current.has(user)) {
              createPeerConnection(user);
            }
          });
          break;
          
        case 'offer':
          handleOffer(data.sender, data.sdp);
          break;
          
        case 'answer':
          handleAnswer(data.sender, data.sdp);
          break;
          
        case 'ice-candidate':
          handleIceCandidate(data.sender, data.candidate, data.sdpMid, data.sdpMLineIndex);
          break;
          
        case 'chat':
          setMessages(prev => [...prev, {
            author: data.sender === userId ? 'Me' : data.sender,
            content: data.content,
            timestamp: data.timestamp
          }]);
          break;
      }
    } catch (err) {
      console.error('Failed to parse message:', err);
    }
  }, [userId]);
  
  // WebRTC 연결 생성
  const createPeerConnection = useCallback(async (targetUserId: string) => {
    if (!localStream) return;
    
    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
      
      pc.onicecandidate = event => {
        if (event.candidate) {
          if (websocket?.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify({
              event: 'IceCandidate',
              target: targetUserId,
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex
            }));
          }
        }
      };
      
      pc.ontrack = event => {
        const stream = event.streams[0];
        setRemoteStreams(prev => {
          const newStreams = new Map(prev);
          newStreams.set(targetUserId, stream);
          return newStreams;
        });
      };
      
      peerConnections.current.set(targetUserId, pc);
      
      // 연결 초기화
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      if (websocket?.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({
          event: 'Offer',
          target: targetUserId,
          sdp: pc.localDescription?.sdp
        }));
      }
    } catch (err) {
      console.error('Error creating peer connection:', err);
    }
  }, [localStream, websocket]);
  
  // Offer 처리
  const handleOffer = useCallback(async (sender: string, sdp: string) => {
    if (!localStream) return;
    
    try {
      let pc = peerConnections.current.get(sender);
      
      if (!pc) {
        pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        });
        
        localStream.getTracks().forEach(track => {
          pc.addTrack(track, localStream);
        });
        
        pc.onicecandidate = event => {
          if (event.candidate && websocket?.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify({
              event: 'IceCandidate',
              target: sender,
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex
            }));
          }
        };
        
        pc.ontrack = event => {
          const stream = event.streams[0];
          setRemoteStreams(prev => {
            const newStreams = new Map(prev);
            newStreams.set(sender, stream);
            return newStreams;
          });
        };
        
        peerConnections.current.set(sender, pc);
      }
      
      await pc.setRemoteDescription(new RTCSessionDescription({
        type: 'offer',
        sdp
      }));
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      if (websocket?.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({
          event: 'Answer',
          target: sender,
          sdp: pc.localDescription?.sdp
        }));
      }
    } catch (err) {
      console.error('Error handling offer:', err);
    }
  }, [localStream, websocket]);
  
  // Answer 처리
  const handleAnswer = useCallback(async (sender: string, sdp: string) => {
    const pc = peerConnections.current.get(sender);
    
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription({
          type: 'answer',
          sdp
        }));
      } catch (err) {
        console.error('Error handling answer:', err);
      }
    }
  }, []);
  
  // ICE candidate 처리
  const handleIceCandidate = useCallback((sender: string, candidate: string, sdpMid: string, sdpMLineIndex: number) => {
    const pc = peerConnections.current.get(sender);
    
    if (pc) {
      try {
        pc.addIceCandidate(new RTCIceCandidate({
          candidate,
          sdpMid,
          sdpMLineIndex
        }));
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    }
  }, []);
  
  // 초기화 함수
  const initialize = useCallback(async (name: string, room: string): Promise<boolean> => {
    try {
      // 로컬 미디어 스트림 초기화
      const stream = await initLocalStream();
      if (!stream) return false;
      
      // WebSocket 연결 설정
      const ws = new WebSocket(`ws://${window.location.host}/ws`);
      
      return new Promise((resolve) => {
        ws.onopen = () => {
          console.log('WebSocket connection established');
          setWebsocket(ws);
          setUserName(name);
          setRoomId(room);
          setUserId(Math.random().toString(36).substr(2, 9)); // 임시 ID 생성
          
          // 방 참가 메시지 전송
          ws.send(JSON.stringify({
            event: 'Join',
            name,
            room
          }));
          
          setIsConnected(true);
          resolve(true);
        };
        
        ws.onmessage = handleWebSocketMessage;
        
        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          resolve(false);
        };
        
        ws.onclose = () => {
          console.log('WebSocket connection closed');
          setIsConnected(false);
        };
      });
    } catch (err) {
      console.error('Failed to initialize:', err);
      return false;
    }
  }, [initLocalStream, handleWebSocketMessage]);
  
  // 메시지 전송
  const sendMessage = useCallback((message: string) => {
    if (websocket?.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({
        event: 'Chat',
        message
      }));
      
      // 로컬 메시지 처리
      setMessages(prev => [...prev, {
        author: 'Me',
        content: message,
        timestamp: Date.now()
      }]);
    }
  }, [websocket]);
  
  // 연결 종료
  const disconnect = useCallback(() => {
    // WebRTC 연결 정리
    peerConnections.current.forEach(pc => {
      pc.close();
    });
    peerConnections.current.clear();
    
    // 로컬 스트림 정리
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    // WebSocket 연결 종료
    if (websocket) {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({
          event: 'Leave'
        }));
      }
      websocket.close();
    }
    
    // 상태 초기화
    setLocalStream(null);
    setRemoteStreams(new Map());
    setIsConnected(false);
    setUsers([]);
    setMessages([]);
  }, [websocket, localStream]);
  
  // 정리 함수
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);
  
  return {
    initialize,
    sendMessage,
    disconnect,
    localStream,
    remoteStreams,
    isConnected,
    users,
    messages
  };
};