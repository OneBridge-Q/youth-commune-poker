Page({
 data:{loading:true,registered:false,balance:0,error:''},
 onShow:function(){this.load();},
 load:function(){
  var page=this;page.setData({loading:true,error:''});
  wx.cloud.callFunction({name:'memberHome'}).then(function(r){
   var result=r.result||{},member=result.member||{};
   page.setData({loading:false,registered:!!result.registered,balance:typeof member.rewardPoints==='number'?member.rewardPoints:0});
  }).catch(function(){page.setData({loading:false,error:'余额暂时无法加载，规则仍可查看。'});});
 },
 goRanking:function(){try{wx.setStorageSync('redcircle:ranking-board','charisma');}catch(e){}wx.switchTab({url:'/pages/ranking/index'});},
 register:function(){wx.navigateTo({url:'/pages/register/index'});}
});
