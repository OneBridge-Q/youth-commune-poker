Page({
 data:{message:'活动与成长记录即将上线。',isAdmin:false,registered:false,nickname:'',memberNo:'',avatarSrc:'',champions:[]},
 async onShow(){
  this.setData({avatarSrc:''});
  const [member,admin,awards]=await Promise.allSettled([
   wx.cloud.callFunction({name:'memberHome'}),
   wx.cloud.callFunction({name:'adminProfile'}),
   wx.cloud.callFunction({name:'championAdmin',data:{action:'mine'}})
  ]);
  const result=member.status==='fulfilled'?(member.value.result||{}):{};
  const m=result.member||{};
  this.setData({
   registered:!!result.registered,nickname:m.nickname||'',memberNo:m.memberNo||'',
   isAdmin:!!result.registered&&admin.status==='fulfilled'&&!!(admin.value.result&&admin.value.result.role),
   champions:!!result.registered&&awards.status==='fulfilled'?(awards.value.result.records||[]):[]
  });
  if(result.registered&&m.avatarFileID){
   try{
    const f=await wx.cloud.getTempFileURL({fileList:[m.avatarFileID]});
    const url=f.fileList&&f.fileList[0]&&f.fileList[0].tempFileURL;
    if(url)this.setData({avatarSrc:url});
   }catch(e){console.warn('[profile:avatar]',e);}
  }
 },
 openRegister(){wx.navigateTo({url:'/pages/register/index'});},
 editProfile(){wx.navigateTo({url:'/pages/register/index?mode=edit'});},
 openAdmin(){wx.navigateTo({url:'/pages/admin-highlights/index'});},
 openChampionAdmin(){wx.navigateTo({url:'/pages/admin-champions/index'});},
 openHighlights(){wx.navigateTo({url:'/pages/highlights/index'});},
 openChampion(e){wx.navigateTo({url:'/pages/moment/index?type=champion&id='+encodeURIComponent(e.currentTarget.dataset.id)});}
});
