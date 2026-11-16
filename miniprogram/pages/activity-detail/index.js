var catalog=require('../../utils/activity-products.js');
Page({
 data:{id:'',activity:null,myStatus:'none',loading:true,busy:false,error:'',posterError:false},
 onLoad:function(options){this.setData({id:options.id||''});},
 onShow:function(){if(this.data.id)this.load();},
 load:function(){
  var page=this;page.setData({loading:true,error:''});
  wx.cloud.callFunction({name:'activityMember',data:{action:'detail',id:page.data.id}}).then(function(res){
   var r=res.result||{};page.setData({activity:r.activity?catalog.decorate(r.activity):null,posterError:false,myStatus:r.myStatus||'none',loading:false});
  }).catch(function(e){console.error('[activity:detail]',e);page.setData({loading:false,error:'活动已下架或暂时无法加载'});});
 },
 apply:function(){
  var page=this;if(page.data.busy)return;
  page.setData({busy:true});
  wx.cloud.callFunction({name:'activityMember',data:{action:'apply',id:page.data.id}}).then(function(){
   wx.showToast({title:'报名成功'});page.load();
  }).catch(function(e){
   console.error('[activity:apply]',e);
   var message=String((e&&(e.errMsg||e.message))||e);
   wx.showModal({title:'报名失败',content:message.indexOf('REGISTER_REQUIRED')>=0?'请先在「我的」完成会员注册':message.indexOf('ACTIVITY_ENDED')>=0?'活动已结束':'请检查网络或联系组织者',showCancel:false});
  }).then(function(){page.setData({busy:false});});
 },
 cancel:function(){
  var page=this;if(page.data.busy)return;
  wx.showModal({title:'取消报名',content:'确认取消这次活动报名吗？',success:function(result){
   if(!result.confirm)return;
   page.setData({busy:true});
   wx.cloud.callFunction({name:'activityMember',data:{action:'cancel',id:page.data.id}}).then(function(){
    wx.showToast({title:'已取消报名'});page.load();
   }).catch(function(e){console.error('[activity:cancel]',e);wx.showToast({title:'取消失败',icon:'none'});}).then(function(){page.setData({busy:false});});
  }});
 },
 onPosterError:function(){this.setData({posterError:true});},
 register:function(){wx.switchTab({url:'/pages/profile/index'});}
});
