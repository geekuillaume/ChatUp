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
    '      <input type="text" placeholder="Your Name" class="ChatUpTestNameInput" value="TestUser"> <button class="ChatUpTestAuthenticate">Authenticate</button>',
    '    </div>',
    '  </div>',
    '  <div class="ChatUpTestContainer"></div>',
    '</div>'].join('\n');
  document.getElementById('main').appendChild(element);
  var roomInput = findClass(element, 'ChatUpTestRoomInput');
  var joinButton = findClass(element, 'ChatUpTestJoin');
  var nameInput = findClass(element, 'ChatUpTestNameInput');
  var authenticateButton = findClass(element, 'ChatUpTestAuthenticate');

  var chatup;

  joinButton.onclick = function() {
    chatup = new ChatUp.ChatUp(findClass(element, 'ChatUpTestContainer'), {
      dispatcherURL: document.getElementById('dispatcherURL').value,
      room: roomInput.value,
      socketIO: {transports: ['websocket'], multiplex: false} // Disabling multiplex to force multiple websockets and not reusing an already connected one
    });
    chatup.init();
  };
  authenticateButton.onclick = function() {
		if (chatup) {
    	chatup.authenticate({name: nameInput.value});
		}
  };
}

document.addEventListener("DOMContentLoaded", function(event) {
  addChatUp();
  document.getElementById('addChatUpInstance').onclick = addChatUp;
});
