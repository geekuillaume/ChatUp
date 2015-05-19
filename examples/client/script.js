var chatup = new ChatUp({
  dispatcherURL: 'http://localhost:8000/',
  userInfo: {name: 'Geek'},
  room: 'test1'
});

chatup.init().then(function() {
  console.log('Done');
}).catch(function(err) {
  console.error('Error:', err);
});
