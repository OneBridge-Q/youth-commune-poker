const POLICY_VERSION = 'v0.4-2026-11-15';
Page({
 data:{nickname:'',agreed:false,submitting:false,error:''},
 onNickname(e){this.setData({nickname:e.detail.value,error:''});},
 onConsent(e){this.setData({agreed:e.detail.value.indexOf('agreed')>=0,error:''});},
 async submit(){
  const nickname=this.data.nickname.trim();
  if(Array.from(nickname).length<2||Array.from(nickname).length>16){
   return this.setData({error:'请输入2至16个字符的昵称'});
  }
  if(!this.data.agreed)return this.setData({error:'请先阅读并确认会员注册说明'});
  if(this.data.submitting)return;
  this.setData({submitting:true,error:''});
  try{
   const r=await wx.cloud.callFunction({name:'memberRegister',data:{
    nickname,consent:true,policyVersion:POLICY_VERSION
   }});
   if(!r.result||!r.result.registered)throw Error('REGISTER_NO_RESULT');
   wx.showToast({title:r.result.alreadyRegistered?'您已是会员':'注册成功',icon:'success'});
   setTimeout(()=>wx.switchTab({url:'/pages/home/index'}),400);
  }catch(e){
   console.error('[memberRegister]',e);
   const msg=String((e&&(e.errMsg||e.message))||e);
   this.setData({error:msg.includes('INVALID_NICKNAME')?'昵称格式不正确':msg.includes('CONSENT_REQUIRED')?'请同意会员注册说明':'注册失败，请检查网络、数据库及云函数'});
  }finally{this.setData({submitting:false});}
 }
});
