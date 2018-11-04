const mongoose = require('mongoose');
const axios = require('axios');

const parseString = require('xml2js').parseString;
const rootCas = require('ssl-root-cas').create();
require('https').globalAgent.options.ca = rootCas;
const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });
const config = require('./config');

Promise = require('bluebird'); // eslint-disable-line no-global-assign
mongoose.Promise = Promise;

const mongoUri = config.mongo.host;
mongoose.connect(mongoUri, {
  useMongoClient: true,
  server: { socketOptions: { keepAlive: 1 } },
});
mongoose.connection.on('error', () => {
  throw new Error(`unable to connect to database: ${mongoUri}`);
});

const Camera = require('./camera.model');
const watchFoscamState = async () => {
  try {
    const cameras = await Camera.list();
    if (cameras && Array.isArray(cameras)) {
      cameras.map(async camera => {
        // TODO: Foscam C1 hardcoded for now, change this later
        if (camera.type === 1) {
          console.log(
            `https://${
              camera.privateIp
            }/cgi-bin/CGIProxy.fcgi?cmd=getDevState&usr=${camera.user}&pwd=${
              camera.pwd
            }`
          );
          try {
            const response = await axios.get(
              `https://${
                camera.privateIp
              }/cgi-bin/CGIProxy.fcgi?cmd=getDevState&usr=${camera.user}&pwd=${
                camera.pwd
              }`,
              {
                httpsAgent: agent,
              }
            );
            parseString(
              response.data,
              { explicitArray: false },
              (err, result) => {
                if (result && result.CGI_Result && result.CGI_Result.IOAlarm) {
                  // TODO: cam online
                  console.log(`online : ${camera.privateIp}`);
                  console.log(`IOAlarm : ${result.CGI_Result.IOAlarm}`);
                } else {
                  // TODO: cam offline
                  console.log(`offline: ${camera.privateIp}`);
                }
              }
            );
          } catch (e) {
            console.log(e);
            // TODO: cam offline
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
