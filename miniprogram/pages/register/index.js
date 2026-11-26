const POLICY_VERSION='v0.4-2026-11-15';
Page({
 data:{activityId:'',nickname:'',agreed:false,avatarPreview:'',avatarLocalPath:'',submitting:false,error:'',isEditing:false},
 async onLoad(options){
  if(options&&typeof options.activityId==='string'&&options.activityId.length<=128)this.setData({activityId:options.activityId});
  if(options&&options.from==='check-in'){
   this._returnToCheckIn=true;
   this._checkInScene=/^[a-f0-9]{32}$/.test(options.scene||'')?'?scene='+options.scene:'';
  }
  if(options&&options.mode==='edit'){
   this.setData({isEditing:true});
   try{
    const r=await wx.cloud.callFunction({name:'memberHome'}),result=r.result||{},m=result.member||{};
    if(!result.registered)return wx.redirectTo({url:'/pages/register/index'});
    this.setData({nickname:m.nickname||''});
    if(m.avatarFileID){
     const a=await wx.cloud.getTempFileURL({fileList:[m.avatarFileID]});
     if(a.fileList&&a.fileList[0]&&a.fileList[0].tempFileURL)this.setData({avatarPreview:a.fileList[0].tempFileURL});
    }
   }catch(e){console.warn('[profileEdit:load]',e);}
  }
 },
 onChooseAvatar(e){
  const path=e.detail&&e.detail.avatarUrl;
  if(path)this.setData({avatarLocalPath:path,avatarPreview:path,error:''});
 },
 onNickname(e){this.setData({nickname:e.detail.value,error:''});},
 onConsent(e){this.setData({agreed:e.detail.value.indexOf('agreed')>=0,error:''});},
 async onSubmit(e){
  const value=(e.detail&&e.detail.value&&e.detail.value.nickname)||this.data.nickname;
  const nickname=String(value||'').trim();
  if(Array.from(nickname).length<2||Array.from(nickname).length>16){
   return this.setData({error:'请输入2至16个字符的昵称'});
  }
  if(!this.data.isEditing&&!this.data.agreed)return this.setData({error:'请先阅读并确认会员注册说明'});
  if(this.data.submitting)return;
  this.setData({submitting:true,error:''});
  try{
   const request={nickname};
   if(this.data.isEditing)request.action='updateProfile';
   else{request.consent=true;request.policyVersion=POLICY_VERSION;}
   if(this.data.avatarLocalPath){
    const extMatch=this.data.avatarLocalPath.match(/\.(png|jpe?g|webp)(?:\?|$)/i);
    const ext=extMatch?extMatch[1].toLowerCase():'png';
    const cloudPath='member-avatars/ava_'+Date.now()+'_'+Math.random().toString(36).slice(2,12)+'.'+ext;
    const upload=await wx.cloud.uploadFile({cloudPath,filePath:this.data.avatarLocalPath});
    if(!upload.fileID)throw Error('AVATAR_UPLOAD_FAILED');
    request.avatarFileID=upload.fileID;
   }
   const res=await wx.cloud.callFunction({name:'memberRegister',data:request});
   if(this.data.isEditing){
    if(!res.result||!res.result.updated)throw Error('PROFILE_UPDATE_FAILED');
   }else if(!res.result||!res.result.registered)throw Error('REGISTER_NO_RESULT');
   wx.showToast({title:this.data.isEditing?'保存成功':'注册成功',icon:'success'});
   setTimeout(()=>{
    if(!this.data.isEditing&&this._returnToCheckIn){
     wx.navigateBack({delta:1,fail:()=>wx.redirectTo({url:'/pages/check-in/index'+this._checkInScene})});
     return;
    }
    if(!this.data.isEditing&&this.data.activityId){wx.navigateBack({delta:1,fail:()=>wx.redirectTo({url:'/pages/activity-detail/index?id='+encodeURIComponent(this.data.activityId)})});}else wx.switchTab({url:this.data.isEditing?'/pages/profile/index':'/pages/home/index'});},450);
  }catch(e){
   console.error('[memberRegister:profile]',e);
   const msg=String((e&&(e.errMsg||e.message))||e);
   const error=msg.includes('INVALID_NICKNAME')?'昵称格式不正确':
    msg.includes('CONSENT_REQUIRED')?'请确认会员注册说明':
    msg.includes('INVALID_AVATAR')?'头像文件无效':
    msg.includes('AVATAR_UPLOAD_FAILED')||msg.includes('uploadFile')?'头像上传失败，请重试或暂不选择头像':
    msg.includes('REGISTER_REQUIRED')?'请先完成会员注册':'保存失败，请检查云函数、网络与数据库';
   this.setData({error});
  }finally{this.setData({submitting:false});}
 }
});
