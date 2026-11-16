Page({
 data:{board:'battle',loading:true,error:'',needsRegister:false,rows:[],period:null,friendCount:0},
 onShow:function(){
  var desired='';try{desired=wx.getStorageSync('redcircle:ranking-board');wx.removeStorageSync('redcircle:ranking-board');}catch(e){}
  if(desired==='battle'||desired==='charisma')this.setData({board:desired});
  this.load();
 },
 onHide:function(){this._seq=(this._seq||0)+1;},
 onUnload:function(){this._seq=(this._seq||0)+1;},
 chooseBoard:function(e){var b=e.currentTarget.dataset.board;if((b!=='battle'&&b!=='charisma')||b===this.data.board)return;this.setData({board:b});this.load();},
 load:function(){
  var page=this,seq=(page._seq||0)+1;page._seq=seq;
  page.setData({loading:true,error:'',needsRegister:false,rows:[],period:null,friendCount:0});
  wx.cloud.callFunction({name:'memberRankings',data:{board:page.data.board}}).then(function(r){
   if(seq!==page._seq)return;
   var data=r.result||{};
   if(data.scope!=='confirmed_friends')throw Error('FRIEND_RANKINGS_UPDATE_REQUIRED');
   if(!Array.isArray(data.rows))throw Error('INVALID_RANKING_RESPONSE');
   page.setData({loading:false,rows:data.rows,period:data.period||null,friendCount:data.friendCount||0});
  }).catch(function(e){
   if(seq!==page._seq)return;
   var text=String(e.errMsg||e.message||''),need=text.indexOf('REGISTER_REQUIRED')>=0;
   var message=need?'注册成为会员后即可查看好友榜。':
    text.indexOf('FRIEND_RANKINGS_UPDATE_REQUIRED')>=0?'好友榜服务需要更新，请重新部署 memberRankings。':
    text.indexOf('FRIENDSHIPS_NOT_READY')>=0?'好友关系尚未初始化，请联系管理员。':
    text.indexOf('FRIEND_SCOPE_LIMIT')>=0?'好友数量超过当前读取范围，请联系管理员升级。':
    text.indexOf('CHARISMA_LEDGER_NOT_READY')>=0?'本季魅力值记分尚未初始化，请联系管理员。':
    text.indexOf('FUNCTION_NOT_FOUND')>=0?'好友榜服务尚未部署，请联系管理员。':'好友榜加载失败，请稍后重试。';
   page.setData({loading:false,error:message,needsRegister:need});
  });
 },
 register:function(){wx.navigateTo({url:'/pages/register/index'});}
});
