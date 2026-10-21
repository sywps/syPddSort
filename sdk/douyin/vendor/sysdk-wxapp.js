const SY_CONF = require('./sysdk-conf');
const API_DOMAIN = 'https://docater1.cn';
const SY_VERSION = '1001.1.9';

const Sygame = {
  // 初始化
  appid: '',
  app_version: SY_VERSION,
  openid: '',
  real_openid: '',
  role_id: 0, //角色id
  role_name: '',   //角色名称
  server_id: '',    //区服id
  server_name: '',    //区服名称
  channel: '',
  sidebarIconInfo: {
    iconShowStatus: 0,//icon展示状态
    allowGetReward: 0,//允许获得奖励
  },
  init: (data) => {
    Sygame.appid = SY_CONF['APP_ID'];
    Sygame.query = data.query;
    Sygame.channel = SY_CONF['GAME_KEY'];
    Sygame.scene = data.scene;
    console.log('syInit:', Sygame);
    tt.onShow((res) => {
      console.log('onShow', res);
      if (res.launch_from === 'homepage' && res.location === 'sidebar_card') {
        Sygame.sidebarIconInfo.allowGetReward = 1;
      }
    });
  },
  // 登录
  syLogin: () =>  new Promise(function (resolve, reject) {
    tt.login({
      success(res) {
        console.log("syLoginCode:", res);
        if (res.code) {
          // 获取openid以及用户信息
          let url = API_DOMAIN + '/index.php?g=Wap&m=MiniGameTt&a=login';
          tt.request({
            url: url,
            data: {
              code: res.code,
              appid: Sygame.appid,
              version: Sygame.app_version,
              query: JSON.stringify(Sygame.query),
              scene: Sygame.scene,
              channel: Sygame.channel,
            },
            success(ret) {
              console.log("syLogin:", ret);

              resolve(ret.data);
              Sygame.openid = ret.data.openid;
              Sygame.real_openid = ret.data.real_openid;
            }, fail(err){
              console.log("err syLogin:", err);
            }
          })
        } else {
          return false;
        }
      },
      fail: function() {
        console.log('tt.login fail');
      }
    });
  }),

  // 角色信息上报
  syReportRoleInfo: (data) => new Promise(function(resolve, reject) {
    if (typeof data === 'object') {
      let url = API_DOMAIN + '/index.php?g=Wap&m=MiniGameTt&a=reportRoleInfo';
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
      console.log('syReportRoleParams', data);
      tt.request({
        url: url,
        data: data,
        method: "POST",
        success: (res) => {
          console.log("syReportRoleInfo:", res);
          resolve(res.data);
        },
      })
    }else {
      return '参数格式不正确';
    }
  }),

  // real pay function
  syPay : (data) => new Promise(function(resolve, reject){
    let url = url = API_DOMAIN + '/index.php?g=Wap&m=MiniGameTt&a=canPay';
    if (typeof data == 'object') {
      data.openid = Sygame.openid;
      data.real_openid = Sygame.real_openid;
      data.appid = Sygame.appid;
      data.channel = Sygame.channel;
      data.version = Sygame.app_version;
      data.is_buckle_pay = 0;
      console.log('syPayParams', data);
      tt.request({
        url: url,
        method: 'POST',
        data: data,
        success: function (res) {
          console.log("syPay:", res);
          // 虚拟支付比例
          data.midasPayProportion = res.data.midasPayProportion;
          // 支付配置
          switch(res.data.payType) {
            case 1: // 虚拟支付
                if( res.data.can_use_balance == 1 ){
                  tt.showModal({
                    title: '支付确认',
                    content: res.data.midas_pay_tip,
                    confirmText: '确认',
                    showCancel: '取消',
                    success: (ret) => {
                      if (ret.confirm) {
                        data.is_buckle_pay = 1;
                        Sygame.syDescGamePayCoin(data);
                      }
                      else {
                        console.log('用户点击取消');
                        Sygame.syGamePayPay(data);
                      }
                    }
                  });
                }
                else {
                  Sygame.syGamePayPay(data);
                }
              break;
            case 2:
              tt.openAwemeCustomerService({
                currencyType: "CNY",
                buyQuantity: data.product_price*100,
                zoneId: "1",
                customId: data.order_id,
                extraInfo: 'iosPay',
                success(res) {
                  resolve({code: 1, msg: 'IOS支付调用成功'});
                  console.log('ios支付调用成功',res)
                },
                fail(res) {
                  reject({errCode: -1, errMsg: 'IOS支付调用失败'});
                  console.log('ios支付调用失败',res)
                },
              });
              break;
          }
        }
      })
    } else {
      reject('data is not obj');
    }
  }),

  // 虚拟支付扣除余额
  syDescGamePayCoin: (data) => {
    data.openid = Sygame.openid;
    data.real_openid = Sygame.real_openid;
    data.appid = Sygame.appid;
    data.channel = Sygame.channel;
    data.version = Sygame.app_version;
    data.is_buckle_pay = 1;
    tt.request({
      url: API_DOMAIN + '/index.php?g=Wap&m=MiniGameTt&a=descGamePayCoin',
      data: data,
      method: 'POST',
      dataType: 'json',
      success: function (res) {
        console.log( 'syDescGamePayCoin:', res );
        tt.showModal({
          title: '提示',
          content: res.data.tip,
          confirmText: '确认',
          showCancel: '取消',
          success: (ret) => {
            if (ret.confirm) {

            }
          }
        });
      },
      fail: function (e) {
        console.log("请求失败", e)
      }
    })
  },

  syGamePayPay: (data) => {
    tt.requestGamePayment({
      mode:'game',
      env:0,
      currencyType:'CNY',
      platform: 'android',
      buyQuantity: data.product_price*data.midasPayProportion,
      zoneId: 1,
      customId: data.order_id,
      extraInfo: '',
      success (res) {
        Sygame.syDescGamePayCoin(data);
        console.log("syGamePayPay:", res);
      },
      fail (res) {
        console.log(res)
      },
      complete (res) {
        console.log(res)
      }
    })
  },

  // 屏蔽词检测
  syCheckShieldWords: (word) => new Promise(function (reslove, reject) {
    tt.request({
      url: API_DOMAIN + '/index.php?g=Wap&m=WxSecCheck&a=checkShieldWords',
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

  // 流量主广告数据上报
  syUploadCasualAdInfo: (params) => {
    //生成广告标识
    Sygame.initCasualAdActionId(params.position);
    //获取广告标识
    let adActionId = Sygame.getCasualAdActionId(params.position);
    // 拼接数据处理
    let data = {
      'action_id': adActionId,
      'action_time': Sygame.formatTime(new Date()),
      'action_type': 5,
      'position': params.position,
      'task': params.task,
      'role_id': Sygame.role_id,
      'wecha_id': Sygame.openid,
      'appid': Sygame.appid
    };
    console.log('准备上报', data);
    tt.request({
      url: API_DOMAIN + '/index.php?g=Wap&m=MiniGameTt&a=uploadCasualAction',
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

  // 获取侧边栏icon开启状态
  syGetSidebarIconOpenStatus: () =>  new Promise(function (resolve, reject) {
    //1、获取icon是否展示
    let data = {
      wecha_id: Sygame.openid,
      appid: Sygame.appid,
      channel: Sygame.channel,
      version: Sygame.app_version
    };
    console.log('syGetSidebarIconOpenStatusParams', data);
    tt.request({
      url: API_DOMAIN + '/index.php?g=Wap&m=MiniGameTt&a=getIconShowStatus',
      data: data,
      method: 'POST',
      dataType: 'json',
      success: function (res) {
        console.log( 'syGetSidebarIconOpenStatusReturn:', res.data);
        if (res.data.status == 1001 && res.data.iconShowStatus) {
          Sygame.sidebarIconInfo.iconShowStatus = res.data.iconShowStatus;
        }
        resolve(Sygame.sidebarIconInfo);
      },
      fail: function (e) {
        console.log("请求失败", e)
      }
    });
  }),

  // 侧边栏引导
  sySidebarGuide: () => {
    //1、验证侧边栏是否可用
    tt.checkScene({
      scene: "sidebar",
      success: (res) => {
        console.log("check scene success: ", res.isExist);
        if (res.isExist) { //可用则拉起侧边栏
          tt.navigateToScene({
            scene: "sidebar",
            success: (res) => {
              console.log("navigate to scene success");
            },
            fail: (res) => {
              console.log("navigate to scene fail: ", res);
            },
          });
        } else { // 不可用则拉起复访弹窗
          tt.showRevisitGuide({
            success() {
              console.log('成功调起复访引导弹窗');
            },
            fail(res) {
              console.log('调用失败，错误信息：%s', res.errMsg);
            }
          })
        }
      },
      fail: (res) => {
        console.log("check scene fail:", res);
      }
    });
  },

  // 拉起订阅消息
  syGetSubscribe: (templateIds) => new Promise(function(resolve, reject) {
    tt.requestSubscribeMessage({
      tmplIds: templateIds,
      complete: (res) => {
        let templateData = {};
        for (let obj of templateIds) {
          templateData[obj] = 'cancel';
          if (res[obj] === 'accept') {
            templateData[obj] = 'confirm';
          }
        }
        resolve(Sygame.reportSubscribeMessage(templateIds, templateData));
      },
    });
  }),
  // 上报订阅消息点击
  reportSubscribeMessage: (templateIds, templateData) => new Promise(function (resolve, reject) {
    let data = {
      openid: Sygame.openid,
      appid: Sygame.appid,
      channel: Sygame.channel,
      template: templateIds,
      templateData: templateData
    };
    console.log('sySubscribeMessageRecordsParams', data);
    tt.request({
      url: API_DOMAIN + '/index.php?g=Wap&m=MiniGameTt&a=subscribeMessageRecords',
      data: data,
      method: 'POST',
      dataType: 'json',
      success: function (res) {
        console.log( 'sySubscribeMessageRecordsReturn:', res.data);
        resolve(res.data);
      },
      fail: function (e) {
        console.log("请求失败", e)
      }
    });
  }),

  //拉起客服消息
  syCustomerServiceMsg: (kfType) => new Promise(function (resolve, reject) {
    console.log('拉起客服消息类型为：', kfType);
    tt.openCustomerServiceConversation({
      type: kfType,
      success(res) {
        resolve({code: 1, msg: '拉起客服消息成功'});
        console.log('拉起客服消息成功',res)
      },
      fail(res) {
        reject({errCode: -1, errMsg: '拉起客服消息失败'});
        console.log('拉起客服消息失败',res);
      },
    });
  }),
}
export default Sygame

