// Example of a ChatUp Client
var ChatUpClientExample = (function () {
    function ChatUpClientExample(el, conf) {
        var _this = this;
        this._updateUserCount = function (stats) {
            _this._connectedCountEl.innerText = String(stats.pubCount);
            _this._guestCountEl.innerText = String(stats.subCount - stats.pubCount);
        };
        this._protocolStatusChange = function (status) {
            if (status === 'connected') {
                _this._statusTextEl.innerText = 'Connected to ' + _this._conf.room + ' on server ' + _this._protocol._worker.host;
            }
            else if (status === 'authenticated') {
                _this._statusTextEl.innerText = 'Connected as a publisher to ' + _this._conf.room + ' on server: ' + _this._protocol._worker.host;
            }
            else if (status === 'gettingWorker') {
                _this._statusTextEl.innerText = 'Getting worker from dispatcher';
            }
            else if (status === 'pubConnectError') {
                _this._statusTextEl.innerText = 'Error connecting to worker, retrying...';
            }
            else if (status === 'subConnectError') {
                _this._statusTextEl.innerText = 'Error connecting to sub worker, retrying...';
            }
            else if (status === 'workerSwitch') {
                _this._statusTextEl.innerText = 'Getting another worker';
            }
            else if (status === 'noWorker') {
                _this._statusTextEl.innerText = 'No worker available, retrying...';
            }
            else if (status === 'authError') {
                _this._statusTextEl.innerText = 'Wrong JWT token';
            }
            else if (status === 'dispatcherError') {
                _this._statusTextEl.innerText = 'Error with dispatcher, retrying...';
            }
        };
        this._initHTML = function () {
            _this._el.innerHTML = ChatUpClientExample._template;
            _this._statusTextEl = findClass(_this._el, 'ChatUpStatusText');
            _this._guestCountEl = findClass(_this._el, 'ChatUpGuestCount');
            _this._connectedCountEl = findClass(_this._el, 'ChatUpConnectedCount');
            _this._messageForm = findClass(_this._el, 'ChatUpForm');
            _this._messageInput = findClass(_this._el, 'ChatUpInput');
            _this._messagesContainer = findClass(_this._el, 'ChatUpMessages');
            _this._messageForm.onsubmit = _this._formSubmit;
        };
        this._formSubmit = function (e) {
            e.preventDefault();
            if (_this._messageInput.value.length === 0) {
                return;
            }
            if (!_this._protocol._pubConnected) {
                return console.error('You need to be authenticated to send a message');
            }
            _this._protocol.say(_this._messageInput.value).catch(function (err) {
              if (err.err === 'banned') {
                var banMessage = "You are banned from this room";
                if (err.ttl > 0) {
                  banMessage += " (" + err.ttl + " seconds remaining)"
                }
                _this._statusTextEl.innerText = banMessage;
                return
              }
              console.error(err);
            });
            _this._messageInput.value = "";
        };
        this._onMsg = function (messageData) {
            var atBottom = _this._messagesContainer.scrollTop === _this._messagesContainer.scrollHeight - _this._messagesContainer.offsetHeight;
            _this._messagesContainer.innerHTML += [
                '<div class="ChatUpMessage">',
                '<p class="ChatUpMessageSender">' + messageData.user.name + '</p>',
                '<p class="ChatUpMessageContent">' + messageData.msg + '</p>',
                '</div>'].join('\n');
            if (atBottom) {
                _this._messagesContainer.scrollTop = Infinity;
            }
        };
        this._onEv = function (messageData) {
            var atBottom = _this._messagesContainer.scrollTop === _this._messagesContainer.scrollHeight - _this._messagesContainer.offsetHeight;
            if (messageData.ev === 'join') {
                _this._messagesContainer.innerHTML += [
                    '<div class="ChatUpMessage">',
                    '<p class="ChatUpMessageSender">' + messageData.user.name + ' joined</p>',
                    '</div>'].join('\n');
            }
            if (messageData.ev === 'leave') {
                _this._messagesContainer.innerHTML += [
                    '<div class="ChatUpMessage">',
                    '<p class="ChatUpMessageSender">' + messageData.user.name + ' left</p>',
                    '</div>'].join('\n');
            }
            if (atBottom) {
                _this._messagesContainer.scrollTop = Infinity;
            }
        };
        this._el = el;
        this._conf = conf;
        this._protocol = new window.ChatUp.ChatUpProtocol(this._conf);
        this._protocol.onMsg(this._onMsg);
        this._protocol.onEv(this._onEv);
        this._protocol.onStatusChange(this._protocolStatusChange);
        this._protocol.onUserCountUpdate(this._updateUserCount);
        this._initHTML();
    }
    ChatUpClientExample.prototype.authenticate = function (jwt) {
        if (this._protocol.status !== 'connected' && this._protocol.status !== 'authError') {
            console.error('You need to be connected and not already authenticated to do that');
        }
        else {
            this._conf.jwt = jwt;
            return this._protocol.authenticate();
        }
    };
    ChatUpClientExample.prototype.init = function () {
        return this._protocol.init();
    };
    ChatUpClientExample._template = "\n    <div class=\"ChatUpContainer\">\n      <div class=\"ChatUpStatus\">Status: <span class=\"ChatUpStatusText\">Disconnected</span></div>\n      <div class=\"ChatUpCount\">Guest: <span class=\"ChatUpGuestCount\">0</span> - Connected Users: <span class=\"ChatUpConnectedCount\">0</span></div>\n      <div class=\"ChatUpMessages\"></div>\n      <div class=\"ChatUpFormContainer\">\n        <form class=\"ChatUpForm\">\n          <input type=\"text\" required=\"true\" class=\"ChatUpInput\">\n          <button class=\"ChatUpFormButton\">Send</button>\n        </form>\n      </div>\n    </div>\n  ";
    return ChatUpClientExample;
})();


function findClass(element,className) {
	var foundElement=null,found;
	function recurse(element,className,found) {
		for(var i=0;i<element.childNodes.length&&!found;i++) {
			var el=element.childNodes[i];
			var classes=el.className!==undefined? el.className.split(" "):[];
			for(var j=0,jl=classes.length;j<jl;j++) {
				if(classes[j]==className) {
					found=true;
					foundElement=element.childNodes[i];
					break;
				}
			}
			if(found)
				break;
			recurse(element.childNodes[i],className,found);
		}
	}
	recurse(element,className,false);
	return foundElement;
}

function addChatUp() {
  var element = document.createElement('div');
  element.innerHTML = [
    '<div class="ChatUpTest col-md-3">',
    '  <div class="ChatUpTestRoom">',
    '    <div>',
    '      <input type="text" placeholder="Room Name" class="ChatUpTestRoomInput" value="TestRoom"> <button class="ChatUpTestJoin">Join room</button>',
    '    </div>',
    '    <div>',
    '      <textarea type="text" placeholder="JsonWebToken" class="ChatUpTestJWT"></textarea> <button class="ChatUpTestAuthenticate">Authenticate</button>',
    '    </div>',
    '  </div>',
    '  <div class="ChatUpTestContainer"></div>',
    '</div>'].join('\n');
  document.getElementById('main').appendChild(element);
  var roomInput = findClass(element, 'ChatUpTestRoomInput');
  var joinButton = findClass(element, 'ChatUpTestJoin');
  var jwtTextArea = findClass(element, 'ChatUpTestJWT');
  var authenticateButton = findClass(element, 'ChatUpTestAuthenticate');

  var chatup;

  joinButton.onclick = function() {
    chatup = new ChatUpClientExample(findClass(element, 'ChatUpTestContainer'), {
      dispatcherURL: document.getElementById('dispatcherURL').value,
      room: roomInput.value,
      socketIO: {transports: ['websocket'], multiplex: false} // Disabling multiplex to force multiple websockets and not reusing an already connected one
    });
    chatup.init();
  };
  authenticateButton.onclick = function() {
		if (chatup) {
    	chatup.authenticate(jwtTextArea.value);
		}
  };
}

document.addEventListener("DOMContentLoaded", function(event) {
  addChatUp();
  document.getElementById('addChatUpInstance').onclick = addChatUp;
});
