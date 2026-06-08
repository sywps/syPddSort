var style = require("./render/style_invite");
var template = require("./render/template_invite");

var Layout = void 0,
  sharedContext = void 0,
  sharedCanvas = void 0,
  log = void 0;
var myOpenId = void 0,
  inviteNum = void 0;

function createInvitePlaceholder(index) {
  return {
    _key: "invite-placeholder-" + index,
    avatarUrl: "openDataContext/render/img_default_avatar.jpg"
  };
}

function buildInviteList(dataList, size) {
  var targetSize = Math.max(0, size || 0);
  var list = [];
  for (var i = 0; i < targetSize; i++) {
    list.push(createInvitePlaceholder(i));
  }

  if (!dataList || !dataList.length) {
    return list;
  }

  for (var j = 0; j < Math.min(targetSize, dataList.length); j++) {
    var item = dataList[j] || {};
    list[j] = Object.assign(createInvitePlaceholder(j), item, {
      _key: item.openId || item.avatarUrl || "invite-user-" + j
    });
  }

  return list;
}

var renderData = {
  invited: buildInviteList([], 5)
};

function updateView() {
  Layout.clear();
  Layout.init(template(renderData), style);
  Layout.layout(sharedContext);
}

function updateInviteSuccOpenids(openids) {
  log("更新邀请的openids: ", openids);

  wx.getUserInfo({
    openIdList: openids,
    lang: "zh_CN",
    success: function success(res) {
      log("成功邀请用户信息: ", res.data);
      var invitedList = buildInviteList([], 5);
      for (var i = 0; i < openids.length; i++) {
        var invitedOpenId = openids[i];
        for (var j = 0; j < res.data.length; j++) {
          var d = res.data[j];
          if (d.openId == invitedOpenId) // openid相同
          {
            if (!d.avatarUrl || d.avatarUrl.trim().length == 0) {
              d.avatarUrl = "openDataContext/render/img_default_avatar.jpg";
            }
            invitedList[i] = Object.assign(createInvitePlaceholder(i), d, {
              _key: d.openId || d.avatarUrl || "invite-user-" + i
            });
            break;
          }
        }
      }

      log("最终展现的用户们: ", invitedList);

      renderData.invited = invitedList;

      updateView();
    }
  });
}

module.exports = function handleMessage(data) {
  switch (data.type) {
    case "init":
      sharedContext = data.sharedContext;
      sharedCanvas = data.sharedCanvas;
      Layout = data.Layout;
      myOpenId = data.myOpenId;
      inviteNum = data.inviteNum;
      log = data.createLogger("invite");
      break;
    case "updateInviteSuccOpenids":
      var openids = data.openids ? JSON.parse(data.openids) : [];
      updateInviteSuccOpenids(openids);
      break;
  }
};
