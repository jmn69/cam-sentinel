const mongoose = require('mongoose');
const axios = require('axios');
const stream = require('stream');
const { promisify } = require('util');
const AWS = require('aws-sdk');
const { spawn } = require('child_process');
const parseString = require('xml2js').parseString;
const rootCas = require('ssl-root-cas').create();
require('https').globalAgent.options.ca = rootCas;

const https = require('https');

const agent = new https.Agent({ rejectUnauthorized: false, timeout: 5000 });
const config = require('./config');

const pipeline = promisify(stream.pipeline);
let isRecording = false;

Promise = require('bluebird'); // eslint-disable-line no-global-assign

mongoose.Promise = Promise;

const mongoUri = config.mongo.host;
mongoose.connect(mongoUri, {
  keepAlive: true,
  useNewUrlParser: true,
});
mongoose.connection.on('error', () => {
  throw new Error(`unable to connect to database: ${mongoUri}`);
});

mongoose.set('useFindAndModify', false);

const pad = (n, width, z) => {
  z = z || '0';
  n += '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
};

const Camera = require('./model/camera.model');
const Alert = require('./model/alert.model');

const handleAlarmFired = async camera => {
  isRecording = true;
  const s3 = new AWS.S3({
    accessKeyId: config.aws.accessKey,
    secretAccessKey: config.aws.accessSecretKey,
    region: 'eu-west-3',
    signatureVersion: 'v4',
  });

  const d = new Date();
  const fileName = `${pad(d.getDate(), 2)}${pad(
    d.getMonth() + 1,
    2
  )}${d.getFullYear()}-${pad(d.getHours(), 2)}${pad(d.getMinutes(), 2)}${pad(
    d.getSeconds(),
    2
  )}`;

  const s3UploadCallBack = async (S3err, S3data, isImage) => {
    if (S3err) {
      console.log('Error S3 upload: ', S3err);
    }
 else {
      let alert = null;
      try {
        alert = await Alert.findByCameraIdAndHappenedAt(camera._id, d);
      }
 catch (err) {
        console.log(`findByCameraIdAndHappenedAt error: ${err}`);
      }
      if (alert) {
        const alertToUpdate = isImage
          ? { imageUrl: S3data.Location }
          : { videoUrl: S3data.Location };
        try {
          Alert.updateAlert(alert._id, alertToUpdate);
        }
 catch (err) {
          console.log(`updateAlert error: ${err}`);
        }
      }
 else {
        const newAlert = isImage
          ? {
              camera: camera._id,
              happenedAt: d,
              imageUrl: S3data.Location,
            }
          : {
              camera: camera._id,
              happenedAt: d,
              videoUrl: S3data.Location,
            };
        const alertToAdd = Alert(newAlert);
        try {
          await alertToAdd.save();
        }
 catch (err) {
          console.log(`alert error: ${err}`);
        }
      }
    }
  };

  const uploadImageFromStream = () => {
    const pass = new stream.PassThrough();
    const params = {
      Bucket: 'jordane-michon-alerts',
      Key: `image/${fileName}.jpg`,
      ACL: 'private',
      Body: pass,
    };
    s3.upload(params, async (S3err, S3data) =>
      s3UploadCallBack(S3err, S3data, true)
    );
    return pass;
  };

  const uploadVideoFromStream = () => {
    const pass = new stream.PassThrough();
    const params = {
      Bucket: 'jordane-michon-alerts',
      Key: `video/${fileName}.mp4`,
      ACL: 'private',
      Body: pass,
    };
    s3.upload(params, async (S3err, S3data) =>
      s3UploadCallBack(S3err, S3data, false)
    );
    return pass;
  };

  const argsImage = (
    '-loglevel panic -rtsp_transport tcp -use_wallclock_as_timestamps 1 -i ' +
    `rtsp://${camera.user}:${camera.pwd}@${camera.publicDomain}:${camera.rtspPort}/videoMain ` +
    '-ss 00:00:01.000 -frames:v 1 -c:v png -f image2pipe pipe:1'
  ).split(' ');

  const argsVideo = (
    '-loglevel panic -rtsp_transport tcp -use_wallclock_as_timestamps 1 -i ' +
    `rtsp://${camera.user}:${camera.pwd}@${camera.publicDomain}:${camera.rtspPort}/videoMain ` +
    '-an -t 30 -c:v copy -f mp4 -movflags +frag_keyframe+empty_moov+default_base_moof pipe:1'
  ).split(' ');

  const ffmpegImage = spawn('ffmpeg', argsImage, {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const ffmpegVideo = spawn('ffmpeg', argsVideo, {
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  await pipeline(ffmpegImage.stdout, uploadImageFromStream(camera));

  await pipeline(ffmpegVideo.stdout, uploadVideoFromStream(camera));
  console.log('Pipeline succeeded');
  isRecording = false;
};

const watchFoscamState = async () => {
  try {
    const cameras = await Camera.list();
    if (cameras && Array.isArray(cameras)) {
      cameras.map(async camera => {
        // TODO: Foscam C1 hardcoded for now, change this later
        if (camera.type === 1) {
          try {
            const response = await axios.get(
              `https://${camera.publicDomain}:${camera.httpsPort}/cgi-bin/CGIProxy.fcgi?cmd=getDevState&usr=${camera.user}&pwd=${camera.pwd}`,
              {
                httpsAgent: agent,
              }
            );
            parseString(
              response.data,
              { explicitArray: false },
              (err, result) => {
                if (result && result.CGI_Result) {
                  const ioAlarmResult = Number(
                    result.CGI_Result.motionDetectAlarm
                  );
                  console.log(`${camera.name}: ${ioAlarmResult}`);
                  if (ioAlarmResult === 2 && !isRecording) {
                    handleAlarmFired(camera);
                  }
                  Camera.findOneAndUpdate(
                    { _id: camera.id },
                    { $set: { ioAlarm: ioAlarmResult, isOnline: true } },
                    error => {
                      if (error) {
                        console.log(error);
                      }
                    }
                  );
                }
 else {
                  Camera.findOneAndUpdate(
                    { _id: camera.id },
                    { $set: { isOnline: false } },
                    error => {
                      if (error) {
                        console.log(error);
                      }
                    }
                  );
                }
              }
            );
          }
 catch (e) {
            Camera.findOneAndUpdate(
              { _id: camera.id },
              { $set: { isOnline: false } },
              error => {
                if (error) {
                  console.log(error);
                }
              }
            );
          }
        }
      });
    }
  }
 catch (e) {
    console.log(e);
  }
  setTimeout(watchFoscamState, 3 * 1000);
};
watchFoscamState();
