FROM ubuntu:16.04 AS build-ersd

RUN apt-get update && \
	apt-get install curl -y

RUN curl -sL https://deb.nodesource.com/setup_12.x | bash - && apt-get install nodejs -y

WORKDIR /ersd

COPY . .

RUN npm install -g @angular/cli
RUN npm ci
RUN ng build client
RUN ng build server

FROM node
RUN mkdir -p /ersd/server && mkdir /ersd/client
WORKDIR /ersd

COPY --from=build-ersd /ersd/node_modules/. /ersd/node_modules/
COPY --from=build-ersd /ersd/dist/apps/client/. /ersd/client/
COPY --from=build-ersd /ersd/dist/apps/server/. /ersd/server/

WORKDIR /ersd/server
RUN mkdir -p /ersd/server/assets

EXPOSE 3333

ENTRYPOINT ["node", "main.js"]
