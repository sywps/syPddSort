'use strict';
require('./douyin-business-cloud.test').testClient().catch(error => { console.error(error); process.exitCode = 1; });
