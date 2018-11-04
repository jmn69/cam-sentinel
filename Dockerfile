FROM node:8.11.4

RUN mkdir -p /app

WORKDIR /app

ADD package.json yarn.lock /app/

RUN yarn --pure-lockfile

COPY . /app

# cmd to start service
CMD [ "yarn", "start" ]
