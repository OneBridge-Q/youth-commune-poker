Page({
 data:{registered:false,nickname:'新会员',memberNo:'',avatarSrc:'',skillPoints:0,rewardPoints:0,rank:'待评级',loading:false,error:''},
 async onShow(){
  this.setData({loading:true,error:'',avatarSrc:''});
  try{
   const r=await wx.cloud.callFunction({name:'memberHome'});
   const result=r.result||{},m=result.member||{};
   this.setData({
    registered:!!result.registered,nickname:m.nickname||'新会员',
    memberNo:m.memberNo||'',skillPoints:m.skillPoints||0,
    rewardPoints:m.rewardPoints||0,rank:m.rank||'待评级'
   });
   if(m.avatarFileID){
    try{
     const f=await wx.cloud.getTempFileURL({fileList:[m.avatarFileID]});
     const url=f.fileList&&f.fileList[0]&&f.fileList[0].tempFileURL;
     if(url)this.setData({avatarSrc:url});
    }catch(e){console.warn('[home:avatar]',e);}
   }
  }catch(e){this.setData({error:'连接失败，请检查云环境及云函数'});}
  finally{this.setData({loading:false});}
 },
 goRegister(){wx.navigateTo({url:'/pages/register/index'});},
 goHighlights(){wx.navigateTo({url:'/pages/highlights/index'});}
});
