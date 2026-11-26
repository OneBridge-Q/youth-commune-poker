Page({
 data:{loading:true,registered:false,attended:0,error:''},
 onShow(){this.load();},
 onUnload(){this._seq=(this._seq||0)+1;},
 async load(){
  const seq=(this._seq||0)+1;
  this._seq=seq;
  this.setData({loading:true,error:''});
  try{
   const profile=await wx.cloud.callFunction({name:'memberHome'});
   if(this._seq!==seq)return;
   if(typeof profile.result?.registered!=='boolean')throw Error('INVALID_MEMBER_RESPONSE');
   if(!profile.result.registered){
    this.setData({loading:false,registered:false});
    return;
   }
   const response=await wx.cloud.callFunction({name:'activityMember',data:{action:'mine'}});
   if(this._seq!==seq)return;
   const attended=response.result?.formalAttended;
   if(!Number.isInteger(attended)||attended<0)throw Error('ATTENDANCE_COUNT_UNAVAILABLE');
   this.setData({loading:false,registered:true,attended});
  }catch(e){
   if(this._seq===seq)this.setData({loading:false,error:'签到次数暂时无法加载。'});
  }
 },
 register(){wx.navigateTo({url:'/pages/register/index'});}
});
