Page({
 data:{registered:false,nickname:'新会员',memberNo:'',avatarSrc:'',skillPoints:0,rewardPoints:0,rank:'待评级',loading:false,error:''},
 onShow:function(){
  var page=this;page.setData({loading:true,error:'',avatarSrc:''});
  wx.cloud.callFunction({name:'memberHome'}).then(function(r){
   var result=r.result||{},m=result.member||{};
   page.setData({registered:!!result.registered,nickname:m.nickname||'新会员',memberNo:m.memberNo||'',skillPoints:m.skillPoints||0,rewardPoints:m.rewardPoints||0,rank:m.rank||'待评级'});
   if(m.avatarFileID){
    wx.cloud.getTempFileURL({fileList:[m.avatarFileID]}).then(function(f){
     var url=f.fileList&&f.fileList[0]&&f.fileList[0].tempFileURL;
     if(url)page.setData({avatarSrc:url});
    }).catch(function(e){console.warn('[home:avatar]',e);});
   }
  }).catch(function(e){console.error('[home:member]',e);page.setData({error:'连接失败，请检查云环境及云函数'});}).then(function(){page.setData({loading:false});});
 },
 goRegister:function(){wx.navigateTo({url:'/pages/register/index'});},
 goHighlights:function(){wx.navigateTo({url:'/pages/highlights/index'});},
 goActivities:function(){wx.navigateTo({url:'/pages/activities/index'});}
});
