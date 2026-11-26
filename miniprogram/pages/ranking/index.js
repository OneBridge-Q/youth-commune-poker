Page({
 data:{loading:true,error:'',needsRegister:false,rows:[],scope:'store',storeId:''},
 onShow:function(){this.load();},
 onHide:function(){this._seq=(this._seq||0)+1;},
 onUnload:function(){this._seq=(this._seq||0)+1;},
 load:function(){
  var page=this,seq=(page._seq||0)+1;page._seq=seq;
  page.setData({loading:true,error:'',needsRegister:false,rows:[],storeId:''});
  wx.cloud.callFunction({name:'memberRankings',data:{board:'battle',scope:'store'}}).then(function(r){
   if(seq!==page._seq)return;
   var data=r.result||{};
   if(data.scope!=='store'||typeof data.storeId!=='string'||!data.storeId.trim())throw Error('STORE_RANKINGS_UPDATE_REQUIRED');
   if(data.board!=='battle'||!Array.isArray(data.rows))throw Error('INVALID_RANKING_RESPONSE');
   page.setData({loading:false,rows:data.rows,scope:'store',storeId:data.storeId});
  }).catch(function(e){
   if(seq!==page._seq)return;
   var text=String(e.errMsg||e.message||''),need=text.indexOf('REGISTER_REQUIRED')>=0;
   var message=need?'注册成为会员后即可查看本店天梯榜。':
    text.indexOf('STORE_RANKINGS_UPDATE_REQUIRED')>=0?'本店榜服务需要更新，请重新部署 memberRankings。':
    text.indexOf('MEMBER_STORE_REQUIRED')>=0?'尚未设置所属门店，请联系管理员；不会自动切换到全系统榜。':
    text.indexOf('FUNCTION_NOT_FOUND')>=0?'本店榜服务尚未部署，请联系管理员。':'本店榜加载失败，请稍后重试。';
   page.setData({loading:false,error:message,needsRegister:need});
  });
 },
 register:function(){wx.navigateTo({url:'/pages/register/index'});}
});
