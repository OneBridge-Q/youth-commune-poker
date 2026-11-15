Page({
 data:{message:'会员档案与积分流水即将上线。',isAdmin:false,champions:[]},
 async onShow(){
  const [admin,awards]=await Promise.allSettled([
   wx.cloud.callFunction({name:'adminProfile'}),
   wx.cloud.callFunction({name:'championAdmin',data:{action:'mine'}})
  ]);
  this.setData({
   isAdmin:admin.status==='fulfilled'&&!!(admin.value.result&&admin.value.result.role),
   champions:awards.status==='fulfilled'?(awards.value.result.records||[]):[]
  });
 },
 openAdmin(){wx.navigateTo({url:'/pages/admin-highlights/index'});},
 openChampionAdmin(){wx.navigateTo({url:'/pages/admin-champions/index'});},
 openHighlights(){wx.navigateTo({url:'/pages/highlights/index'});},
 openChampion(e){wx.navigateTo({url:'/pages/moment/index?type=champion&id='+encodeURIComponent(e.currentTarget.dataset.id)});}
});
