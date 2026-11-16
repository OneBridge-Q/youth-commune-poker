Page({
 data:{board:'battle',loading:true,error:'',needsRegister:false,rows:[],period:null,scope:'store',storeId:''},
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
  page.setData({loading:true,error:'',needsRegister:false,rows:[],period:null,storeId:''});
  wx.cloud.callFunction({name:'memberRankings',data:{board:page.data.board,scope:'store'}}).then(function(r){
   if(seq!==page._seq)return;
   var data=r.result||{};
   if(data.scope!=='store'||typeof data.storeId!=='string'||!data.storeId.trim())throw Error('STORE_RANKINGS_UPDATE_REQUIRED');
   if(data.board!==page.data.board||!Array.isArray(data.rows))throw Error('INVALID_RANKING_RESPONSE');
   page.setData({loading:false,rows:data.rows,period:data.period||null,scope:'store',storeId:data.storeId});
  }).catch(function(e){
   if(seq!==page._seq)return;
   var text=String(e.errMsg||e.message||''),need=text.indexOf('REGISTER_REQUIRED')>=0;
   var message=need?'注册成为会员后即可查看本店天梯榜。':
    text.indexOf('STORE_RANKINGS_UPDATE_REQUIRED')>=0?'本店榜服务需要更新，请重新部署 memberRankings。':
    text.indexOf('MEMBER_STORE_REQUIRED')>=0?'尚未设置所属门店，请联系管理员；不会自动切换到全系统榜。':
    text.indexOf('CHARISMA_LEDGER_NOT_READY')>=0?'本季魅力值记分尚未初始化，请联系管理员。':
    text.indexOf('FUNCTION_NOT_FOUND')>=0?'本店榜服务尚未部署，请联系管理员。':'本店榜加载失败，请稍后重试。';
   page.setData({loading:false,error:message,needsRegister:need});
  });
 },
 register:function(){wx.navigateTo({url:'/pages/register/index'});}
});
