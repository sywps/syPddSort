/*

<view class="container" id="main">
  <view class="list_invited">
    {{~it.invited :item:index}}
    <view class="list_item_invited">
       <image class="img_avatar_back" src="{{= it.backImage  || "" }}"></image>
      <image class="img_avatar_image" src="{{= item.avatarUrl || ""  }}"></image>
      <image class="img_avatar_frame" src="{{= it.frameImage || ""  }}"></image>
    </view>
    {{~}}
  </view>
  {{~it.to_invite :item:index}}
  <view class="list_item_to_invite list_item_to_invite{{=index}}">
    <image class="to_invite_img_avatar_back" src="{{= it.backImage  || "" }}"></image>
    <image class="to_invite_img_avatar_image" src="{{= item.avatarUrl  || "" }}"></image>
    <image class="to_invite_img_avatar_frame" src="{{= it.frameImage  || "" }}"></image>
	<text class="to_invite_nick" value="{{=item.nickname}}" />
    <view id="btn_invite{{=index}}" class="btn_invite">
      <image class="img_btn_bg" id="img_btn_bg{{=index}}" src="{{= item.btnInviteBg || "" }}"></image>
    </view>
  </view>
  {{~}}
</view>



/**
 * xml经过doT.js编译出的模板函数
 * 因为小游戏不支持new Function，模板函数只能外部编译
 * 可直接拷贝本函数到小游戏中使用
 */
function anonymous(it) {
  var out = '<view class="container" id="main"> <view class="list_invited"> ';
  var arr1 = it.invited;
  if (arr1) {
    var item,
      index = -1,
      l1 = arr1.length - 1;
    while (index < l1) {
      item = arr1[index += 1];
      out += ' <view id="' + (item._key || ("invite-item-" + index)) + '" class="list_item_invited"><image class="img_avatar_image" src="' + (item.avatarUrl || "") + '"></image> </view> ';
    }
  }
  out += ' </view> ';

  out += '</view>';
  return out;
}

module.exports = anonymous;
