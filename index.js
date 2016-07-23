var fs = require('fs');
var path = require('path');

var PORT = 29231;
var PONG_DELTA = 5E3;
var NOT_FOUNT_MSG = '小胡子哥提醒您：404 了！';
var FAVICON = fs.readFileSync(path.join(__dirname, 'favicon.ico'));

var ChatRoom = function() {
  this.init();
  this.onlineUser = {};
};

ChatRoom.prototype.init = function() {
  var app = require('http').createServer(this.router);
  this.io = require('socket.io')(app);
  app.listen(PORT, function(){
    console.log('run at: http://127.0.0.1:' + PORT);
  });
  this.bindEvent();
};

ChatRoom.prototype.router = function(req, res) {
  if (req.url === '/') {
    res.writeHead(200, {
      'Content-Type': 'text/html;charset=utf-8'
    });
    res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  } else if(req.url === '/favicon.ico') {
    res.writeHead(200);
    res.end(FAVICON);
  } else {
    res.end(NOT_FOUNT_MSG);
  }
};

ChatRoom.prototype.bindEvent = function() {
  var self = this;
  var io = this.io;

  // 新用户
  io.on('connection', function (socket) {
    var id = socket.userId = socket.id;
    // 用户与服务器第一次握手，服务器传递信息给客户端
    socket.emit('connected', { id: id });
    // 用户与服务器第二次握手，客户端传递信息给服务器
    socket.on('createUser', function (data) {
      // 用户 userId 作为 session 信息保存在用户客户端
      var userId = data.userId;
      var userName = data.userName;
      var userAvatar = data.userAvatar;
      if(!self.onlineUser[userId]) {
        // 广播新用户
        io.emit('broadcast', {
          msg: '欢迎 ' + userName + ' 加入群聊！',
          type: "NEW"
        });
      }
      self.onlineUser[userId] = Object.assign(socket, data);
    });

    // 断开连接
    socket.on('disconnet', function(data) {
      var userId = data.userId;
      if(self.onlineUser[userId]) {
        io.emit('broadcast', {
          msg: '用户 ' + userId + ' 离开群聊',
          type: "LEAVE"
        });
        delete self.onlineUser[userId];
      }
    });

    // 群聊，广播信息
    socket.on('gm', function(data) {
      io.emit('broadcast', {
        msg: data.msg,
        id: data.id,
        name: data.name,
        avatar: data.avatar
      });
    });

    // 私聊
    socket.on('pm', function(data) {
      var toUserId = data.toId;
      var toSocket = self.onlineUser[toUserId];
      if(toSocket) {
        toSocket.emit('pm', {
          msg: data.msg,
          id: data.id,
          name: data.name,
          avatar: data.avatar
        });
      } else {
        socket.emit('pm', {
          msg: '对方已下线' ,
          type: "OFFLINE"
        });
      }
    });
  });
  this.welcome();
};

ChatRoom.prototype.welcome = function() {
  var self = this;
  // 心跳机制
  setInterval(function() {
    var users = [];
    for(var id in self.onlineUser) {
      users.push({
        id: id,
        name: self.onlineUser[id].userName,
        avatar: self.onlineUser[id].userAvatar
      });
    }
    self.io.emit('pong', {
      users: users,
      count: users.length
    });
  }, PONG_DELTA);
};

new ChatRoom();
