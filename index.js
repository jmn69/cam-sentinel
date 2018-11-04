const mongoose = require('mongoose');
const axios = require('axios');

const parseString = require('xml2js').parseString;
const rootCas = require('ssl-root-cas').create();
require('https').globalAgent.options.ca = rootCas;

const https = require('https');

const agent = new https.Agent({ rejectUnauthorized: false, timeout: 5000 });
const config = require('./config');

Promise = require('bluebird'); // eslint-disable-line no-global-assign

mongoose.Promise = Promise;

const mongoUri = config.mongo.host;
mongoose.connect(mongoUri, {
  useMongoClient: true,
  server: { socketOptions: { keepAlive: 1 } }
});
mongoose.connection.on('error', () => {
  throw new Error(`unable to connect to database: ${mongoUri}`);
});

const Camera = require('./model/camera.model');

const watchFoscamState = async () => {
  try {
    const cameras = await Camera.list();
    if (cameras && Array.isArray(cameras)) {
      cameras.map(async (camera) => {
        // TODO: Foscam C1 hardcoded for now, change this later
        if (camera.type === 1) {
          try {
            const response = await axios.get(
              `https://${camera.privateIp}/cgi-bin/CGIProxy.fcgi?cmd=getDevState&usr=${
                camera.user
              }&pwd=${camera.pwd}`,
              {
                httpsAgent: agent
              }
            );
            parseString(response.data, { explicitArray: false }, (err, result) => {
              if (result && result.CGI_Result) {
                Camera.update(
                  { _id: camera.id },
                  { $set: { ioAlarm: Number(result.CGI_Result.IOAlarm), isOnline: true } },
                  (error) => {
                    if (error) {
                      console.log(error);
                    }
                  }
                );
              } else {
                Camera.update({ _id: camera.id }, { $set: { isOnline: false } }, (error) => {
                  if (error) {
                    console.log(error);
                  }
                });
              }
            });
          } catch (e) {
            Camera.update({ _id: camera.id }, { $set: { isOnline: false } }, (error) => {
              if (error) {
                console.log(error);
              }
            });
          }
        }
      });
    }
  } catch (e) {
    console.log(e);
  }
  setTimeout(watchFoscamState, 3 * 1000);
};
watchFoscamState();
