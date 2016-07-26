var fs = require('fs');
var path = require('path');
var url = require('url');

var PORT = 29231;
var PONG_DELTA = 10E3;
var NOT_FOUNT_MSG = '小胡子哥提醒您：404 了！';
var FAVICON = fs.readFileSync(path.join(__dirname, 'favicon.ico'));
var whiteList = [
  '0.0.0.0',
  '127.0.0.1',
  'barret',
  'localhost',
  '123.56.230.53',
  'barretlee.com',
  'www.barretlee.com',
  'barret.cc',
  'www.barret.cc',
  'xiaohuzige.com',
  'www.xiaohuzige.com'
];

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
    var id = socket.id.slice(0, 12);
    var referer = socket.client.request.headers.referer;
    if(referer) {
      referer = url.parse(referer);
    }
    if(!referer || referer && whiteList.indexOf(referer.hostname) == -1) {
      return socket.emit('pm', {
        msg: '请将服务部署在自己的服务器上玩耍~',
        type: "DISCONNECT"
      });
    }
    // 用户与服务器第一次握手，服务器传递信息给客户端
    socket.emit('connected', {
      id: id,
      size: Object.keys(self.onlineUser).length
    });
    // 用户与服务器第二次握手，客户端传递信息给服务器
    socket.on('createUser', function (data) {
      // 用户 userId 作为 session 信息保存在用户客户端
      var userId = data.userId;
      var userName = data.userName;
      var userAvatar = data.userAvatar;
      if(!self.onlineUser[userId]) {
        // 广播新用户
        io.emit('broadcast', {
          id: userId,
          name: userName,
          avatar: userAvatar,
          msg: '欢迎 ' + userName + ' 加入群聊！',
          type: "NEW"
        });
      }
      self.onlineUser[userId] = socket || {};
      for(var key in data) {
        self.onlineUser[userId][key] = data[key];
      }
    });

    // 断开连接
    socket.on('disconnet', function(data) {
      var userId = data.id;
      if(self.onlineUser[userId]) {
        // io.emit('broadcast', {
        //   msg: '用户 ' + userId + ' 离开群聊',
        //   type: "LEAVE"
        // });
        delete self.onlineUser[userId];
      }
    });

    // 群聊，广播信息
    socket.on('gm', function(data) {
      var socket = self.onlineUser[data.id];
      if(socket) {
        var nowTime = Math.floor(new Date().getTime() / 1000);
        if(socket.speakTotalTimes > 200) {
          socket.speakTotalTimes++;
          return socket.emit('pm', {
            msg: '发送失败，你咋这多话要说？等会儿再来吧。',
            id: 'system',
            name: 'system',
            avatar: null,
            type: "ATTENSION"
          });
        }
        if(socket.speakTotalTimes > 2000) {
          socket.speakTotalTimes++;
          return socket.emit('pm', {
            msg: '请正常聊天！',
            type: "DISCONNECT"
          });
        }
        if(socket.lastSpeakTime && nowTime - socket.lastSpeakTime < 3) {
          return socket.emit('pm', {
            msg: '发送失败，请注意语速！',
            id: 'system',
            name: 'system',
            avatar: null,
            type: "ATTENSION"
          });
        }
        socket.lastSpeakTime = Math.floor(new Date().getTime() / 1000);
        socket.lastSpeakContent = data.msg;
        socket.speakTotalTimes = socket.speakTotalTimes || 0;
        socket.speakTotalTimes++;
      }
      if(data.msg.length >= 516) {
        data.msg = data.msg.slice(0, 500) + '...(输入太长，系统自动截断)';
      }
      data.msg && io.emit('broadcast', {
        msg: data.msg,
        id: data.id,
        name: data.name,
        avatar: data.avatar,
        type: 'BROADCAST'
      });
    });

    // 客户端请求心跳检测
    socket.on('ping', function(data) {
      self.pong(data.id);
    });

    // 私聊
    socket.on('pm', function(data) {
      if(data.id.length > 12 || !self.onlineUser[data.id]) {
        return socket.emit('pm', {
          msg: '请正常聊天！',
          type: "DISCONNECT"
        });
      }
      var toUserId = data.targetId;
      var toSocket = self.onlineUser[toUserId];
      if(toSocket) {
        if(data.msg.length >= 516) {
          data.msg = data.msg.slice(0, 500) + '...(输入太长，系统自动截断)';
        }
        data.msg && toSocket.emit('pm', {
          msg: data.msg,
          id: data.id,
          name: data.name,
          avatar: data.avatar,
          type: "PM"
        });
      } else {
        socket.emit('pm', {
          id: data.id,
          msg: '对方已下线' ,
          type: "OFFLINE"
        });
      }
    });
  });
  // 心跳机制
  setInterval(function() {
    self.pong();
  }, PONG_DELTA);
};

ChatRoom.prototype.pong = function(uid) {
  var self = this;
  var users = [];
  for(var id in self.onlineUser) {
    users.push({
      id: id,
      name: self.onlineUser[id].userName,
      avatar: self.onlineUser[id].userAvatar
    });
  }
  var socket = uid ? self.onlineUser[uid] : self.io;
  socket.emit('pong', {
    users: users,
    count: users.length,
    type: uid ? 'PING-BACK' : 'PONG'
  });
};

new ChatRoom();
