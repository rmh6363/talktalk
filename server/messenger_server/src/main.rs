use actix::{Actor, StreamHandler, ActorContext, Handler, Running, WrapFuture, ActorFutureExt};
use actix_web::{web, App, Error, HttpRequest, HttpResponse, HttpServer};
use actix_web_actors::ws;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc};
use tokio::sync::RwLock;
use log::{info, warn, error, debug};
use env_logger;
use chrono::Utc;

// 메시지 구조체 정의
#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "event", content = "data")]
enum ClientMessage {
    Join { name: String, room: String },
    Chat { message: String },
    Leave {},
    // WebRTC 시그널링을 위한 메시지 타입 추가
    Offer { target: String, sdp: String },
    Answer { target: String, sdp: String },
    IceCandidate { target: String, candidate: String, sdpMid: String, sdpMLineIndex: u32 },
}

#[derive(Serialize)]
struct RoomUsersMessage {
    event: String,
    room: String,
    users: Vec<String>,
}

#[derive(Serialize)]
struct WebRTCMessage {
    event: String,
    sender: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    sdp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    candidate: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sdpMid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sdpMLineIndex: Option<u32>,
}

// TextMessage 핸들러 구현 추가
impl Handler<TextMessage> for WebSocketSession {
    type Result = ();

    fn handle(&mut self, msg: TextMessage, ctx: &mut Self::Context) {
        ctx.text(msg.0);
    }
}

// StreamHandler 내 메시지 처리 확장
fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
    match msg {
        Ok(ws::Message::Ping(msg)) => ctx.pong(&msg),
        Ok(ws::Message::Text(text)) => {
            if let Ok(client_message) = serde_json::from_str::<ClientMessage>(&text) {
                match client_message {
                    ClientMessage::Join { name, room } => {
                        self.name = name;
                        self.room = room.clone();
                        let room_manager = self.room_manager.clone();
                        let user_id = self.id.clone();
                        let addr = ctx.address();
                        
                        actix::spawn(async move {
                            let mut manager = room_manager.write().await;
                            manager.join_room(&room, &user_id, addr).await;
                        });
                    },
                    ClientMessage::Chat { message } => {
                        if self.room.is_empty() {
                            ctx.text(r#"{"event":"error","message":"You must join a room first"}"#);
                            return;
                        }

                        let chat_msg = serde_json::json!({
                            "event": "chat",
                            "room": self.room,
                            "sender": self.name,
                            "content": message,
                            "timestamp": chrono::Utc::now().timestamp_millis()
                        });
                        
                        if let Ok(json) = serde_json::to_string(&chat_msg) {
                            let room_manager = self.room_manager.clone();
                            let room_id = self.room.clone();
                            
                            actix::spawn(async move {
                                let manager = room_manager.read().await;
                                if let Some(clients) = manager.rooms.get(&room_id) {
                                    for client_id in clients {
                                        if let Some(addr) = manager.sessions.get(client_id) {
                                            addr.do_send(TextMessage(json.clone()));
                                        }
                                    }
                                }
                            });
                        }
                    },
                    // WebRTC 시그널링 메시지 처리
                    ClientMessage::Offer { target, sdp } => {
                        self.handle_webrtc_signaling("offer", target, Some(sdp), None, None, None);
                    },
                    ClientMessage::Answer { target, sdp } => {
                        self.handle_webrtc_signaling("answer", target, Some(sdp), None, None, None);
                    },
                    ClientMessage::IceCandidate { target, candidate, sdpMid, sdpMLineIndex } => {
                        self.handle_webrtc_signaling("ice-candidate", target, None, Some(candidate), Some(sdpMid), Some(sdpMLineIndex));
                    },
                    ClientMessage::Leave { } => {
                        if !self.room.is_empty() {
                            let room_manager = self.room_manager.clone();
                            let room_id = self.room.clone();
                            let user_id = self.id.clone();
                            
                            actix::spawn(async move {
                                let mut manager = room_manager.write().await;
                                manager.leave_room(&room_id, &user_id).await;
                            });
                            self.room = String::new();
                        }
                    }
                }
            } else {
                error!("Invalid message format from {}: {}", self.id, text);
                ctx.text(r#"{"event":"error","message":"Invalid message format"}"#);
            }
        }
        _ => (),
    }
}

// WebSocketSession에 WebRTC 시그널링 처리 메서드 추가
impl WebSocketSession {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Ping(msg)) => ctx.pong(&msg),
            Ok(ws::Message::Text(text)) => {
                if let Ok(client_message) = serde_json::from_str::<ClientMessage>(&text) {
                    match client_message {
                        ClientMessage::Join { name, room } => {
                            self.name = name;
                            self.room = room.clone();
                            let room_manager = self.room_manager.clone();
                            let user_id = self.id.clone();
                            let addr = ctx.address();
                            
                            actix::spawn(async move {
                                let mut manager = room_manager.write().await;
                                manager.join_room(&room, &user_id, addr).await;
                            });
                        }
                        // 더 많은 메시지 처리...
                        _ => warn!("Unrecognized event"),
                    }
                } else {
                    error!("Invalid message format from {}", self.id);
                    ctx.text("Invalid message format");
                }
            }
            _ => (),
        }
    }
    
    fn handle_webrtc_signaling(
        &self,
        event_type: &str,
        target: String,
        sdp: Option<String>,
        candidate: Option<String>,
        sdpMid: Option<String>,
        sdpMLineIndex: Option<u32>
    ) {
        if self.room.is_empty() {
            return;
        }
        
        let msg = WebRTCMessage {
            event: event_type.to_string(),
            sender: self.id.clone(),
            sdp,
            candidate,
            sdpMid,
            sdpMLineIndex,
        };
        
        if let Ok(json) = serde_json::to_string(&msg) {
            let room_manager = self.room_manager.clone();
            
            actix::spawn(async move {
                let manager = room_manager.read().await;
                if let Some(addr) = manager.sessions.get(&target) {
                    addr.do_send(TextMessage(json));
                }
            });
        }
    }
}