var http = require("http");
var io = require("socket.io");
var sqlite3 = require("sqlite3").verbose();
var url = require("url");
var fs = require('fs');
var file = "./musictable.db";
var socketList = [];
var htmlData;
var socketIOjs;
var soundObj;

fs.readFile("index.html", null, function (error, data) {
    // console.log(data);
    if (error) {
        throw error;
    } else {
        htmlData = data;
    }
});
fs.readFile("socket.io.js", null, function (error, data) {
    // console.log(data);
    if (error) {
        throw error;
    } else {
        socketIOjs = data;
    }
});
fs.readFile("sound/Japanese_drum1.mp3", null, function (error, data) {
    // console.log(data);
    if (error) {
        throw error;
    } else {
        soundObj = data;
    }
});

var songList = [
    // {name: '悪戯センセーション', ytcode: '_VH91mivTUw'},
    // {name: 'WARNINGxWARNINGxWARNING', ytcode: '7UubKYqEy3s'},
    // {name: 'Los! Los! Los!', ytcode: 'OgXZn_H_QAI'},
    // {name: '異世界四重奏op', ytcode: 'ld7UUwjE-n8'},
    // {name: 'Sincerely', ytcode: 'wEdmck_RSK4'},
    // {name: '調教咖啡廳op', ytcode: 'XuX9Tlz3T6c'},
    // {name: '小戀', ytcode: 'Woorod1gJ_w'}
];

//新增歌曲
function dbNewMusic (_name, _ytCode) {
    var db = new sqlite3.Database(file);
    db.serialize(function () {
        // db.run 如果 Staff 資料表不存在，那就建立Staff 資料表
        db.run("CREATE TABLE IF NOT EXISTS Music (name TEXT, ytcode TEXT UNIQUE, count int, lastplay date)");
        // 插入歌曲
        var stmt = db.prepare("INSERT OR IGNORE INTO Music VALUES (?, ?, ?, ?)");

        stmt.run(_name, _ytCode, 0, Date.now());

        stmt.finalize(function () {
            var sendMessage =  {
                MusicList: [{name: _name, ytcode: _ytCode, count: 0}],
                Action: 2
            };
            for (var i = 0; i < socketList.length; i++) {
                io.to(socketList[i]).emit("getServerAction", JSON.stringify(sendMessage));
            }
        });
    });
    db.close();
}

//播放此歌
function musicPlay (_name, _ytCode) {
    var sendMessage = {
        MusicList: [{name: _name, ytcode: _ytCode, count: 0}],
        Action: 3
    };
    for (var i = 0; i < socketList.length; i++) {
        io.to(socketList[i]).emit("getServerAction", JSON.stringify(sendMessage));
    }
}

//新增至下一首
function newMusicNext (_name, _ytCode) {
    var sendMessage =  {
        MusicList: [{name: _name, ytcode: _ytCode, count: 0}],
        Action: 4
    };
    for (var i = 0; i < socketList.length; i++) {
        io.to(socketList[i]).emit("getServerAction", JSON.stringify(sendMessage));
    }
}

//切歌
function musicCut () {
    var sendMessage =  {
        Action: 5
    };
    for (var i = 0; i < socketList.length; i++) {
        io.to(socketList[i]).emit("getServerAction", JSON.stringify(sendMessage));
    }
}

//調整音量
function changeMusic (chType) {
    chTypeList = [10, 1, -1, -10, 100, -100];
    chVolume = 0;
    if (chTypeList[chType]) {
        chVolume = chTypeList[chType];
    }
    var sendMessage = {
        chVolume: chVolume,
        Action: 6
    };
    for (var i = 0; i < socketList.length; i++) {
        io.to(socketList[i]).emit("getServerAction", JSON.stringify(sendMessage));
    }
}

//取得歌曲清單
function dbGetMusicList (_socket) {
    var db = new sqlite3.Database(file);
    songList = [];
    let y = new Date(Date.now() - 86400000);
    let t = new Date(Date.now());
    db.each("SELECT rowid AS id, name, ytcode, count, lastplay FROM Music ORDER BY count ASC, lastplay ASC", 
        function (err, row) {
            //log出所有資料
            let d = new Date(row.lastplay);

            songList.push({
                id: row.id,
                name: row.name,
                ytcode: row.ytcode,
                count: row.count,
                today: (t.getFullYear() == d.getFullYear() && t.getMonth() == d.getMonth() && t.getDate() == d.getDate()),
                yesterday: (y.getFullYear() == d.getFullYear() && y.getMonth() == d.getMonth() && y.getDate() == d.getDate())
            });
            console.log(row.id + ": " + row.name + ": " + row.ytcode + ": " + row.count + ": " + new Date(row.lastplay));
        }, function (err, count) {
            let tList = [];
            let yList = [];
            let oList = [];
            for (let i = 0; i < songList.length; i++) {
                let item = songList[i];
                if (item.count == 0) {
                    oList.push(item);
                } else if (item.today) {
                    tList.push(item);
                } else if (item.yesterday) {
                    yList.push(item);
                } else {
                    oList.push(item);
                }
            }
            songList = oList.concat(yList, tList);

            var sendMessage = {
                MusicList: songList,
                Action: 1
            };
            _socket.emit("getServerAction", JSON.stringify(sendMessage));
        }
    );
    db.close();
}

//刪除歌曲
function dbDeleteMusic (_ytCode, _socket) {
    var db = new sqlite3.Database(file);
    db.serialize(function () {
        var stmt = db.prepare("DELETE FROM Music WHERE ytcode = (?)");
        stmt.run(_ytCode);
        stmt.finalize(function (err) {
            _socket.emit("deleteComplete");
        });
    });
    db.close();
}

//新增歌曲播放次數
function addMusicCount (_ytCode) {
    var db = new sqlite3.Database(file);
    db.serialize(function () {
        var stmt = db.prepare("UPDATE Music SET count = count + 1, lastplay = (?) WHERE ytcode = (?)");
        stmt.run(Date.now(), _ytCode);
        stmt.finalize();
    });
    db.close();
}

//修改歌名
function changeMusicName (msg) {
    var db = new sqlite3.Database(file);
    db.serialize(function () {
        var stmt = db.prepare("UPDATE Music SET name = (?) WHERE ytcode = (?)");
        stmt.run(msg.name, msg.ytcode);
        stmt.finalize();
    });
    db.close();
}

//測試用，顯示目前有的歌曲
function testDBgetMusic () {
    var db = new sqlite3.Database(file);
    songList = [];
    db.each("SELECT rowid AS id, name, ytcode, count, lastplay FROM Music ORDER BY count ASC, lastplay ASC", 
        function (err, row) {
            //log出所有資料
            songList.push({
                id: row.id,
                name: row.name,
                ytcode: row.ytcode
            });
            console.log(row.id + ": " + row.name + ": " + row.ytcode + ": " + row.count + ": " + new Date(row.lastplay));
        }, function (err, count) {
            var sendMessage = {
                MusicList: songList,
                Action: 1
            };
        }
    );
    db.close();
}

//給client端測試連線是否正常
function checkLink () {
    var sendMessage = {
        Action: 999
    };
    for (var i = 0; i < socketList.length; i++) {
        io.to(socketList[i]).emit("getServerAction", JSON.stringify(sendMessage));
    }
}

// dbGetMusicList();

function serverIOCreate () {
    //綁socket io
    io = io(server);

    //設定 socket 監聽
    io.on('connection', (socket) => {
        socketList.push(socket.id);
        console.log("Server On");

        //測試連線用
        socket.on("greet", () => {
            console.log("greet");
            socket.emit("greet");
        });

        //回傳新歌曲清單
        socket.on("needSongList", () => {
            dbGetMusicList(socket);
        });

        //刪除歌曲
        socket.on("deleteSong", (msg) => {
            console.log("Delete YTcode:" + msg);
            dbDeleteMusic(msg, socket);
        });

        //增加歌曲播放次數
        socket.on("endSong", (msg) => {
            console.log("TYcode:" + msg + " add count.");
            addMusicCount(msg);
        })

        //修改歌名
        socket.on("changeSongName", (msg) => {
            changeMusicName(msg);
        });
        
        //斷線
        socket.on('disconnect', () => {
            for (var i = 0; i < socketList.length; i++) {
                if (socketList[i] == socket.id) {
                    socketList.splice(i, 1);
                }
            }
            console.log('bye');
        });
    });
}

//建立server
var server = http.createServer(function (req, res) {
    var params = url.parse(req.url, true).query;
    res.writeHead(200, {"Content-Type": "text/html"});
    if (req.url == '/') {
        
    } else if (req.url.indexOf('/addsong') >= 0) {
        if (params.name && params.ytcode) {
            if (params.action) {
                switch (params.action) {
                    case '1':
                        dbNewMusic(params.name, params.ytcode);
                        break;
                    case '2':
                        musicPlay(params.name, params.ytcode);
                        break;
                    case '3':
                        newMusicNext(params.name, params.ytcode);
                        break;
                    case '4':
                        musicCut();
                        break;
                    case '5': case '6': case '7': case '8': case '9': case '10':
                        changeMusic(Number(params.action) - 5);
                        break;
                    case '999':
                        checkLink();
                        break;
                    default:
                        console.log(params.action);
                        break;
                }
            } else {
                dbNewMusic(params.name, params.ytcode);
            }
        }
    }
    res.end();
}).listen(6780, () => {
    console.log("Node.js web server at port 6780 is running..");
});

//開啟server
var httpServer = http.createServer(function (req, res) {
    var params = url.parse(req.url, true).query;
    if (req.url == '/') {
        res.writeHead(200, {"Content-Type": "text/html"});
        res.write(htmlData);
    } else if (req.url=='/socket.io.js') {
        res.writeHead(200, {"Content-Type": "text/html"});
        res.write(socketIOjs);
    } else if (req.url=='/sound.mp3') {
        res.writeHead(200, {"Content-Type": "audio/mpeg"});
        res.write(soundObj);
    }
    res.end();
}).listen(8080, () => {
    console.log("Node.js web server at port 8080 is running..");
});

serverIOCreate();
