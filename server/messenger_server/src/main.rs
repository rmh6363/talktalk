use futures::{stream::StreamExt, SinkExt};
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use warp::Filter;

#[tokio::main]
async fn main() {
    // 채널을 생성하여 메시지를 broadcast합니다.
    let (tx, _rx) = broadcast::channel(100);
    let tx = Arc::new(Mutex::new(tx));

    // WebSocket 필터 생성
    let chat = warp::path("ws")
        .and(warp::ws())
        .map(move |ws: warp::ws::Ws| {
            let tx = Arc::clone(&tx);
            ws.on_upgrade(move |websocket| handle_connection(websocket, tx))
        });

    // 서버 실행
    warp::serve(chat).run(([127, 0, 0, 1], 3030)).await;
}

async fn handle_connection(ws: warp::ws::WebSocket, tx: Arc<Mutex<broadcast::Sender<String>>>) {
    let (mut ws_tx, mut ws_rx) = ws.split();

    // 수신된 메시지를 처리
    while let Some(result) = ws_rx.next().await {
        match result {
            Ok(msg) => {
                if let Ok(text) = msg.to_str() {
                    let message = text.to_string();
                    let _ = tx.lock().unwrap().send(message.clone());
                    
                    // 모든 클라이언트에게 메시지 전송
                    let _ = ws_tx.send(warp::ws::Message::text(message)).await;
                }
            }
            Err(_) => break,
        }
    }
}
