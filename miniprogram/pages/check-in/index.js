Page({
 data:{manage:false,registered:false,loading:true,busy:false,error:'',day:'',codePath:'',done:''},
 onLoad(options={}){
  this.token=this.readToken(options.scene);
  this.setData({manage:options.manage==='1'});
 },
 onShow(){
  if(this.data.manage)this.loadCode();
  else this.loadStatus();
 },
 onHide(){if(this.data.manage)this.setData({codePath:'',day:''});},
 onUnload(){clearTimeout(this.expiryTimer);},
 readToken(value){
  try{
   const token=decodeURIComponent(value||'');
   return /^[a-f0-9]{32}$/.test(token)?token:'';
  }catch(e){return '';}
 },
 async loadStatus(){
  this.setData({loading:true,error:''});
  try{
   const {result}=await wx.cloud.callFunction({name:'activityAttendance',data:{action:'storeCheckInStatus'}});
   if(!result||typeof result.registered!=='boolean')throw Error('STATUS_UNAVAILABLE');
   this.setData({registered:result.registered});
   if(result.registered&&this.token)await this.checkIn();
  }catch(e){this.setData({error:'暂时无法打开门店签到，请重试。'});}
  finally{this.setData({loading:false});}
 },
 register(){
  wx.navigateTo({url:'/pages/register/index?from=check-in'+(this.token?'&scene='+this.token:'')});
 },
 scan(){
  wx.scanCode({onlyFromCamera:true,success:scan=>{
   const scene=String(scan.path||'').match(/(?:\?|&)scene=([^&]+)/);
   const token=scene&&this.readToken(scene[1]);
   if(!token)return wx.showToast({title:'请扫描红圈门店签到码',icon:'none'});
   this.token=token;
   this.setData({done:'',error:''});
   if(this.data.registered)this.checkIn();
   else this.register();
  }});
 },
 async checkIn(){
  if(this.data.busy)return;
  this.setData({busy:true,error:''});
  try{
   const {result}=await wx.cloud.callFunction({name:'activityAttendance',data:{action:'storeCheckIn',token:this.token}});
   if(!result||!['checked_in','already_checked_in'].includes(result.status))throw Error('CHECK_IN_FAILED');
   this.token='';
   this.setData({done:result.status==='checked_in'?'签到成功 · 魅力值 +1':'今天已签到'});
  }catch(e){
   const error=String(e.errMsg||e.message||e);
   if(error.includes('STORE_CODE_EXPIRED'))this.token='';
   this.setData({error:error.includes('STORE_CODE_EXPIRED')?'签到码已过期，请扫门店当天的新码。':'签到暂未完成，请重试。'});
  }finally{this.setData({busy:false});}
 },
 async loadCode(){
  if(this.data.busy)return;
  this.setData({busy:true,loading:true,error:'',codePath:''});
  try{
   const envVersion=wx.getAccountInfoSync().miniProgram.envVersion;
   const {result}=await wx.cloud.callFunction({name:'activityAttendance',data:{action:'storeCheckInCode',envVersion}});
   if(!result||!result.image)throw Error('CODE_UNAVAILABLE');
   const filePath=wx.env.USER_DATA_PATH+'/redcircle-store-checkin-'+result.day+'.jpg';
   wx.getFileSystemManager().writeFileSync(filePath,result.image,'base64');
   this.setData({day:result.day,codePath:filePath});
   const nextDay=Date.parse(result.day+'T00:00:00+08:00')+86400000;
   clearTimeout(this.expiryTimer);
   this.expiryTimer=setTimeout(()=>this.loadCode(),Math.max(1000,nextDay-Date.now()+1000));
  }catch(e){this.setData({error:'签到码生成失败，请确认管理员权限、云函数和小程序码配置。'});}
  finally{this.setData({busy:false,loading:false});}
 }
});
