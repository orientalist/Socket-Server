import WebSocket,{WebSocketServer} from "ws";

async function connectToServer(){
    const ws=new WebSocket('ws://192.168.3.15:8080/ws');
    return new Promise((res,req)=>{
        console.log(res);
    });
}

connectToServer();