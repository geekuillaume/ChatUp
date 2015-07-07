#!/bin/bash

# Add nodesource apt source for Ubuntu to install NodeJS 0.12
curl -sL https://deb.nodesource.com/setup_0.12 > nodeinstall.sh
bash ./nodeinstall.sh
wait
# Install NodeJS, build-essential (for nginx build) and git
apt-get install -y nodejs build-essential git
wait
# Install the dependancies of Nginx
apt-get -y build-dep nginx
wait


# Get Nginx Push Stream Module sources
git clone https://github.com/wandenberg/nginx-push-stream-module.git
# Get Nginx 1.9.1 sources
wget http://nginx.org/download/nginx-1.9.1.tar.gz
tar -xvf nginx-1.9.1.tar.gz
cd nginx-1.9.1
# Configure and install Nginx with PushStream and SSL
./configure --add-module=../nginx-push-stream-module --with-http_ssl_module
make
make install

# Get Chatup and install its dependancies
git clone git@github.com:geekuillaume/ChatUp.git
cd ChatUp
npm install
