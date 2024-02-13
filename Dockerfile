FROM python:3.11.4-slim AS build-ersd

RUN apt-get update && \
	apt-get install curl make gcc g++ -y

RUN curl -sL https://deb.nodesource.com/setup_18.x | bash - && apt-get install nodejs -y

WORKDIR /ersd

COPY . .

RUN npm install -g @angular/cli@16.1.4

RUN npm ci
RUN npm run build:server
RUN npm run build:client
RUN npm prune --omit=dev

FROM ubuntu:mantic-20231011

RUN apt-get update && \
	apt-get install curl -y && \
	apt-get upgrade -y

RUN curl -SLO https://deb.nodesource.com/nsolid_setup_deb.sh
RUN chmod 500 nsolid_setup_deb.sh
RUN ./nsolid_setup_deb.sh 18
RUN apt-get install nodejs -y
RUN apt-get clean

RUN mkdir -p /ersd/server && mkdir /ersd/client
WORKDIR /ersd

COPY --from=build-ersd /ersd/node_modules/. /ersd/node_modules/
COPY --from=build-ersd /ersd/dist/apps/client/. /ersd/client/
COPY --from=build-ersd /ersd/dist/apps/server/. /ersd/server/

WORKDIR /ersd/server
RUN mkdir -p /ersd/server/assets

EXPOSE 3333

ENTRYPOINT ["node", "main.js"]
