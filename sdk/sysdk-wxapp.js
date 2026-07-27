let confArr = ['./sysdk-conf', 'APP_ID', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=login', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=reportRoleInfo', '1007.2.2', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=canPay', 'GAME_KEY', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=setTunnelClick', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=getMaterials', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=reportShare', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=reportClick', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=descMidasCoin', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=send_tpl_msg', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=get_box_list', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=open_box', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=click_box', 'wss://ws.docater1.cn', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=getOpenClipboard', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=getDealPackageInfo', 'https://docater1.cn/index.php?g=Wap&m=WxSecCheck&a=msgSecCheck', 'https://docater1.cn/index.php?g=Wap&m=WxSecCheck&a=imgSecCheck', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=getGameShareCardData', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=reportMidasErrorInfo', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=getBoxCheckoutCode', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=getUserPopupConfig', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=reportClickPopup', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=roleLogout', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=uploadCasualAction', 'https://docater1.cn/index.php?g=Wap&m=WxSecCheck&a=checkShieldWords', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=getGameShareCardDataV3', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=reportShareCardDataV3', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=wxDataDecrypt', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=getGameUserPhoneNumber', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=getReportOrderInfo', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=postBackCallback', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=reportWxClientCallbackLog', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=sdkAndroidPayGetOrderData', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=checkSessionKey', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=updateSessionKey', 'https://docater1.cn/index.php?g=Wap&m=MiniGame&a=getSpecifyShareData'];

const SY_CONF = require(confArr[0]);
const { SDK } = require('./wxsdk/index.js');
const SY_PACKAGE_GUIDE_ENABLED = SY_CONF.SY_PACKAGE_GUIDE_ENABLED === true;

function shouldSkipWxSdkBootstrap() {
  const wxRef = typeof wx !== 'undefined' ? wx : globalThis.wx;
  return !wxRef;
}

function createSyLoginError(stage, message, code) {
  const error = new Error('[SySDK login][' + stage + '] ' + message);
  error.stage = stage;
  if (typeof code !== 'undefined') error.code = code;
  return error;
}

const dnRemoteOutcomeCache = Object.create(null);
const dnRemoteOutcomeKeys = [];

function sanitizeDnText(value, maxLength) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').slice(0, maxLength);
}

function bindDnIdentitySafely(data) {
  const sygame = globalThis.Sygame;
  if (!sygame || typeof sygame.wxSdkCallbackBusiness !== 'function') {
    return false;
  }
  try {
    return sygame.wxSdkCallbackBusiness('login', data) === true;
  } catch (error) {
    const message = sanitizeDnText(error && error.message || 'DataNexus identity binding failed', 160);
    console.error('[DN SDK] 身份绑定异常:', message);
    if (typeof sygame.reportWxClientCallbackLog === 'function') {
      sygame.reportWxClientCallbackLog(
        'setOpenId',
        { stage: 'local_identity', succeeded: false, code: -999, message: message },
        { includeOpenId: false },
      );
    }
    return false;
  }
}

function applySyLoginIdentity(responseData) {
  if (typeof responseData.openid !== 'string' || !responseData.openid) {
    const message = responseData.code == 3001
      ? '3001 已被客户端阻断，但登录响应缺少 OpenID'
      : '登录成功但缺少 OpenID';
    throw createSyLoginError('backend_invalid_response', message, responseData.code);
  }
  Sygame.openid = responseData.openid;
  Sygame.real_openid = responseData.real_openid;
  Sygame.session_key = responseData.session_key;
  Sygame.jumpVersion = SY_PACKAGE_GUIDE_ENABLED ? responseData.jump_version : 0;
  const androidPayConf = responseData.androidPayConf || {};
  Sygame.androidPayType = androidPayConf.is_open_service_deduct || 0;
  Sygame.androidPayLoopCallback = androidPayConf.is_open_client_loop || 0;
  bindDnIdentitySafely(responseData);
}

function createSyPackageGuideBlockedResult(action) {
  return {
    blocked: true,
    action: action,
    reason: 'client_package_guide_disabled',
  };
}

function handleDnReportOutcome(response, requestData) {
  const result = response && typeof response === 'object' ? response : {};
  const callbackData = result.data && typeof result.data === 'object'
    ? result.data
    : requestData && typeof requestData === 'object'
      ? requestData
      : {};
  const actions = Array.isArray(callbackData.actions) ? callbackData.actions : [];
  const codeValue = Number(result.code);
  const code = Number.isFinite(codeValue) ? codeValue : -999;
  const actionTypes = [];
  const actionIds = [];
  actions.forEach((action) => {
    const actionType = sanitizeDnText(action && action.action_type, 64);
    if (actionType && actionTypes.indexOf(actionType) < 0 && actionTypes.length < 20) {
      actionTypes.push(actionType);
    }
    if (action && action.action_id) actionIds.push(String(action.action_id));
  });
  const traceId = sanitizeDnText(result.trace_id, 96);
  const dedupeKey = [code, traceId, actionIds.join(',')].join('|');
  const now = Date.now();
  if (dnRemoteOutcomeCache[dedupeKey] && now - dnRemoteOutcomeCache[dedupeKey] < 3000) {
    return;
  }
  if (!dnRemoteOutcomeCache[dedupeKey]) {
    dnRemoteOutcomeKeys.push(dedupeKey);
  }
  dnRemoteOutcomeCache[dedupeKey] = now;
  if (dnRemoteOutcomeKeys.length > 100) {
    delete dnRemoteOutcomeCache[dnRemoteOutcomeKeys.shift()];
  }
  const summary = {
    stage: 'remote_response',
    accepted: code === 0,
    code: code,
    message: sanitizeDnText(result.message, 160),
    traceId: traceId,
    actionCount: actions.length,
    actionTypes: actionTypes,
  };
  const sygame = globalThis.Sygame;
  if (sygame && typeof sygame.reportWxClientCallbackLog === 'function') {
    sygame.reportWxClientCallbackLog(
      code === 0 ? 'dnReportAccepted' : 'dnReportRejected',
      summary,
      { includeOpenId: false },
    );
  }
  if (code !== 0) {
    console.error('[DN SDK] 远端上报未被接收:', summary);
  }
}

function getWxSdkConfig() {
  const dataSourceId = Number(SY_CONF.DN_DATA_SOURCE_ID);
  const secretKey = String(SY_CONF.DN_SECRET_KEY || '');
  if (!Number.isInteger(dataSourceId) || dataSourceId <= 0) {
    throw new Error('[DN SDK] DN_DATA_SOURCE_ID 必须为正整数');
  }
  if (secretKey.length !== 32) {
    throw new Error('[DN SDK] DN_SECRET_KEY 必须为 32 位字符串');
  }
  if (typeof SY_CONF.APP_ID !== 'string' || !/^wx[0-9a-f]{16}$/i.test(SY_CONF.APP_ID)) {
    throw new Error('[DN SDK] APP_ID 格式无效');
  }
  return {
    user_action_set_id: dataSourceId,
    secret_key: secretKey,
    appid: SY_CONF.APP_ID,
    on_report_complete: handleDnReportOutcome,
    on_report_fail: handleDnReportOutcome,
  };
}

function bootstrapWxSdk() {
  if (shouldSkipWxSdkBootstrap()) {
    return { sdk: '', initResult: null };
  }
  const wxRef = typeof wx !== 'undefined' ? wx : globalThis.wx;
  const requiredApis = ['request', 'login', 'createCanvas'];
  const missingApis = requiredApis.filter((api) => typeof wxRef[api] !== 'function');
  if (missingApis.length) {
    throw new Error('[DN SDK] 微信运行时缺少必要 API: ' + missingApis.join(', '));
  }
  const sdk = new SDK(getWxSdkConfig());
  const initResult = sdk.getInitResult();
  if (!initResult || initResult.inited !== true) {
    const detail = initResult && initResult.initErrMsg ? ': ' + initResult.initErrMsg : '';
    throw new Error('[DN SDK] 初始化失败' + detail);
  }
  return { sdk, initResult };
}

const wxSdkBootstrap = bootstrapWxSdk();

const Sygame = {
  // 初始化
  appid: '',
  app_version: confArr[4],
  openid: '',
  real_openid: '',
  share_data: {},
  clipboard: '',
  role_id: 0, //角色id
  role_name: '',   //角色名称
  server_id: '',    //区服id
  server_name: '',    //区服名称
  commitIdStatus: false,
  popupNumber: 0,
  popupStatus: false,
  popupData: {},
  userBrand: '',
  userBrandModel: '',
  channel: '',
  // 分享卡片参数
  share_card_data: {},//V2
  shareCardDataV3: {},//V3
  specifyShareData: {},//指定分享数据
  isGetSpecifyShareData: 0,//是否获取指定分享数据
  adunitid: '', // 激励视频广告ID
  rewardVideo: null, // 激励视频广告
  wxSdk: wxSdkBootstrap.sdk,
  wxSdkInitResult: wxSdkBootstrap.initResult,
  isOpenWxCallback: false,
  dnOrderPollingStarted: false,
  dnFavoritesListenerStarted: false,
  shareListenersStarted: false,
  androidPayType: 0,//0客户端扣款、1服务端扣款
  androidPayLoopCallback: 0,
  init: (data) => {
    Sygame.appid = SY_CONF[confArr[1]];
    Sygame.query = data.query;
    Sygame.channel = SY_CONF[confArr[6]];
    Sygame.offerId = SY_CONF['offerId'];
    Sygame.scene = data.scene;
    Sygame.commit_id = SY_CONF['commitId'];
    Sygame.touchNumber = 0;
    Sygame.jumpVersion = 0;
    console.log('syInit:', {
      appid: Sygame.appid,
      app_version: Sygame.app_version,
      scene: Sygame.scene,
    });
    let queryData = {
      query: data.query
    };
    //用户通过分享卡片进入游戏上报:V3
    if (Sygame.query.sySharePicId) {
      Sygame.reportShareCardDataV3(2, Sygame.query.sySharePicId)
    }
    //获取该游戏是否开启获取剪切板功能
    wx.request({
      url: confArr[17],
      data: {appid: Sygame.appid},
      method: 'POST',
      success: (res) => {
        Sygame.adunitid = res.data.adunitid;
        console.log('getIsOpenClipboard:', res);
        if (res.data.is_open_clipboard) {
          //获取剪切板内的信息
          wx.getClipboardData({
            success (res){
              if( res.data ){
                Sygame.clipboard = res.data;
              }
              console.log("syGetClipboardData:", res);
            }
          })
        }
        // +1 click
        wx.request({
          url: confArr[7],
          data: queryData,
          method: "POST",
          success: (res) => {
            console.log('syClickRequest:', res);
          }
        });
      }
    });
    //get share conf：V1
    Sygame.getShareData();
    wx.showShareMenu();
    Sygame.getCommitIdStatus();
    // get phone model
    wx.getSystemInfo({
      success (res) {
        Sygame.userBrand = res.brand;
        Sygame.userBrandModel = res.model;
      }
    });
    // get the sharing card parameter info
    Sygame.getShareCardInfo();//V2
    Sygame.getShareCardInfoV3();//V3
  },
  // game login
  syLogin: () =>  new Promise(function (resolve, reject) {
    // login request
    wx.login({
      success(res) {
        console.log('syLoginCode:', { hasCode: !!res.code });
        Sygame.listenShareAction();//分享
        if (!res.code) {
          reject(createSyLoginError('wx_login_no_code', 'wx.login 未返回 code'));
          return;
        }
        // get openId and userinfo from server
        let url = confArr[2];
        wx.request({
          url: url,
          timeout: 10000,
          data: {
            code: res.code,
            appid: Sygame.appid,
            version: Sygame.app_version,
            query: Sygame.query,
            scene: Sygame.scene,
            channel: Sygame.channel,
            clipboard: Sygame.clipboard,
          },
          success(ret) {
            const responseData = ret && ret.data;
            if (!responseData || typeof responseData !== 'object') {
              reject(createSyLoginError('backend_invalid_response', '登录接口返回格式无效'));
              return;
            }
            console.log('syLogin:', {
              code: responseData.code,
              hasOpenid: !!responseData.openid,
              wxSdkCallbackEnabled: !!(responseData.wxSdkCallbackData && responseData.wxSdkCallbackData.isOpenWxSdkCallback),
            });
            if (responseData.code == 1001) {
              try {
                applySyLoginIdentity(responseData);
              } catch (error) {
                reject(error);
                return;
              }
              try {
                if (responseData.isOpenGetMobile === true) {
                  Sygame.syGetPhoneNumber();
                }
                //获取指定分享数据
                Sygame.isGetSpecifyShareData = responseData.isGetSpecifyShareData;
                Sygame.getSpecifyShareData();
              } catch (error) {
                console.error(
                  '[SySDK login] 登录后附加功能初始化失败:',
                  sanitizeDnText(error && error.message, 160),
                );
              }
              resolve(responseData);
            } else if (responseData.code == 3001) {
              if (!SY_PACKAGE_GUIDE_ENABLED) {
                try {
                  applySyLoginIdentity(responseData);
                } catch (error) {
                  reject(error);
                  return;
                }
                console.warn('[SySDK login] 3001 导包已被客户端策略阻断');
                resolve(Object.assign({}, responseData, {
                  code: 1001,
                  jump_version: 0,
                }));
                return;
              }
              var showCancelType = true
              var loginInfo = 0
              if (responseData.jump_mandatory == 1){
                showCancelType = false
              } else {
                var loginKey = 'loginClickCancle' + responseData.openid
                loginInfo = Sygame.cookieData({ type: 'get', 'key': loginKey })
                if (responseData.jump_mandatory_number > 0 && loginInfo >= responseData.jump_mandatory_number) {
                  var data = []
                  data.code = 1001
                  data.openid = responseData.openid
                  data.real_openid = responseData.real_openid
                  data.package_original_game_key = responseData.package_original_game_key
                  Sygame.openid = responseData.openid
                  Sygame.real_openid = responseData.real_openid
                  bindDnIdentitySafely(responseData);
                  resolve(data);
                  return;
                }
              }
              try {
                Promise.resolve(Sygame.syPackageShow(ret, 1, showCancelType)).then(
                  resolve,
                  (error) => reject(createSyLoginError(
                    'package_flow_failed',
                    sanitizeDnText(error && error.message || '导包流程失败', 120),
                  )),
                );
              } catch (error) {
                reject(createSyLoginError(
                  'package_flow_failed',
                  sanitizeDnText(error && error.message || '导包流程失败', 120),
                ));
              }
            } else if(responseData.code == 5001) {
              reject(createSyLoginError('maintenance', '游戏维护中', responseData.code));
              wx.showModal({
                title: '游戏提示',
                content: responseData.game_tip? responseData.game_tip: "游戏维护中，请稍后再试",
                confirmText: '确认',
                showCancel: false,
                success: () => {
                  console.log('syLogin5001', { code: responseData.code });
                }
              })
              wx.onTouchStart(() => {
                wx.showModal({
                  title: '游戏提示',
                  content: responseData.game_tip? responseData.game_tip: "游戏维护中，请稍后再试",
                  confirmText: '确认',
                  showCancel: false,
                  success: () => {
                    console.log('syLogin5001', { code: responseData.code });
                  }
                })
              });
            } else {
              reject(createSyLoginError('backend_rejected', '登录接口拒绝请求', responseData.code));
            }
          },
          fail(ret) {
            reject(createSyLoginError(
              'backend_request_failed',
              sanitizeDnText(ret && ret.errMsg || '登录接口请求失败', 120),
              ret && ret.errno,
            ));
          }
        })
      },
      fail: function(ret) {
        reject(createSyLoginError(
          'wx_login_failed',
          sanitizeDnText(ret && ret.errMsg || 'wx.login 调用失败', 120),
          ret && ret.errno,
        ));
      }
    })
  }),

  // create role, enter the game, user upgrade interfaces
  syReportRoleInfo: (data) => new Promise(function(resolve, reject) {
    if (typeof data === 'object') {
      let url = confArr[3];
      if(data.role_id && typeof data.role_id !=='undefined') Sygame.role_id = data.role_id;
      if(data.role_name && typeof data.role_name !=='undefined') Sygame.role_name = data.role_name;
      if(data.server_id && typeof data.server_id !=='undefined') Sygame.server_id = data.server_id;
      if(data.server_name && typeof data.server_name !=='undefined') Sygame.server_name = data.server_name;
      data.wecha_id = Sygame.openid;
      data.real_openid = Sygame.real_openid;
      data.channel = Sygame.channel;
      data.query = Sygame.query;
      data.scene = Sygame.scene;
      data.appid = Sygame.appid;
      data.version = Sygame.app_version;
      data.brand = Sygame.userBrand;
      data.model = Sygame.userBrandModel;
      console.log('syReportRoleParams', data);
      wx.request({
        url: url,
        data: data,
        method: "POST",
        success: (res) => {
          console.log("syReportRoleInfo:", res);
          resolve(res.data);
          if (!Sygame.popupNumber) {
            Sygame.popupNumber++;
            Sygame.newUserPopupFunc(data);
          }
          // enter the dialog of the big R adding customer service 
          if (res.data.bigrInfo) {
            Sygame.bigrAddKfTip(res.data.bigrInfo);
          }
          // enter the dialog box of adding enterprise wechat group
          if (res.data.wechatGroupInfo) {
            Sygame.wechatGroupFuc(res.data.wechatGroupInfo);
          }
          //处理回传逻辑
          Sygame.wxSdkCallbackBusiness('role', res.data);
        },
      })
    }else {
      return '参数格式不正确';
    }
  }),
  // order and pay
  syPay: (data) => new Promise(function(resolve, reject) {
    // dialog before pay
    Sygame.popupPayFunc(0).then(() => {
      // the jumpVersion existence means new version of guide package, and the guide package condition is obtained before payment
      if (Sygame.jumpVersion) {
        // is sure guide package, but not guided in
        if (Sygame.touchNumber > 0) {
          return false;
        }
        // get the guide package info
        Sygame.syPackageJump().then(() => {
          Sygame.syRealPay(data, resolve, reject);
        })
      } else {
        Sygame.syRealPay(data, resolve, reject);
      }
    })
  }),

  // real pay function
  syRealPay : (data, resolve, reject) => {
    let url = confArr[5];
    if (typeof data == 'object') {
      data.openid = Sygame.openid;
      data.real_openid = Sygame.real_openid;
      data.appid = Sygame.appid;
      data.channel = Sygame.channel;
      data.version = Sygame.app_version;
      data.is_buckle_pay = 0;
      console.log('syPayParams', data);
      wx.request({
        url: url,
        method: 'POST',
        data: data,
        success: function (res) {
          console.log("syPay:", res);
          // Get Midas payment ratio
          data.midasPayProportion = res.data.midasPayProportion;
          // payment configuration in backstage
          switch(res.data.payType) {
            case "1":
              //米大师支付检测sessionKey
              Sygame.checkSessionKey().then((checkRes) => {
                console.log('检测sessionKey完毕', checkRes);
                if (Sygame.androidPayType === 1) {
                  Sygame.syMidasPay(data, resolve, reject);
                  return;
                }
                //master MI balance
                if( res.data.can_use_balance == 1 ){
                  wx.showModal({
                    title: '支付确认',
                    content: res.data.midas_pay_tip,
                    confirmText: '确认',
                    showCancel: '取消',
                    success: (ret) => {
                      if (ret.confirm) {
                        data.is_buckle_pay = 1;
                        Sygame.syDescMidasCoin(data);
                      }
                      else {
                        console.log('用户点击取消');
                        Sygame.syMidasPay(data, resolve, reject);
                      }
                    }
                  });
                }
                else {
                  Sygame.syMidasPay(data, resolve, reject);
                }
              }).catch((err) =>{
                console.log('检测sessionKey异常且更新失败', err);
              })
              break;
            case "2":
              wx.showModal({
                title: '充值教程',
                content: "即将跳转官方【客服会话】充值， \n给客服回复“1”获取充值链接",
                confirmText: '客服充值',
                showCancel: false,
                success: (ret) => {
                  if (ret.confirm) {
                    wx.openCustomerServiceConversation({
                      sessionFrom: 'h5Game_' + res.data.payId,
                      showMessageCard: true,
                      sendMessageImg: 'http://wx.11babay.cn/uploads/q/qqwxa1569404944/5/3/9/f/5e1d951409066.png',
                      success: () => {
                        console.log('success');
                      }
                    })
                  }
                }
              });
              break;
            case "3":
              // get qrcode of payment
              wx.previewImage({
                urls: [res.data.payImage]
              });
              // qrcode
              break;
            case "4":
              // jump to miniprogaram for payment
              wx.navigateToMiniProgram({
                appId: res.data.iosJumpToAppid,
                path: res.data.iosJumpToAppidParams,
                success: () => {
                  console.log('syJumpPay:success');
                },
                fail: () => {
                  console.log('syJumpPay:fail');
                },
              })
              break;
          }
        }
      })
    } else {
      reject('data is not obj');
    }
  },

  // notify master MI to deduct the balance
  syDescMidasCoin: (data) => {
    wx.request({
      url: confArr[11],
      data: data,
      method: 'POST',
      dataType: 'json',
      success: function (res) {
        console.log( 'syDescMidasCoin:', res );
        wx.showModal({
          title: '提示',
          content: res.data.tip,
          confirmText: '确认',
          showCancel: '取消',
          success: (ret) => {
            if (ret.confirm) {

            }
          }
        });
        if (res.data.status === 1001) {
          //处理回传逻辑
          Sygame.wxSdkCallbackBusiness('pay', res.data);
        }
      },
      fail: function (e) {
        console.log("请求失败", e)
      }
    })
  },

  syMidasPay: (data, resolve, reject) => {
    wx.requestMidasPayment({
      mode:'game',
      env:0,
      offerId: Sygame.offerId,
      currencyType:'CNY',
      buyQuantity: data.product_price*data.midasPayProportion,
      platform: 'android',
      zoneId: 1,
      outTradeNo: data.order_id,
      success (res) {
        console.log("syMidasPay:", res);
        if (Sygame.androidPayType === 1) {
          Sygame.sdkGetOrderData(data);
          return;
        }
        Sygame.syDescMidasCoin(data);
        console.log("syMidasDescPayFinish:");
        // pay success
        Sygame.popupPayFunc(data.product_price);
      },
      fail (res) {
        // failed to report error information, cancel payment donot report
        if (res.errCode != 1) {
          Sygame.syReportMidasErrorInfo(res, data);
        }
        reject({syPayErrMsg: 'requestMidasPayment支付取消', 'errCode': res.errCode, 'errMsg': res.errMsg});
        console.log(res)
      },
      complete (res) {
        console.log(res)
      }
    })
  },

  // report master MI errror information
  syReportMidasErrorInfo: function(info, payInfo){
    wx.request({
      url: confArr[22],
      data: {
        'appid': Sygame.appid,
        'info': JSON.stringify(info),
        'openid': Sygame.openid,
        'real_openid': Sygame.real_openid,
        'pay_info': payInfo
      },
      method: 'POST',
      success: (ret) => {
        console.log("report Midas error info success", ret);
      }
    })
  },

  sdkGetOrderData: (data) => {
    //轮循订单回调时，不走该方法
    if (Sygame.androidPayLoopCallback === 1) {
      console.log("安卓客户端轮询回调中，禁止单独查询订单：", Sygame.androidPayLoopCallback);
      return;
    }
    wx.request({
      url: confArr[36],
      data: {
        'appid': Sygame.appid,
        'channel': Sygame.channel,
        'openid': Sygame.openid,
        'orderid': data.order_id,
      },
      method: 'POST',
      success: (res) => {
        console.log("安卓客户端单笔回传订单查询：", res);
        if (res.data.status == 1001) {
          Sygame.wxSdkCallbackBusiness('pay', res.data);//回传
        }
      }
    })
  },

  // bind the phone
  syBindMobile: (data) => new Promise(function(reslove, reject) {
    let channel = Sygame.channel;
    let openid = Sygame.openid;
    wx.openCustomerServiceConversation({
      sessionFrom: 'WxaBind_'+ openid,
      success: () => {
        console.log('syBindMobile:success');
      }
    })
  }),

  // get jump infomation of the guide package 
  syPackageJump: () => {
    if (!SY_PACKAGE_GUIDE_ENABLED) {
      return Promise.resolve(createSyPackageGuideBlockedResult('syPackageJump'));
    }
    return new Promise(function (resolve, reject){
      wx.request({
        url: confArr[18],
        data: {
          'appid': Sygame.appid,
          'openid': Sygame.openid,
          'real_openid': Sygame.real_openid
        },
        method: 'POST',
        success: (ret) => {
          console.log("packageInfo", ret);
          if (ret.data.status == 1001) {
            resolve(true)
          } else {
            var showCancelType = true;
            if (ret.data.jump_mandatory == 1){
              showCancelType = false
            }
            resolve(Sygame.syPackageShow(ret, 0, showCancelType))
          }
        }
      })
    })
  },

  /**
   * separate the dialog of guide package, to avoid code duplication in the old and new ways
   * ret: the parameter infomation of guide package
   * jumpType: jump way（1 the old way, repeatedly calling ontouch event；0 the new waay, calling ontouch event only one time）
   * showCancelType: whether the cancel button of showModel function is displayed
   */
  syPackageShow: (ret, jumpType, showCancelType) => {
    if (!SY_PACKAGE_GUIDE_ENABLED) {
      return Promise.resolve(createSyPackageGuideBlockedResult('syPackageShow'));
    }
    return new Promise(function (resolve, reject) {
      wx.showModal({
        title: ret.data.jump_title_tip? ret.data.jump_title_tip: '跳转提示',
        content: ret.data.jump_tip ? ret.data.jump_tip.replace(/\\n/g,'\n') : "即将跳转",
        confirmText: ret.data.jump_button_tip? ret.data.jump_button_tip : '确认',
        cancelText: ret.data.jump_cancel_tip? ret.data.jump_cancel_tip: '取消',
        showCancel: showCancelType,
        success: ( res ) => {
          // clicking the cancel button can get useinfo and go into the game（only the old way usage）
          if(showCancelType && res.cancel && jumpType){
            var data = []
            data.code = 1001
            data.openid = ret.data.openid
            data.real_openid = ret.data.real_openid
            data.package_original_game_key = ret.data.package_original_game_key
            Sygame.openid = ret.data.openid
            Sygame.real_openid = ret.data.real_openid
            bindDnIdentitySafely(ret.data);
            // click to cancel
            if (ret.data.jump_mandatory_number > 0) {
              var time = new Date(new Date().toLocaleDateString()).getTime()+3600*24*1000
              var loginKey = 'loginClickCancle' + ret.data.openid
              var loginInfo = Number(Sygame.cookieData({ type: 'get', 'key': loginKey })) || 0
              Sygame.cookieData({ type: 'set', key: loginKey, data: loginInfo+1, expired_at: time })
            }
            resolve(data);
          } else if (showCancelType && res.cancel){
            // the new way always can pay when clicking the cancel button
            resolve(true);
          } else {
            Sygame.touchNumber += 1;
            if (ret.data.jump_copy || ret.data.jump_copy_apk) {
              Sygame.syDealJumpData(ret);
            } else {
              wx.onTouchStart(() => {
                Sygame.syDealJumpData(ret);
              });
            }
          }
        }
      });
    });
  },

  // Encapsulate the specific jump method of the guide package, 
  // so that whether it is an onTouch event or multiple onTouch events, we can use onTouch when calling externally to prevent code duplication 
  syDealJumpData: (ret) => {
    if (!SY_PACKAGE_GUIDE_ENABLED) {
      return Promise.resolve(createSyPackageGuideBlockedResult('syDealJumpData'));
    }
    return new Promise(function (resolve, reject) {
      if (ret.data.jump_to) {
        wx.navigateToMiniProgram({
          appId: ret.data.jump_to,
          path: ret.data.jump_path,
          // envVersion: "trial",
          success: () => {
            console.log('syForceJump:success');
          }
        })
      }
      else if (ret.data.jump_img) {
        // get qrcode
        if (ret.data.jump_code_description) {
          Sygame.showCanvasImage(ret.data.jump_img, ret.data.jump_code_description);
        } else {
          wx.previewImage({
            urls: [ret.data.jump_img]
          });
        }
      }
      else if(ret.data.jump_copy) {
        wx.setClipboardData({
          data: ret.data.jump_copy,
          success(res) {
            console.log('syCopy', ret.data) // data
          }
        });
        wx.onTouchStart(() => {
          wx.showModal({
            title: '跳转提示',
            content: ret.data.jump_tip? ret.data.jump_tip: "即将跳转",
            confirmText: '确认',
            showCancel: false,
            success: () => {
              wx.setClipboardData({
                data: ret.data.jump_copy,
                success(res) {
                  console.log('syCopy', ret.data) // data
                }
              });
            }
          })
        });
      }
      else if(ret.data.jump_copy_apk) {
        wx.setClipboardData({
          data: ret.data.jump_copy_apk,
          success(res) {
            console.log('syCopy', ret.data) // data
          }
        });
        wx.onTouchStart(() => {
          wx.openCustomerServiceConversation({
            sessionFrom: 'h5GameJumpApk_' + Sygame.appid,
            showMessageCard: true,
            sendMessageImg: 'http://wx.11babay.cn/uploads/s/sqcsh1458897586/7/2/d/5/60cab7d766dfa.jpeg',
            success: () => {
              console.log('success');
            }
          })
        });
      }
    });
  },

  // call up the client-side minigame subscription message interface
  syGetSubscribe: (data) => new Promise(function(reslove, reject) {
    if (typeof data.template === 'string') {
      data.template = [data.template];
    }
    wx.requestSubscribeMessage({
      tmplIds: data.template,
      success: (res) => {
        console.log('syGetSubscribe: ', res)
        let type = 'cancel';
        for (let obj of data.template) {
          if (res[obj] === 'accept') {
            type = 'confirm';break;
          }
        }
        wx.request({
          url: confArr[12],
          data: {
            "openid":Sygame.openid,
            "channel":Sygame.channel,
            "role_id":data.role_id,
            "tpl_type":data.tpl_type,
            "template":data.template,
            "type": type
          },
          method: 'POST',
          dataType: 'json',
          success: function (res) {
            reslove(res);
          },
          fail: function (e) {
            console.log("请求失败", e)
          }
        })
      },
      fail(err) {
        //失败
        console.error(err);
        reject()
      }
    })
 }),

  // 微信消息内容检测
  syMsgSecCheck: (data) => new Promise(function (reslove, reject) {
    data.appId  = Sygame.appid;
    data.openId = Sygame.real_openid;
    wx.request({
      url: confArr[19],
      data: data,
      method: "POST",
      success: (res) => {
      console.log('消息检测成功', res);
      reslove(res.data)
    },
      fail: (res) => {
        console.error(res);
        reject();
      }
    })
  }),

  // 微信图片内容检测
  syImgSecCheck: (data) => new Promise(function (reslove, reject) {
    wx.uploadFile({
      url: confArr[20],
      //小程序本地的路径
      filePath: data,
      //后台获取我们图片的key
      name: 'images',
      formData: {
        appId: Sygame.appid
      },
      success: function (res) {
        console.log('检测图片成功', res);
        reslove(res.data)
      },
      fail: function (res) {
        console.error(res);
        reject();
      },
    })
  }),

  // 屏蔽词检测
  syCheckShieldWords: (word) => new Promise(function (reslove, reject) {
    wx.request({
      url: confArr[28],
      data: {
        "channel":Sygame.channel,
        "openid":Sygame.openid,
        "content":word,
      },
      method: "POST",
      success: (res) => {
        console.log('屏蔽词检测结果', res);
        reslove(res.data)
      },
      fail: (res) => {
        console.error(res);
        reject();
      }
    })
  }),

  // 初始化获取分享卡片参数信息
  getShareCardInfo: () => {
    wx.request({
      url: confArr[21],
      data: {
        appid: Sygame.appid
      },
      method: "POST",
      success: (res) => {
        console.log('分享卡片参数信息V2', res);
        if (res.data.status == 1001) {
          // 赋值卡片信息
          Sygame.share_card_data = res.data.data;
        }
      },
      fail: (res) => {
        console.error(res);
      }
    })
  },

  // 初始化获取分享卡片参数信息:V3
  getShareCardInfoV3: () => {
    wx.request({
      url: confArr[29],
      data: {
        appid: Sygame.appid
      },
      method: "POST",
      success: (res) => {
        console.log('获取分享卡片参数信息V3', res);
        if (res.data.status == 1001) {
          Sygame.shareCardDataV3 = res.data.data;
        }
      },
      fail: (res) => {
        console.error(res);
      }
    })
  },

  // 分享卡片V3参数：根据权重随机获取
  shareCardV3Params: () => {
    if (Object.keys(Sygame.specifyShareData).length > 0) {
      let selectCard = Sygame.specifyShareData;
      console.log('指定用户分享内容', selectCard);
      return selectCard;
    }
    const array = Sygame.shareCardDataV3;
    if (array.length == undefined || array.length < 1) {
      console.log('根据权重分配分享卡片V3', {})
      return {};
    }
    let selectCard = array[0];

    //根据不同的权重返回信息
    const totalWeight  = array.reduce((acc, item) => acc + item.weight, 0);
    const randomNumber = Math.floor(Math.random() * totalWeight) + 1;
    let currentWeight  = 0;
    for (let i = 0; i < array.length; i++) {
      currentWeight += array[i].weight;
      if (randomNumber <= currentWeight) {
        selectCard = array[i];
        break;
      }
    }
    console.log('根据权重分配分享卡片V3', selectCard)
    //上报数据
    if (selectCard.query && selectCard.query.includes('sySharePicId')) {
      Sygame.reportShareCardDataV3(1, selectCard.id)
    }
    return selectCard;
  },

  //上报分享卡片操作类型V3
  reportShareCardDataV3: (reportType, sySharePicId) => {
    let data = {
      appid: Sygame.appid,
      sySharePicId: sySharePicId,
      reportType: reportType,
    };
    console.log('上报分享卡片操作数据V3:data', data);
    wx.request({
      url: confArr[30],
      data: data,
      method: "POST",
      success: (res) => {
        console.log('上报分享卡片操作数据V3:result', res);
      },
      fail: (res) => {
        console.error(res);
      }
    })
  },

  // 监听分享
  listenShareAction: () => {
    if (Sygame.shareListenersStarted) {
      return;
    }
    Sygame.shareListenersStarted = true;
    wx.onShareAppMessage(() => {
      var shareData = Sygame.shareCardV3Params();
      console.log("sy分享数据:", shareData);
      var data = {
        title: shareData.title,
        imageUrl: shareData.image,
        imageUrlId: shareData.imageUrlId,
        query: shareData.query,
      };
      if (Sygame.isDnQueueReady()) {
        console.log('监听到分享行为并上报回传');
        const shareResult = Sygame.wxSdk.track('SHARE', {target: 'APP_MESSAGE'});
        Sygame.reportDnQueueResult('share1', shareResult);
      }
      return data;
    });

    // 2、分享到朋友圈
    wx.onShareTimeline(() => {
      if (Sygame.isDnQueueReady()) {
        console.log('监听到右上角分享朋友圈行为并上报回传');
        const shareResult = Sygame.wxSdk.track('SHARE', {target: 'TIME_LINE'});
        Sygame.reportDnQueueResult('share2', shareResult);
      }
    });
  },
  
  /**
   * 获取侧边栏盒子列表
   */
  syGetBoxList: (data) => new Promise(function(reslove, reject) {
    wx.request({
      url: confArr[13],
      data: {
        "wecha_id":Sygame.openid,
        "appid":Sygame.appid,
        "page":data.page,
        "count":data.count,
      },
      method: 'POST',
      dataType: 'json',
      success: function (res) {
        console.log("盒子", res)
        reslove(res);
      },
      fail: function (e) {
        console.log("请求失败", e)
      }
    })
  }),

  /**
   * 用户点击展开盒子事件上报
   */
  syClickOpenBox: () => new Promise(function(reslove, reject) {
    // 判断用户是否点击
    var clickOpenBox = 'clickOpenBox' + Sygame.openid
    var isClick = Sygame.cookieData({ type: 'get', 'key': clickOpenBox })
    var uv = isClick? 0: 1;
    wx.request({
      url: confArr[14],
      data: {
        "wecha_id":Sygame.openid,
        "appid":Sygame.appid,
        "uv": uv
      },
      method: 'POST',
      dataType: 'json',
      success: function (res) {
        if (uv == 1) {
          Sygame.cookieData({ type: 'set', key: clickOpenBox, data: 1 })
        }
        console.log("展开盒子事件上报", res.data)
        reslove(res.data);
      },
      fail: function (e) {
        console.log("请求失败", e)
      }
    })
  }),

  /**
   * 用户点击盒子内游戏事件上报
   */
  syClickBox: (data) => new Promise(function(reslove, reject) {
    // 判断用户是否点击
    var clickBox = 'clickBox' + data.game_id
    var isClick = Sygame.cookieData({ type: 'get', 'key': clickBox })
    var uv = isClick? 0: 1;
    wx.request({
      url: confArr[15],
      data: {
        "wecha_id":Sygame.openid,
        "appid":Sygame.appid,
        "uv":uv,
        "game_id":data.game_id,
        "tunnel_id":data.tunnel_id,
        "jump_appid":data.jump_appid,
        "jump_path":data.jump_path
      },
      method: 'POST',
      dataType: 'json',
      success: function (res) {
        if (uv == 1) {
          Sygame.cookieData({ type: 'set', key: clickBox, data: 1 })
        }
        console.log("点击盒子内游戏事件上报", res.data)
        reslove(res.data);
      },
      fail: function (e) {
        console.log("请求失败", e)
      }
    })
  }),

  /**
   * 获取分享参数
   * params参数由3部分构成
   */
  getShareData : (params) => {
    wx.request({
      url: confArr[8],
      data: { appid: Sygame.appid, channel: Sygame.channel },
      method: 'POST',
      dataType: 'json',
      success: function (res) {
        console.log("getShareDataV1:", res)
        if (res.data.status == 1001) {
          console.log("分享V1:", res.data.data);
          Sygame.share_data = res.data.data;
        } else {
          if (params) {
            params.errorCallback(res);
          }
          console.log("盛也share失败", res);
        }
      },
      fail: function (e) {
        console.log("请求失败", e)
      }
    })
  } ,

  /**
   * 分享
   * params参数由3部分构成
   * shareQuery---------入口参数
   */
  goShareData : (params) => {
    var shareData = Sygame.share_card_data;
    console.log("盛也SDK share数据", shareData);
    var data = {
      title: shareData.title,
      imageUrlId: shareData.imageUrlId,
      imageUrl: shareData.image,
      query: params.shareQuery+"&"+shareData.query
    }
    console.log("SDK分享:", shareData);
    wx.shareAppMessage(data);
  } ,

  /**
   * 上报分享
   * params.material_id-----素材的id
   * channel
   * appid
   * server_id----------(必填：否)所在区服
   * openid------------（必填，否）当前用户的openid
   * shareQuery--------（必填，否）用户的分享拼接字符串
   */
  upShareData: (params) => {
    var key = "sy_share_material:" + params.material_id;
    var log = Sygame.cookieData({ type: 'get', 'key': key })?1:0;//1-已记录，0-未记录
    if(log==0)Sygame.cookieData({ type: 'set', key: key, data: (new Date()).getTime()});
    params.log = log;
    wx.request({
      url: confArr[9],
      data: params,
      method: 'POST',
      dataType: 'json',
      success: function (res) {
        console.log(res)
      },
      fail: function (e) {
        console.log("请求失败", e)
      }
    })
  },

  /**
   * 上报点击
   * params.material_id-----素材的id
   * params.channel
   * params.appid
   * params.shareData---(必填：否)入口参数。
   */
  upClickData: (params) => {
    var key = "sy_click_material:" + params.material_id;
    var log = Sygame.cookieData({ type: 'get', 'key': key }) ? 1 : 0;//1-已记录，0-未记录
    if (log == 0) Sygame.cookieData({ type: 'set', key: key, data: (new Date()).getTime() });
    params.log = log;
    wx.request({
      url: confArr[10],
      data: params,
      method: 'POST',
      dataType: 'json',
      success: function (res) {
        console.log(res)
      },
      fail: function (e) {
        console.log("请求失败", e)
      }
    })
  },

  /**
   * 利用本地存储简单的记录
   * params有4个参数
   *
   * type---可选项，get，set，rm
   * key----键名
   * data---值
   * expired_at——————js的13位毫秒时间戳
   */
  cookieData : (params) => {
    switch(params.type){
      case 'get':
        var data = wx.getStorageSync(params.key)
        try{
          data = JSON.parse(data);
          if ((new Date()).getTime()<data.expired_at){
            return data.data;
          }
        }catch(e){}
        return false;
        break;
      case 'set':
        if(!params.expired_at){
          params.expired_at = new Date(new Date().toLocaleDateString()).getTime()+3600*24*1000*3650;
        }
        try {
          wx.setStorageSync(params.key, JSON.stringify({ data: params.data, expired_at: params.expired_at}))
          return true;
        } catch (e) {}
        return false;
        break;
      case 'rm':
        wx.removeStorageSync(params.key)
        return true;
        break;
    }
  },

  // 获取commitId状态
  getCommitIdStatus: () => {
    wx.request({
      url: confArr[23],
      data: {'commitId': Sygame.commit_id},
      method: 'POST',
      success: (ret) => {
        if (ret.data.popup_status == 4001) {
          Sygame.commitIdStatus = true
        } else {
          Sygame.commitIdStatus = false
        }
        console.log('getCommitIdStatus', Sygame.commitIdStatus);
      }
    })
  },
  // 新用户弹窗功能
  newUserPopupFunc:() => {
    if (Sygame.commitIdStatus == false) {
      return false
    }
    // 获取弹窗功能配置信息
    wx.request({
      url: confArr[24],
      data: {
        'appid': Sygame.appid,
        'openid': Sygame.openid,
        'realOpenid': Sygame.real_openid,
      },
      method: 'POST',
      success: (ret) => {
        if (ret.data.status == 4001) {
          Sygame.popupStatus = false;
          console.log('用户不满足条件，无法进入新用户7天计时')
          return false;
        }
        Sygame.popupStatus = true;
        Sygame.popupData = ret.data.data;
        console.log('进入新用户7天计时')
        // 计时
        window.timeInterval = setInterval(timing, 1000);
      }
    })

    // 进入游戏的时间
    var enterGameTime = 0;
    function timing(){
      // 进入游戏的时间大于倒计时剩余时间、或大于设定时间，则停止定时
      if (enterGameTime >= Sygame.popupData.remain_time) {
        Sygame.commitIdStatus = false;
        Sygame.popupStatus = false;
        clearInterval(window.timeInterval);
        return false;
      }
      if (enterGameTime > Sygame.popupData.popup_cycle) {
        clearInterval(window.timeInterval);
        return false;
      }
      // commtid状态、或 popup弹窗状态存在一个为false，则停止定时（因支付完成导致或者倒计时结束）
      if (Sygame.commitIdStatus == false || Sygame.popupStatus == false) {
        clearInterval(window.timeInterval);
        return false;
      }
      dealGamePopupData(enterGameTime, Sygame.popupData);
      enterGameTime++;
    }

    // 处理游戏数据
    function dealGamePopupData(enterGameTime, data) {
      // 是否是首次进入游戏，且达到固定时间
      if (data.is_first_login && (enterGameTime == data.first_popup_time)) {
        Sygame.reportClickThePopup(0, data.first_popup_cont)
      }
      // 是否在固定时间内，每间隔设定时间
      if (enterGameTime && (enterGameTime <= data.popup_cycle && (enterGameTime%data.popup_interval) == 0)) {
        Sygame.reportClickThePopup(1, data.first_popup_cont)
      }
    }
  },
  /**
   * 处理弹窗以及打点数据上报
   * @param type 弹窗类型
   * @param popupContent 弹窗内容
   */
  reportClickThePopup: (type, popupContent) => new Promise(function (resolve, reject) {
    if (!popupContent) return false;
    wx.showModal({
      title: '跳转提示',
      content: popupContent,
      confirmText: '确认',
      showCancel: false,
      success: () => {
        // 上报
        wx.request({
          url: confArr[25],
          data: {
            appid: Sygame.appid,
            openid: Sygame.openid,
            real_openid: Sygame.real_openid,
            roleid: Sygame.role_id,
            type: type
          },
          method: "POST",
          success: (ret) => {
              resolve();
          }
        })
      }
    })
  }),
  // 支付弹窗
  popupPayFunc: (payPrice) => new Promise(function (resolve, reject) {
    // commtId状态 和 popup弹窗状态不存在，则停止执行
    if (!Sygame.commitIdStatus || !Sygame.popupStatus) {
      resolve();
      return false;
    }
    if (payPrice == 0) {
      Sygame.reportClickThePopup(2, Sygame.popupData.pay_before).then(() => {
        resolve();
      })
    }
    // payPrice存在，则为支付成功
    if (payPrice) {
      clearInterval(window.timeInterval);
      Sygame.commitIdStatus = false;
      Sygame.popupStatus = false;
      resolve();
    }
    if (payPrice && Sygame.popupData.first_pay_price == payPrice) {
      Sygame.reportClickThePopup(3, Sygame.popupData.pay_after).then(() => {
        resolve();
      })
    }
  }),
//角色登出
  roleLogout: () => new Promise(function (resolve, reject) {
    wx.request({
      url: confArr[26],
      data: {
        appid: Sygame.appid,
        wecha_id: Sygame.openid,
        server_id: Sygame.server_id
      },
      method: "POST",
      success: (res) => {
        resolve(res);
      },
      fail: (ret) => {
        reject(ret);
      },
    })
  }),

  // 弹出大R加客服提醒
  bigrAddKfTip: (data) => {
    console.log('打印大R弹窗信息', data);
    // 判断开启状态以及弹窗提示是否存在
    if (data.add_kf_status && data.add_kf_tip) {
      var time = data.add_kf_time ? data.add_kf_time : 1;
      setTimeout(kfTipIng, time * 1000);
      // 定时
      function kfTipIng(){
        wx.showModal({
          title: '提示',
          content: data.add_kf_tip,
          confirmText: '知道了',
          showCancel: false,
          success: () => {
            // 跳转小程序加客服/判断客服二维码以及跳转小程序是否存在
            if (data.jump_exclusive_code && data.jump_exclusive_appid) {
              let path = `pages/index/index?wechatCodeurl=${encodeURIComponent(data.jump_exclusive_code)}`;
              if (data.jump_exclusive_instructions) {
                path += `&words=${data.jump_exclusive_instructions}`;
              }
              wx.navigateToMiniProgram({
                appId: data.jump_exclusive_appid,
                path: path,
                success() {
                  console.log('跳转成功')
                },
                fail(e){
                  console.log('跳转失败',e)
                }
              });
            }
          }
        })
      }
    }
  },

  // 用户分配微信群二维码信息
  wechatGroupFuc: (data) => {
    console.log('打印是否添加微信群信息：', data);
    if (data.tip && data.jump_status) {
      setTimeout(kfTipIng, data.jump_time * 1000);
      // 定时
      function kfTipIng(){
        wx.showModal({
          title: '提示',
          content: data.tip,
          confirmText: '知道了',
          showCancel: false,
          success: (ret) => {
            if (ret.confirm) {
              wx.openCustomerServiceConversation({
                sessionFrom: 'gameWechatGroup_' + Sygame.openid,
                showMessageCard: true,
                sendMessageImg: 'http://wx.11babay.cn/uploads/s/sqcsh1458897586/d/b/f/5/6368cbb090299.jpeg',
                sendMessageTitle: '好基友一起畅快交流！',
                success: () => {
                  console.log('success');
                }
              })
            }
          }
        });
      }
    }
  },

  // 处理预览二维码图片
  showCanvasImage: (url, words) => {
    const img = new Image();
    img.onload = function() {
      const width = 800;
      const height = 1000;
      const fontSize = 60;
      const canvas = wx.createCanvas();
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fill();
      context.drawImage(img, 0, 0, width, width);
      context.fillStyle = 'black';
      context.font = `${fontSize}px Arial`;
      context.textAlign = 'center';
      context.fillText(words, width / 2, 900);
      canvas.toTempFilePath({
        x: 0,
        y: 0,
        width,
        height,
        fileType: 'jpg',
        quality: 1.0,
        complete(res) {
          if (res.tempFilePath) {
            wx.previewImage({
              urls: [res.tempFilePath]
            });
          } else {
            console.log('showCanvasImage error: ', res);
          }
        }
      });
    }
    img.src = url;
  },

  // 激励视频奖励
  showRewordVideo: (callback) => {
    if (!Sygame.adunitid) {
      console.log('缺少激励视频id');
      if (callback) callback(2);
      return false;
    }
    const adUnitId = Sygame.adunitid;
    const videoAd = wx.createRewardedVideoAd({ adUnitId });
    videoAd.onError(err => {
      console.log('showRewordVideo err: ', err);
      if (callback) callback(2);
    });
    try {
      if (videoAd.closeHandler) {
        videoAd.offClose(videoAd.closeHandler);
      }
    } catch(e) {
      console.log('videoAd.offClose error')
    }
    videoAd.closeHandler = function (res) {
      if (!videoAd) return;
      // 小于 2.1.0 的基础库版本，res 是一个 undefined
      if (res && res.isEnded || res === undefined) {
        // 播放完成
        if (callback) callback(1);
      } else {
        // 播放中途退出
        if (callback) callback(0);
      }
      videoAd.offClose();
    }
    videoAd.onClose(videoAd.closeHandler);
    videoAd.show().catch(() => {
      // 失败重试
      videoAd.load().then(() => videoAd.show());
    });
  },
  // 将时间换成字符串
  formatTime: date => {
    const formatNumber = n => {
      n = n.toString()
      return n[1] ? n : `0${n}`
    };
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const minute = date.getMinutes();
    const second = date.getSeconds();
    return `${[year, month, day].map(formatNumber).join('-')} ${[hour, minute, second].map(formatNumber).join(':')}`
  },
  
  // 流量主广告数据上报
  syUploadCasualAdInfo: (params) => {
    // 若当前行为为用户发起调用，生成广告标识
    if (parseInt(params.actionType) === 1) {
      Sygame.initCasualAdActionId(params.position);
    }
    let adActionId = Sygame.getCasualAdActionId(params.position);
    // 拼接数据处理
    let data = {
      'action_id': adActionId,
      'action_time': Sygame.formatTime(new Date()),
      'action_type': params.actionType,
      'position': params.position,
      'task': params.task,
      'role_id': Sygame.role_id,
      'wecha_id': Sygame.openid
    };
    console.log('准备上报', data);
    wx.request({
      url: confArr[27],
      data: data,
      method: "POST",
      success: (res) => {
        if (res.data.status == 1001) {
          console.log('流量主广告数据上传成功', res.data);
        } else {
          console.log('流量主广告数据上传失败', res.data);
        }
      },
      fail: (res) => {
        console.error(res);
      }
    });
  },
  // 生成流量主广告行为标识
  initCasualAdActionId: (position) => {
    let adActionId = Sygame.openid + '_' + position +'_' + Date.now() + parseInt(Math.random() * 1000);
    switch (position) {
      case 1:
        Sygame.adVideoActionId = adActionId;
        break;
      case 2: 
        Sygame.adBannerActionId = adActionId;
        break;
      default:
        break;
    }
    console.log('action_id生成成功', Date.now(), adActionId);
  },
  // 获取当前广告位的actionId
  getCasualAdActionId:  (position) => {
    let adActionId = '';
    switch (position) {
      case 1:
        adActionId = Sygame.adVideoActionId;
        break;
      case 2: 
        adActionId = Sygame.adBannerActionId;
        break;
      default:
        break;
    }
    console.log('获取action_id生成成功', Date.now(), adActionId);
    return adActionId;
  },

  // GET WECHAT NICKNAME
  syGetWechatNickname: () => new Promise(function(resolve, reject) {
    let key = 'wechatNickname'
    let userinfo = Sygame.cookieData({ type: 'get', 'key': key });
    if (userinfo) {
      resolve(userinfo);
      console.log('获取用户信息成功', userinfo)
    } else {
      wx.getUserProfile({
        desc: '获取用户身份',
        success: (res) => {
          Sygame.cookieData({ type: 'set', key: key, data: res.userInfo });
          resolve(res.userInfo);
          console.log('获取用户信息成功', res.userInfo)
        },
        fail: (code) => {
          console.log('获取用户信息失败', code)
          reject(code);
        }
      })
    }
  }),

  //subscribeSystem
  syGetSubscribeSystem: (data) => new Promise(function(reslove, reject) {
    wx.requestSubscribeSystemMessage({
      msgTypeList: data,
      success (res) {
        console.log('syGetSubscribeSystem', res)
        reslove(res);
      },
      fail(err) {
        console.error(err);
        reject(err)
      }
    })
  }),

  //拉起客服消息
  syGetCustomerServiceMessage: () => {
    wx.openCustomerServiceConversation({
      sessionFrom: 'customerServiceMessage',
      success: () => {
        console.log('success');
      },
      fail(err) {
        console.error(err);
      }
    })
  },

  syIaaGameKfMessage: () => {
    wx.openCustomerServiceConversation({
      sessionFrom: 'iaaGameKfMessage_' + Sygame.openid,
      success: () => {
        console.log('success');
      },
      fail(err) {
        console.error(err);
      }
    })
  },

  //微信开放数据解密
  syWxDataDecrypt: (data) => new Promise(function (resolve, reject) {
    if (!data.encryptedData || !data.iv || !data.signature) {
      reject({code: 4001, msg: '缺少必填参数'});
      return false;
    }
    if (!Sygame.session_key) {
      reject({code: 4001, msg: '请先执行盛也login获取sessionKey'});
      return false;
    }
    wx.request({
      url: confArr[31],
      data: {
        appid: Sygame.appid,
        channel: Sygame.channel,
        session_key: Sygame.session_key,
        encryptedData: data.encryptedData,
        iv: data.iv,
        signature: data.signature,
      },
      method: "POST",
      success: (res) => {
        console.log('WxDataDecrypt', res.data);
        resolve(res.data);
      },
      fail: (ret) => {
        reject(ret);
      },
    })
  }),

  //获取手机号
  syGetPhoneNumber() {
    function onTouchEndGetPhone() {
      // 移除事件监听器，防止重复触发
      wx.offTouchEnd(onTouchEndGetPhone);
      // 手机号快速验证组件
      wx.getPhoneNumber({
        success: (res) => {
          console.log('获取手机号码动态令牌success:', res);
          if (res.code) {
            wx.request({
              url: confArr[32],
              data: {
                appid: Sygame.appid,
                channel: Sygame.channel,
                openid: Sygame.openid,
                code: res.code
              },
              method: "POST",
              success: (res) => {
                console.log('bindMobilePhone', res);
              },
              fail: (ret) => {
                reject(ret);
              },
            })
          }
        },
        fail: (err) => {
          console.log('获取手机号码动态令牌error:', err);
        }
      })
    }
    // 绑定触摸结束事件
    wx.onTouchEnd(onTouchEndGetPhone);
  },

  //微信客户端sdk数据回传
  wxSdkCallbackBusiness(type, data) {
    const businessData = data && typeof data === 'object' ? data : {};
    const callbackData = businessData.wxSdkCallbackData && typeof businessData.wxSdkCallbackData === 'object'
      ? businessData.wxSdkCallbackData
      : {};

    if (type === 'login') {
      const openid = String(businessData.openid || Sygame.openid || '');
      if (!openid) {
        console.error('[DN SDK] 业务登录成功但未取得 OpenID');
        Sygame.reportWxClientCallbackLog(
          'setOpenId',
          { stage: 'local_identity', succeeded: false, code: 101, message: '缺少 OpenID' },
          { includeOpenId: false },
        );
        return false;
      }
      if (!Sygame.wxSdk || !Sygame.wxSdkInitResult || Sygame.wxSdkInitResult.inited !== true) {
        const initErrorResult = {
          stage: 'local_init',
          succeeded: false,
          code: 100,
          message: 'DataNexus SDK 未在 wx.login 前完成初始化',
        };
        console.error('[DN SDK] SDK 未在 wx.login 前完成初始化');
        Sygame.reportWxClientCallbackLog('initWxSdk', initErrorResult, { includeOpenId: false });
        return false;
      }
      Sygame.reportWxClientCallbackLog(
        'initWxSdk',
        { stage: 'local_init', succeeded: true, code: 0, message: 'SDK constructor ready' },
        { includeOpenId: false },
      );
      const setOpenIdResult = Sygame.wxSdk.setOpenId(openid);
      const setOpenIdCode = Number(setOpenIdResult && setOpenIdResult.code);
      Sygame.reportWxClientCallbackLog(
        'setOpenId',
        {
          stage: 'local_identity',
          succeeded: setOpenIdCode === 0,
          code: Number.isFinite(setOpenIdCode) ? setOpenIdCode : -999,
          message: sanitizeDnText(setOpenIdResult && setOpenIdResult.message, 120),
        },
        { includeOpenId: false },
      );
      if (setOpenIdCode !== 0) {
        Sygame.isOpenWxCallback = false;
        console.error('[DN SDK] setOpenId 失败');
        return false;
      }
      Sygame.isOpenWxCallback = true;
      console.log('DataNexus 用户身份已绑定');

      if (callbackData.isOpenWxSdkCallback !== true) {
        console.log('DataNexus 附加注册/支付回传未开启，基础行为上报继续启用');
        return true;
      }
      console.log('当前游戏已开启客户端附加回传');
      //上报注册或回流行为
      let loginResult = '';
      if (callbackData.callbackUser === 1) {
        loginResult = Sygame.wxSdk.onRegister();//新用户
      } else if (callbackData.callbackUser === 2) {
        loginResult = Sygame.wxSdk.track('RE_ACTIVE', { backFlowDay: callbackData.reActiveDays });//复购、回流
      }
      if (loginResult) Sygame.reportDnQueueResult('login', loginResult);
      console.log('回传login行为类别"0无、1注册、2复购"：', callbackData.callbackUser);
      //开启任务轮询，定时查询订单
      let timer = callbackData.pollingTimer ? callbackData.pollingTimer : 60;
      if (!Sygame.dnOrderPollingStarted && callbackData.deviceUa === 'ios') {
        Sygame.dnOrderPollingStarted = true;
        console.log('ios设备客户端轮询回传开启');
        setInterval(loopOrderTask, timer * 1000);//1分钟一次，ios
      } else if(!Sygame.dnOrderPollingStarted && Sygame.androidPayLoopCallback === 1) {
        Sygame.dnOrderPollingStarted = true;
        console.log('android设备客户端轮询回传开启');
        setInterval(loopOrderTask, timer * 1000);//1分钟一次、android
      }
      callbackFavorites();//收藏
      return true;
    }

    if (Sygame.isOpenWxCallback !== true || callbackData.isOpenWxSdkCallback !== true) {
      console.log('DataNexus 身份未就绪或附加回传未开启');
      return false;
    }

    switch (type) {
      case 'role':
        let reportRoleResult = '';
        if (callbackData.roleType === 1) {
          reportRoleResult = Sygame.wxSdk.onCreateRole(businessData.role_name)
        } else if (callbackData.roleType === 2) {
          reportRoleResult = Sygame.wxSdk.onTutorialFinish()
        }
        if (reportRoleResult) Sygame.reportDnQueueResult('reportRole', reportRoleResult);
        console.log('角色信息上报时回传创角行为类别"0无、1创角、2有效"：', callbackData.roleType);
        break;
      case 'pay':
        //安卓米大师扣款成功
        const payResult = Sygame.wxSdk.onPurchase(callbackData.price);
        Sygame.reportDnQueueResult('androidPay', payResult);
        console.log('米大师支付后回传：', callbackData.price/100);
        break;
      default:
        if (!Sygame.wxSdk || !Sygame.wxSdkInitResult || Sygame.wxSdkInitResult.inited !== true) {
          return false;
        }
        break;
    }

    //定时轮询查询订单
    function loopOrderTask() {
      wx.request({
        url: confArr[33],
        data: {
          appid: Sygame.appid,
          channel: Sygame.channel,
          openid: Sygame.openid
        },
        method: "POST",
        success: (res) => {
          if (res.data.status === 1001) {
            //回传
            const loopPayResult = Sygame.wxSdk.onPurchase(res.data.data.money * 100);
            Sygame.reportDnQueueResult(Sygame.androidPayLoopCallback === 1 ? 'androidLoopPay' : 'iosLoopPay', loopPayResult);
            console.log('定时查询订单回传数据：', res.data.data.money);
            //通知服务端
            postSendBackSuccess(res.data.data);
          } else {
            console.log('定时查询订单回传数据：', res.data.msg);
          }
        },
        fail: (ret) => {
          console.log('定时查询订单回传error：', ret);
        },
      })
    }

    //发送回调成功至服务端
    function postSendBackSuccess(data) {
      console.log('发送回调成功信息至服务端：', data);
      wx.request({
        url: confArr[34],
        data: data,
        method: "POST",
        success: (res) => {
          console.log('postSendBack:success:', res.data);
        },
        fail: (ret) => {
          console.log('postSendBack:error:', ret);
        },
      })
    }

    //监听收藏并接入回传
    function callbackFavorites() {
      if (Sygame.dnFavoritesListenerStarted || typeof wx.onAddToFavorites !== 'function') {
        return;
      }
      Sygame.dnFavoritesListenerStarted = true;
      wx.onAddToFavorites(() => {
        console.log('监听到收藏行为并上报回传');
        const addToWishlist = Sygame.wxSdk.track('ADD_TO_WISHLIST', {type: 'default'});
        Sygame.reportDnQueueResult('share4', addToWishlist);
      });
    }
  },

  //游戏内主动拉起转发
  syInGameUseShareAppMessage: () => new Promise(function(reslove, reject) {
    if (Sygame.isDnQueueReady()) {
      console.log('主动拉起转发，进入选择通讯录界面');
      const shareResult = Sygame.wxSdk.track('SHARE', {target: 'APP_MESSAGE'});
      Sygame.reportDnQueueResult('share3', shareResult);
    }
    reslove({code: 0});
  }),

  //检测sessionKey
  checkSessionKey: () => new Promise(function (resolve, reject){
    let data = {
      "openid": Sygame.openid,
      "real_openid": Sygame.real_openid,
      "appid": Sygame.appid,
      "channel": Sygame.channel,
    };
    console.log('检测米大师sessionkeyParams', data);
    wx.request({
      url: confArr[37],
      data: data,
      method: "POST",
      success: (res) => {
        if (res.data.status == 1001) {
          console.log('检测sessionKey可用，继续执行支付操作');
          resolve({'status': 1001});
        } else {
          console.log('检测sessionKey已失效，执行wx.login获取code更新sessionKey');
          wx.login({
            success (res) {
              if (res.code) {
                data.code = res.code;
                wx.request({
                  url: confArr[38],
                  data: data,
                  method: "POST",
                  success: (res) => {
                    console.log('更新sessionKey结束', res);
                    if (res.data.status == 1001) {
                      resolve({'status': 1001});
                    } else {
                      reject({'status': 4001});
                    }
                  },
                })
              } else {
                console.log('执行wx.login获取code失败！' + res.errMsg);
                reject({'status': 4001});
              }
            }
          })
        }
      },
      fail: (res) => {
        console.error(res);
        reject({'status': 4001});
      }
    });
  }),

  //记录本地 SDK 队列结果；code=0 仅表示入队，不代表腾讯服务端已接收。
  reportDnQueueResult(actionType, callbackResult) {
    const codeValue = Number(callbackResult && callbackResult.code);
    const code = Number.isFinite(codeValue) ? codeValue : -999;
    const result = {
      stage: 'local_queue',
      queued: code === 0,
      code: code,
      message: sanitizeDnText(callbackResult && callbackResult.message, 120),
    };
    Sygame.reportWxClientCallbackLog(actionType, result, { includeOpenId: false });
    return result;
  },

  //上报客户端回传诊断日志。DataNexus 传输日志禁止携带 OpenID 和原始请求体。
  reportWxClientCallbackLog(actionType, callbackResult, options) {
    const includeOpenId = !options || options.includeOpenId !== false;
    let reportData = {
      appid: Sygame.appid,
      channel: Sygame.channel,
      actionType: actionType,
      isOpenWxCallback: Sygame.isOpenWxCallback,
      result: callbackResult
    };
    if (includeOpenId) reportData.openid = Sygame.openid;
    wx.request({
      url: confArr[35],
      data: reportData,
      method: 'POST',
      success: function (res) {
        console.log('上报客户端回传日志', {
          actionType: actionType,
          code: res && res.data && (res.data.code || res.data.status),
        });
      },
      fail: function (ret) {
        console.error('上报客户端回传日志失败', sanitizeDnText(ret && ret.errMsg, 120));
      }
    })
  },

  // 获取指定分享内容
  getSpecifyShareData() {
    if (Sygame.isGetSpecifyShareData !== 1) {
      return false;
    }
    wx.request({
      url: confArr[39],
      data: {
        appid: Sygame.appid,
        channel: Sygame.channel,
        openId: Sygame.openid,
      },
      method: "POST",
      success: (res) => {
        console.log('获取指定分享内容', res.data);
        if (res.data.status == 1001) {
          Sygame.specifyShareData = res.data.data;
        }
      }
    })
  },

  // ==================== 腾讯广告IAA采集行为上报 ====================

  isDnQueueReady() {
    return !!(Sygame.wxSdk && Sygame.wxSdkInitResult && Sygame.wxSdkInitResult.inited === true);
  },

  // 完成加载（进入游戏第一帧）
  syIaaLoadFinish() {
    if (!Sygame.isDnQueueReady()) {
      console.log('DataNexus SDK 未初始化，syIaaLoadFinish上报跳过');
      return false;
    }
    const result = Sygame.wxSdk.track('LOAD_FINISH', {});
    Sygame.reportDnQueueResult('iaaLoadFinish', result);
    console.log('LOAD_FINISH上报结果:', result);
    return result;
  },

  // 订阅
  syIaaSubscribe() {
    if (!Sygame.isDnQueueReady()) {
      console.log('DataNexus SDK 未初始化，syIaaSubscribe上报跳过');
      return false;
    }
    const result = Sygame.wxSdk.track('SUBSCRIBE', {});
    Sygame.reportDnQueueResult('iaaSubscribe', result);
    console.log('SUBSCRIBE上报结果:', result);
    return result;
  },

  /**
   * 新手引导行为上报（聚合方法）
   * @param {number} type 上报类型：1-新手引导开始 2-完成新手指引
   */
  syIaaTutorialTrack(type) {
    if (!Sygame.isDnQueueReady()) {
      console.log('DataNexus SDK 未初始化，syIaaTutorialTrack上报跳过');
      return false;
    }
    const typeMap = {1: ['TUTORIAL_START', 'track'], 2: ['TUTORIAL_FINISH', 'onTutorialFinish']};
    const config = typeMap[type];
    if (!config) {
      console.log('syIaaTutorialTrack type参数无效，type:', type);
      return false;
    }
    const [eventName, method] = config;
    const result = method === 'track' ? Sygame.wxSdk.track(eventName, {}) : Sygame.wxSdk.onTutorialFinish();
    Sygame.reportDnQueueResult('iaaTutorialTrack_' + type, result);
    console.log(eventName + '上报结果:', result);
    return result;
  },

  /**
   * 关卡行为上报（聚合方法）
   * @param {number} type 上报类型：1-进入关卡 2-中途退出关卡 3-关卡失败 4-通过关卡
   * @param {object} data 上报数据
   */
  syIaaLevelTrack(type, data) {
    if (!Sygame.isDnQueueReady()) {
      console.log('DataNexus SDK 未初始化，syIaaLevelTrack上报跳过');
      return false;
    }
    const typeMap = {1: 'LEVEL_ENTER', 2: 'LEVEL_EXIT', 3: 'LEVEL_LOSE', 4: 'LEVEL_PASS'};
    const eventName = typeMap[type];
    if (!eventName) {
      console.log('syIaaLevelTrack type参数无效，type:', type);
      return false;
    }
    const result = Sygame.wxSdk.track(eventName, data || {});
    Sygame.reportDnQueueResult('iaaLevelTrack_' + type, result);
    console.log(eventName + '上报结果:', result);
    return result;
  },

  /**
   * 广告行为上报（聚合方法）
   * @param {number} type 上报类型：1-广告位展示 2-广告位点击 3-广告播放结束 4-广告曝光
   * @param {object} data 上报数据
   */
  syIaaAdTrack(type, data) {
    if (!Sygame.isDnQueueReady()) {
      console.log('DataNexus SDK 未初始化，syIaaAdTrack上报跳过');
      return false;
    }
    const typeMap = {1: 'AD_PLACEMENT_SHOW', 2: 'AD_CLICK', 3: 'AD_VIDEO_FINISH', 4: 'AD_IMPRESSION'};
    const eventName = typeMap[type];
    if (!eventName) {
      console.log('syIaaAdTrack type参数无效，type:', type);
      return false;
    }
    const result = Sygame.wxSdk.track(eventName, data || {});
    Sygame.reportDnQueueResult('iaaAdTrack_' + type, result);
    console.log(eventName + '上报结果:', result);
    return result;
  },
};
globalThis.Sygame = Sygame;
