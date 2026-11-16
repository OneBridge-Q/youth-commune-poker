Page({
 data:{board:'battle',loading:true,error:'',needsRegister:false,rows:[],me:null,period:null},
 onShow:function(){
  var desired='';try{desired=wx.getStorageSync('redcircle:ranking-board');wx.removeStorageSync('redcircle:ranking-board');}catch(e){}
  if(desired==='battle'||desired==='charisma')this.setData({board:desired});
  this.load();
 },
 onUnload:function(){this._seq=(this._seq||0)+1;},
 chooseBoard:function(e){var b=e.currentTarget.dataset.board;if((b!=='battle'&&b!=='charisma')||b===this.data.board)return;this.setData({board:b});this.load();},
 load:function(){
  var page=this,seq=(page._seq||0)+1;page._seq=seq;
  page.setData({loading:true,error:'',needsRegister:false,rows:[],me:null,period:null});
  wx.cloud.callFunction({name:'memberRankings',data:{board:page.data.board}}).then(function(r){
   if(seq!==page._seq)return;
   var data=r.result||{};
   if(!Array.isArray(data.rows)||!data.me)throw Error('INVALID_RANKING_RESPONSE');
   page.setData({loading:false,rows:data.rows,me:data.me,period:data.period||null});
  }).catch(function(e){
   if(seq!==page._seq)return;
   var text=String(e.errMsg||e.message||''),need=text.indexOf('REGISTER_REQUIRED')>=0;
   var message=need?'注册成为会员后即可查看天梯榜。':text.indexOf('CHARISMA_LEDGER_NOT_READY')>=0?'本季魅力值榜尚未初始化，请联系管理员。':text.indexOf('FUNCTION_NOT_FOUND')>=0?'天梯服务尚未部署，请联系管理员。':'榜单加载失败，请稍后重试。';
   page.setData({loading:false,error:message,needsRegister:need});
  });
 },
 register:function(){wx.navigateTo({url:'/pages/register/index'});}
});
