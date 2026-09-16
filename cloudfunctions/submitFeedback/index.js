const cloud = require('wx-server-sdk');
const { createSubmitFeedback } = require('./service');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const submit = createSubmitFeedback({
    runTransaction: operation => db.runTransaction(operation),
    now: () => Date.now(),
});

exports.main = async event => submit(event, cloud.getWXContext().OPENID);
