const SIGNED_OUT='redcircle:signed-out';
function displayScore(value){return typeof value==='number'&&isFinite(value)?String(value):'0';}
Page({
 data:{loading:true,error:'',registered:false,nickname:'',avatarSrc:'',initial:'圈',skillDisplay:'—',charmDisplay:'—',isAdmin:false,adminExpanded:true,champions:[],championPreview:[],recapLabels:[],myActivities:[],activityPreview:[],showAllActivities:false,showAllChampions:false,activitiesLoading:false,activitiesError:'',championsLoading:false,championsError:''},
 onLoad:function(){wx.setNavigationBarTitle({title:'我的 · 红圈青年'});},
 onShow:function(){this.loadProfile();},
 onHide:function(){clearTimeout(this._codeTimer);this._seq=(this._seq||0)+1;},
 onUnload:function(){clearTimeout(this._codeTimer);this._seq=(this._seq||0)+1;},
 loadProfile:function(){
  var page=this,seq=(page._seq||0)+1;page._seq=seq;
  page.setData({adminCode:'',adminCodeError:false,loading:true,error:'',registered:false,isAdmin:false,avatarSrc:'',nickname:'',skillDisplay:'—',charmDisplay:'—',champions:[],championPreview:[],recapLabels:[],myActivities:[],activityPreview:[],activitiesError:'',championsError:''});
  if(wx.getStorageSync(SIGNED_OUT)){
   page.setData({loading:false,signedOut:true});
   return;
  }
  page.setData({signedOut:false});
  wx.cloud.callFunction({name:'memberHome'}).then(function(response){
   if(seq!==page._seq)return;
   var result=response.result||{},m=result.member||{};
   if(typeof result.registered!=='boolean')throw Error('INVALID_MEMBER_RESPONSE');
   var name=m.nickname||'红圈会员';
   page.setData({loading:false,registered:result.registered,nickname:name,closureRequested:m.closureRequested===true,initial:Array.from(name)[0]||'圈',skillDisplay:displayScore(m.skillPoints)});
   if(!result.registered)return;
   if(m.avatarFileID){
    wx.cloud.getTempFileURL({fileList:[m.avatarFileID]}).then(function(f){var file=f.fileList&&f.fileList[0];if(seq===page._seq&&file&&file.tempFileURL)page.setData({avatarSrc:file.tempFileURL});}).catch(function(){/* An unavailable avatar must not hide the member card. */});
   }
   page.loadStoreCheckInCount(seq);page.loadMyActivities(seq);page.loadChampions(seq);
   wx.cloud.callFunction({name:'adminProfile'}).then(function(r){if(seq!==page._seq)return;
    const isAdmin=!!(r.result&&['admin','superadmin'].includes(r.result.role));
    page.setData({isAdmin});
    if(isAdmin)page.loadAdminCode();}).catch(function(){if(seq===page._seq)page.setData({isAdmin:false});});
  }).catch(function(){if(seq===page._seq)page.setData({loading:false,error:'个人资料暂未加载，请重试。',isAdmin:false});});
 },
 async loadAdminCode(){
  const seq=this._seq;
  this.setData({adminCode:'',adminCodeError:false});
  try{
   const envVersion=wx.getAccountInfoSync().miniProgram.envVersion;
   const {result}=await wx.cloud.callFunction({name:'activityAttendance',data:{action:'storeCheckInCode',envVersion}});
   if(seq!==this._seq)return;
   if(!result||!result.image||!/^\d{4}-\d{2}-\d{2}$/.test(result.day))throw Error('CODE_UNAVAILABLE');
   const file=wx.env.USER_DATA_PATH+'/redcircle-store-checkin-'+result.day+'.jpg';
   wx.getFileSystemManager().writeFileSync(file,result.image,'base64');
   this.setData({adminCode:file,adminCodeDay:result.day});
   clearTimeout(this._codeTimer);
   const expires=Date.parse(result.day+'T00:00:00+08:00')+86400000;
   this._codeTimer=setTimeout(()=>this.loadAdminCode(),Math.max(1000,expires-Date.now()+1000));
  }catch(e){if(seq===this._seq)this.setData({adminCodeError:true});}
 },
 loadStoreCheckInCount:function(seq){
  wx.cloud.callFunction({name:'activityAttendance',data:{action:'storeCheckInStatus'}}).then(r=>{
   const count=r.result&&r.result.count;
   if(seq===this._seq&&Number.isSafeInteger(count)&&count>=0)this.setData({charmDisplay:String(count)});
  }).catch(()=>{});
 },
 loadMyActivities:function(seq){
  var page=this;page.setData({activitiesLoading:true,activitiesError:''});
  wx.cloud.callFunction({name:'activityMember',data:{action:'mine'}}).then(function(r){
   if(seq!==page._seq)return;var result=r.result||{},rows=result.applications||[];
   page.setData({recapLabels:result.recapLabels||[],myActivities:rows,activityPreview:page.data.showAllActivities?rows:rows.slice(0,3),activitiesLoading:false});
  }).catch(function(){if(seq===page._seq)page.setData({activitiesLoading:false,activitiesError:'报名记录加载失败'});});
 },
 loadChampions:function(seq,offset){
  var page=this;
  if(offset&&page.data.championsLoading)return;
  page.setData({championsLoading:true,championsError:''});
  wx.cloud.callFunction({name:'championAdmin',data:{action:'mine',offset:offset||0}}).then(function(r){
   if(seq!==page._seq)return;
   var result=r.result||{},rows=(offset?page.data.champions:[]).concat(result.records||[]);
   page.setData({champions:rows,championPreview:page.data.showAllChampions?rows:rows.slice(0,3),
    championNextOffset:result.nextOffset||0,championsLoading:false});
  }).catch(function(){if(seq===page._seq)page.setData({championsLoading:false,championsError:'荣誉记录加载失败'});});
 },
 loadMoreChampions:function(){
  if(this.data.championNextOffset)this.loadChampions(this._seq,this.data.championNextOffset);
 },
 retryActivities:function(){this.loadMyActivities(this._seq);},
 retryChampions:function(){this.loadChampions(this._seq);},
 toggleActivities:function(){var show=!this.data.showAllActivities;this.setData({showAllActivities:show,activityPreview:show?this.data.myActivities:this.data.myActivities.slice(0,3)});},
 toggleChampions:function(){var show=!this.data.showAllChampions;this.setData({showAllChampions:show,championPreview:show?this.data.champions:this.data.champions.slice(0,3)});},
 toggleAdmin:function(){this.setData({adminExpanded:!this.data.adminExpanded});},
 onAvatarError:function(){this.setData({avatarSrc:''});},
 signIn:function(){
  wx.removeStorageSync(SIGNED_OUT);
  this.loadProfile();
 },
 signOut:function(){
  wx.showModal({
   title:'退出登录',content:'退出后可用当前微信账号重新登录红圈。',
   success:r=>{
    if(!r.confirm)return;
    clearTimeout(this._codeTimer);
    wx.setStorageSync(SIGNED_OUT,true);
    this.loadProfile();
   }
  });
 },
 requestClosure:function(){
  if(this.data.closureRequested||this.data.closureBusy)return;
  wx.showModal({
   title:'申请注销账户',content:'确认提交注销申请？申请提交后账户进入待处理状态。',
   confirmText:'提交申请',confirmColor:'#a83232',
   success:async r=>{
    if(!r.confirm||this.data.closureBusy)return;
    this.setData({closureBusy:true});
    try{
     const {result}=await wx.cloud.callFunction({name:'memberHome',data:{action:'requestClosure',confirm:true}});
     if(!result||result.requested!==true)throw Error('CLOSURE_REQUEST_FAILED');
     this.setData({closureRequested:true});
     wx.showToast({title:'注销申请已提交',icon:'none'});
    }catch(e){wx.showToast({title:'提交失败，请重试',icon:'none'});}
    finally{this.setData({closureBusy:false});}
   }
  });
 },
 openRegister:function(){wx.navigateTo({url:'/pages/register/index'});},
 editProfile:function(){wx.navigateTo({url:'/pages/register/index?mode=edit'});},
 openGrowth:function(){wx.navigateTo({url:'/pages/growth/index'});},
 openActivities:function(){wx.navigateTo({url:'/pages/activities/index'});},
 openActivity:function(e){if(e.currentTarget.dataset.id)wx.navigateTo({url:'/pages/activity-detail/index?id='+encodeURIComponent(e.currentTarget.dataset.id)});},
 openHighlights:function(){wx.navigateTo({url:'/pages/highlights/index'});},
 openChampion:function(e){if(e.currentTarget.dataset.id)wx.navigateTo({url:'/pages/moment/index?type=champion&id='+encodeURIComponent(e.currentTarget.dataset.id)});},
 openAdmin:function(){wx.navigateTo({url:'/pages/admin-highlights/index'});},
 openChampionAdmin:function(){wx.navigateTo({url:'/pages/admin-champions/index'});},
 openActivityAdmin:function(){wx.navigateTo({url:'/pages/admin-activities/index?mode=manage'});},
 openActivityCreate:function(){wx.navigateTo({url:'/pages/admin-activities/index?mode=create'});},
 openRecapAdmin:function(){wx.navigateTo({url:'/pages/admin-recaps/index'});}
});
