//引入web socket套件ws
import WebSocket, { WebSocketServer } from "ws";

class Controller {
    constructor() {
        //server將監聽的port
        this._state = {
            PORT: 8080
        }

        //server實體
        this._server = null;

        //server開啟入口
        this.main = this.main.bind(this);

        //遊戲邏輯-控管與遊戲有關的資料
        this.gameLogic = new GameLogic();
    }    

    //server指令物件，用於告知client端server指派的任務
    CommandObject(cmd,info,data){
        return {cmd,info,data};
    }

    //server進入點
    main() {
        //初始化server遊戲邏輯
        this.gameLogic.main();

        //練server實體，監聽指定的port
        this._server = new WebSocketServer({ port: this._state.PORT }, () => {
            //server建立callback function
            console.log(`Server initialized`);
        });        

        //server開始監聽
        this._server.on('listening', () => {
            //server開始監聽callback function
            console.log(`Server is now listening on PORT:${this._state.PORT}`);
        });

        //當client與server建立連線後，會執行指派的callback function
        this._server.on('connection', (ws, req) => {
            ws.send('server is connected by player');
            console.log(`Player connected ${new Date().getHours()} ${new Date().getMinutes()}`);            
            
            //server一旦收到client端的訊息，會執行指派的callback function
            ws.on('message', (data) => {
                //我們與client建立共同的訊息範本
                //將client想執行的任務置於cmd字串
                //相關資料置於data，為json字串
                const clientData=JSON.parse(data.toString());
                //server依照不同的client任務執行相應邏輯
                switch(clientData.cmd){
                    //client建立時告知server該client的初始資訊
                    case "RegisterPlayer":           
                        const newPlayer=JSON.parse(clientData.data);
                        //將該client添加進server上的client陣列
                        this.gameLogic._serverControllObjects.players.push(newPlayer);
                        //廣播告知所有client有新建立的client
                        this._server.clients.forEach(c=>{
                            if(c.readyState===WebSocket.OPEN){
                                c.send(JSON.stringify(this.CommandObject('PlayerRegistered','',clientData.data)));
                            }
                        });
                    break;
                    //client進入遊戲後，會請求server告知目前金礦的資訊
                    case "GetPickUpInfo":                        
                        this.gameLogic.PickUpArray.forEach(p=>{
                            ws.send(JSON.stringify(this.CommandObject('PickUpInfo','',JSON.stringify(p))));
                        });                        
                    break;
                    //client進入遊戲後，會請求server告知其他client的資訊
                    case "GetOtherPlayers":
                        //此指令會包含發送請求的使用者編號，server取出該client之外的其他client並回傳
                        const originPlayer=JSON.parse(clientData.data);
                        this.gameLogic._serverControllObjects.players.filter(f=>f.roleID!==originPlayer.roleID).forEach(_f=>{
                            ws.send(JSON.stringify(this.CommandObject('PlayerRegistered','',JSON.stringify(_f))));
                        });
                    break;
                    //client離開遊戲時，執行此指令
                    case "RemovePlayer":
                        const playerID=clientData.data.toString();
                        //移除server上該client的資料
                        this.gameLogic._serverControllObjects.players=this.gameLogic._serverControllObjects.players.filter(f=>f.roleID!==playerID);
                        //廣播告知所有其他client該client已離開遊戲
                        this._server.clients.forEach(c=>{
                            if(c.readyState===WebSocket.OPEN){
                                c.send(JSON.stringify(this.CommandObject('PlayerRemoved','',playerID)));
                            }
                        });
                    break;
                    //當金礦被client吃掉時，告知server
                    case "RemovePickUp":
                        const id=clientData.data;
                        //server廣播給所有client該金礦已被消除
                        this._server.clients.forEach(c=>{
                            if(c.readyState===WebSocket.OPEN){
                                c.send(JSON.stringify(this.CommandObject('PickUpRemoved','',id)));
                            }
                        });
                        //移除伺服器上該金礦資料，並產生新的金礦
                        const newPickUp=this.gameLogic.RemoveFromPickUps(id);
                        //廣播給所有client新金礦的資訊
                        if(newPickUp.id!==0){
                            this._server.clients.forEach(c=>{
                                if(c.readyState===WebSocket.OPEN){
                                    c.send(JSON.stringify(this.CommandObject('PickUpInfo','',JSON.stringify(newPickUp))));
                                }
                            });                            
                        }
                    break;
                    //client更新資訊，包含位置、分數等
                    case "PlayerUpdate":              
                        //server廣播該client的新資訊給所有client                                             
                        this._server.clients.forEach(c=>{
                            if(c.readyState===WebSocket.OPEN){
                                c.send(JSON.stringify(this.CommandObject('PlayerUpdate','',clientData.data)));
                            }
                        });
                    break;
                    //請忽略此指令
                    case "DestroyPlayer":
                        this._server.clients.forEach(c=>{
                            if(c.readyState===WebSocket.OPEN){
                                c.send(JSON.stringify(this.CommandObject('DestroyPlayer','',clientData.data)));
                            }
                        });
                    break;
                    //client重生
                    case "PlayerReborn":
                        const rebornPlayer=JSON.parse(clientData.data);
                        //更新server上該玩家的資訊(位置、分數等)
                        var replacePlayer=this.gameLogic._serverControllObjects.players.find(f=>f.roleID===rebornPlayer.roleID);
                        replacePlayer.Count=0;
                        replacePlayer.x=rebornPlayer.x;
                        replacePlayer.y=rebornPlayer.y;
                        replacePlayer.scale=rebornPlayer.scale;
                        //廣撥給所有client該玩家的重生資訊
                        this._server.clients.forEach(c=>{
                            if(c.readyState===WebSocket.OPEN){
                                c.send(JSON.stringify(this.CommandObject('PlayerReborn','',clientData.data)));
                            }
                        });
                    break;
                    default:
                        console.log(clientData);
                        console.log(`Unknown data ${data}`);
                    break;
                }
            });
        });
    }
}

class GameLogic {
    constructor() {
        //遊戲邏輯機本組態
        this._state = {
            pickUpMax: 300
        }

        //遊戲邏輯控管的遊戲資訊
        this._serverControllObjects = {
            pickUps: [],
            players:[]
        }

        this.GeneratePickUps = this.GeneratePickUps.bind(this);
        this.main = this.main.bind(this);
    }

    static RandomNum(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1) + min);
    }

    //用於產生金礦實體
    get PickUpObject() {
        return {
            //金礦編號
            id: (Math.floor(Math.random() * 99999) + 1),
            //金礦x位置
            x: ((Math.random() < 0.5 ? -1 : 1) * (GameLogic.RandomNum(0, 198) / 2)),
            //金礦y位置
            y: ((Math.random() < 0.5 ? -1 : 1) * (GameLogic.RandomNum(0, 198) / 2))
        }
    }

    get PickUpArray() {
        return this._serverControllObjects.pickUps;
    }

    //伺服器建立時，由遊戲邏輯產生全局金礦
    GeneratePickUps() {
        while (this._serverControllObjects.pickUps.length < this._state.pickUpMax) {
            const p = this.PickUpObject;
            if (this._serverControllObjects.pickUps.indexOf(_p => _p.id === p.id) < 0) {
                this._serverControllObjects.pickUps.push(p);
            }
        }
    }

    //移除該編號的金礦，並產生新的金礦
    RemoveFromPickUps(id) {
        this._serverControllObjects.pickUps = this._serverControllObjects.pickUps.filter(p => p.id !== Number(id));
        const newPickUp=this.PickUpObject;
        if(this._serverControllObjects.pickUps.length<this._state.pickUpMax){            
            if (this._serverControllObjects.pickUps.indexOf(_p => _p.id === newPickUp.id) < 0) {
                this._serverControllObjects.pickUps.push(newPickUp);
            }else{
                newPickUp.id=0;
            }
        }else{
            newPickUp.id=0;
        }     
        
        return newPickUp;
    }

    //遊戲邏輯進入點
    main() {
        this.GeneratePickUps();
    }
}

const controller = new Controller();
controller.main();