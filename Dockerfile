FROM ubuntu

# Nodejs install

RUN set -ex \
 && for key in \
   9554F04D7259F04124DE6B476D5A82AC7E37093B \
   94AE36675C464D64BAFA68DD7434390BDBE9B9C5 \
   0034A06D9D9B0064CE8ADF6BF1747F4AD2306D93 \
   FD3A5288F042B6850C66B31F09FE44734EB7990E \
   71DCFD284A79C3B38668286BC97EC7A07EDE3FC1 \
   DD8F2338BAE7501E3DD5AC78C273792F7D83545D \
 ; do \
   gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys "$key"; \
 done

ENV NPM_CONFIG_LOGLEVEL info
ENV NODE_VERSION 4.0.0

RUN apt-get update \
 && apt-get install -y curl \
 && curl -SLO "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.gz" \
 && curl -SLO "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt.asc" \
 && gpg --verify SHASUMS256.txt.asc \
 && grep " node-v$NODE_VERSION-linux-x64.tar.gz\$" SHASUMS256.txt.asc | sha256sum -c - \
 && tar -xzf "node-v$NODE_VERSION-linux-x64.tar.gz" -C /usr/local --strip-components=1 \
 && rm "node-v$NODE_VERSION-linux-x64.tar.gz" SHASUMS256.txt.asc

RUN groupadd -r chatup && useradd -r -g chatup chatup

# Git and Nginx dependencies
RUN apt-get update && \
  apt-get install -y build-essential git wget && \
  apt-get -y build-dep nginx && \
  wget http://nginx.org/download/nginx-1.9.1.tar.gz && \
  tar -xvf nginx-1.9.1.tar.gz && \
  wget -O nginx-push-stream-module.tar.gz https://github.com/wandenberg/nginx-push-stream-module/archive/0.5.1.tar.gz && \
  tar -xvf nginx-push-stream-module.tar.gz

# Nginx with PushStram compilation

RUN cd nginx-1.9.1 && \
  ./configure --add-module=../nginx-push-stream-module-0.5.1 --with-http_ssl_module && \
  make && \
  make install

WORKDIR /home/chatup

COPY . /home/chatup

RUN npm install

EXPOSE 80

ENTRYPOINT ["./entrypoint.js"]
