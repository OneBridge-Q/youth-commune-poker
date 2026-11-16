'use strict';
const cloud = require('wx-server-sdk');
const { createService } = require('./service');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
exports.main = createService(cloud);
