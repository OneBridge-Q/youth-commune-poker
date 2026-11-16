Page({
 data:{id:'',activity:null,myStatus:'none',loading:true,busy:false,error:''},
 onLoad:function(o){this.setData({id:o.id||''});},
 onShow:function(){if(this.data.id)this.load();},
 onHide:function(){this._seq=(this._seq||0)+1;},
 load:function(){
  var page=this,seq=(page._seq||0)+1;page._seq=seq;page.setData({loading:true,error:'',activity:null});
  wx.cloud.callFunction({name:'activityMember',data:{action:'detail',id:page.data.id}}).then(function(r){
   if(seq!==page._seq)return;var v=r.result||{};page.setData({activity:v.activity||null,myStatus:v.myStatus||'none',loading:false});
  }).catch(function(){if(seq===page._seq)page.setData({loading:false,error:'活动已下架或暂时无法加载'});});
 },
 apply:function(){var page=this;if(page.data.busy)return;page.setData({busy:true});
  wx.cloud.callFunction({name:'activityMember',data:{action:'apply',id:page.data.id}}).then(function(){wx.showToast({title:'报名成功'});page.load();}).catch(function(e){
   var text=String(e.errMsg||e.message||'');wx.showModal({title:'报名失败',content:text.indexOf('REGISTER_REQUIRED')>=0?'请先完成会员注册':text.indexOf('ACTIVITY_ENDED')>=0?'活动已开始，不能再报名':'暂时无法报名，请联系组织者或重试',showCancel:false});
  }).then(function(){page.setData({busy:false});});
 },
 cancel:function(){var page=this;if(page.data.busy)return;
  wx.showModal({title:'取消报名',content:'确认取消这次活动报名吗？',success:function(result){
   if(!result.confirm)return;page.setData({busy:true});
   wx.cloud.callFunction({name:'activityMember',data:{action:'cancel',id:page.data.id}}).then(function(){wx.showToast({title:'已取消报名'});page.load();}).catch(function(e){
    var text=String(e.errMsg||e.message||'');wx.showModal({title:'取消未完成',content:text.indexOf('CHECKED_IN_CONTACT_ADMIN')>=0?'你已签到，不能直接取消报名。如为误签，请联系管理员先撤销签到。':'操作未确认成功，请刷新活动后重试。',showCancel:false});page.load();
   }).then(function(){page.setData({busy:false});});
  }});
 },
 register:function(){wx.switchTab({url:'/pages/profile/index'});}
});
