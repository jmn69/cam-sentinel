const Promise = require('bluebird');
const mongoose = require('mongoose');
const httpStatus = require('http-status');
const APIError = require('../APIError');

const Schema = mongoose.Schema;

/**
 * Alert Schema
 */
const AlertSchema = new Schema(
  {
    image: {
      key: String,
      bucket: String,
    },
    video: {
      key: String,
      bucket: String,
    },
    happenedAt: {
      type: Date,
      required: true,
    },
    camera: { type: Schema.Types.ObjectId, ref: 'Camera' },
  },
  { timestamps: true }
);

/**
 * Add your
 * - pre-save hooks
 * - validations
 * - virtuals
 */

/**
 * Methods
 */
AlertSchema.method({});

/**
 * Statics
 */
AlertSchema.statics = {
  /**
   * Get alert
   * @param {ObjectId} id - The objectId of the alert.
   * @returns {Promise<Alert, APIError>}
   */
  get(id) {
    return this.findById(id)
      .populate('camera')
      .exec()
      .then(alert => {
        if (alert) {
          return alert;
        }
        const err = new APIError('No such alert exists!', httpStatus.NOT_FOUND);
        return Promise.reject(err);
      });
  },

  /**
   * Find Alert by camera Id and happenedAt
   * @param {ObjectId} cameraId - The objectId of the camera.
   * @param {Date} happenedAt - The date happenedAt
   * @returns {Promise<Alert>}
   */
  findByCameraIdAndHappenedAt(cameraId, happenedAt) {
    return this.findOne({
      camera: cameraId,
      happenedAt: {
        $eq: happenedAt,
      },
    })
      .exec()
      .then(alert => {
        if (alert) {
          return alert;
        }
        return Promise.reject();
      });
  },

  /**
   * Set the dominant color on a Product
   * @param {String} code - The product code.
   * @param {String} color - The hexa color code.
   * @returns {Promise<Alert, APIError>}
   */
  async updateAlert(alertId, alertToUpdate) {
    try {
      const foundAndUpdatedAlert = await this.findOneAndUpdate(
        { _id: alertId },
        alertToUpdate,
        err => {
          if (err) {
            console.log(err);
          }
        }
      );
      return foundAndUpdatedAlert;
    }
 catch (e) {
      const err = new APIError(e, httpStatus.INTERNAL_SERVER_ERROR);
      return Promise.reject(err);
    }
  },

  /**
   * List alert in descending order of 'createdAt' timestamp.
   * @param {number} skip - Number of alert to be skipped.
   * @param {number} limit - Limit number of alert to be returned.
   * @returns {Promise<Alert[]>}
   */
  list({ skip = 0, limit = 50 } = {}) {
    return this.find()
      .populate('camera')
      .sort({ createdAt: -1 })
      .skip(+skip)
      .limit(+limit)
      .exec();
  },
};

/**
 * @typedef Alert
 */
module.exports = mongoose.model('Alert', AlertSchema);
