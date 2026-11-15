Page({
 data:{message:'活动签到与成长记录即将上线。',isAdmin:false,registered:false,nickname:'',memberNo:'',avatarSrc:'',champions:[],myActivities:[]},
 onShow:function(){
  var page=this;page.setData({avatarSrc:'',isAdmin:false,champions:[],myActivities:[]});
  wx.cloud.callFunction({name:'memberHome'}).then(function(response){
   var result=response.result||{},member=result.member||{};
   page.setData({registered:!!result.registered,nickname:member.nickname||'',memberNo:member.memberNo||''});
   if(result.registered&&member.avatarFileID){
    wx.cloud.getTempFileURL({fileList:[member.avatarFileID]}).then(function(f){
     var file=f.fileList&&f.fileList[0];if(file&&file.tempFileURL)page.setData({avatarSrc:file.tempFileURL});
    }).catch(function(e){console.warn('[profile:avatar]',e);});
   }
   if(result.registered)page.loadMyActivities();
  }).catch(function(e){console.error('[profile:memberHome]',e);});
  wx.cloud.callFunction({name:'adminProfile'}).then(function(r){page.setData({isAdmin:!!(r.result&&r.result.role)});}).catch(function(){page.setData({isAdmin:false});});
  wx.cloud.callFunction({name:'championAdmin',data:{action:'mine'}}).then(function(r){page.setData({champions:(r.result&&r.result.records)||[]});}).catch(function(){page.setData({champions:[]});});
 },
 loadMyActivities:function(){
  var page=this;
  wx.cloud.callFunction({name:'activityMember',data:{action:'mine'}}).then(function(r){page.setData({myActivities:(r.result&&r.result.applications)||[]});}).catch(function(e){console.warn('[profile:activities]',e);});
 },
 openRegister:function(){wx.navigateTo({url:'/pages/register/index'});},
 editProfile:function(){wx.navigateTo({url:'/pages/register/index?mode=edit'});},
 openAdmin:function(){wx.navigateTo({url:'/pages/admin-highlights/index'});},
 openChampionAdmin:function(){wx.navigateTo({url:'/pages/admin-champions/index'});},
 openActivityAdmin:function(){wx.navigateTo({url:'/pages/admin-activities/index'});},
 openActivities:function(){wx.navigateTo({url:'/pages/activities/index'});},
 openActivity:function(e){wx.navigateTo({url:'/pages/activity-detail/index?id='+encodeURIComponent(e.currentTarget.dataset.id)});},
 openHighlights:function(){wx.navigateTo({url:'/pages/highlights/index'});},
 openChampion:function(e){wx.navigateTo({url:'/pages/moment/index?type=champion&id='+encodeURIComponent(e.currentTarget.dataset.id)});}
});
