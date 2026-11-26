function displayScore(value){return typeof value==='number'&&isFinite(value)?String(value):'0';}
Page({
 data:{loading:true,error:'',registered:false,nickname:'',avatarSrc:'',initial:'圈',skillDisplay:'—',charmDisplay:'—',isAdmin:false,adminExpanded:true,champions:[],championPreview:[],recapLabels:[],myActivities:[],activityPreview:[],showAllActivities:false,showAllChampions:false,activitiesLoading:false,activitiesError:'',championsLoading:false,championsError:''},
 onLoad:function(){wx.setNavigationBarTitle({title:'我的 · 红圈青年'});},
 onShow:function(){this.loadProfile();},
 onHide:function(){this._seq=(this._seq||0)+1;},
 onUnload:function(){this._seq=(this._seq||0)+1;},
 loadProfile:function(){
  var page=this,seq=(page._seq||0)+1;page._seq=seq;
  page.setData({loading:true,error:'',registered:false,isAdmin:false,avatarSrc:'',nickname:'',skillDisplay:'—',charmDisplay:'—',champions:[],championPreview:[],recapLabels:[],myActivities:[],activityPreview:[],activitiesError:'',championsError:''});
  wx.cloud.callFunction({name:'memberHome'}).then(function(response){
   if(seq!==page._seq)return;
   var result=response.result||{},m=result.member||{};
   if(typeof result.registered!=='boolean')throw Error('INVALID_MEMBER_RESPONSE');
   var name=m.nickname||'红圈会员';
   page.setData({loading:false,registered:result.registered,nickname:name,initial:Array.from(name)[0]||'圈',skillDisplay:displayScore(m.skillPoints),charmDisplay:displayScore(m.rewardPoints)});
   if(!result.registered)return;
   if(m.avatarFileID){
    wx.cloud.getTempFileURL({fileList:[m.avatarFileID]}).then(function(f){var file=f.fileList&&f.fileList[0];if(seq===page._seq&&file&&file.tempFileURL)page.setData({avatarSrc:file.tempFileURL});}).catch(function(){/* An unavailable avatar must not hide the member card. */});
   }
   page.loadMyActivities(seq);page.loadChampions(seq);
   wx.cloud.callFunction({name:'adminProfile'}).then(function(r){if(seq===page._seq)page.setData({isAdmin:!!(r.result&&['admin','superadmin'].indexOf(r.result.role)>=0)});}).catch(function(){if(seq===page._seq)page.setData({isAdmin:false});});
  }).catch(function(){if(seq===page._seq)page.setData({loading:false,error:'个人资料暂未加载，请重试。',isAdmin:false});});
 },
 loadMyActivities:function(seq){
  var page=this;page.setData({activitiesLoading:true,activitiesError:''});
  wx.cloud.callFunction({name:'activityMember',data:{action:'mine'}}).then(function(r){
   if(seq!==page._seq)return;var rows=(r.result&&r.result.applications)||[];
   page.setData({recapLabels:(r.result&&r.result.recapLabels)||[],myActivities:rows,activityPreview:page.data.showAllActivities?rows:rows.slice(0,3),activitiesLoading:false});
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
 openRegister:function(){wx.navigateTo({url:'/pages/register/index'});},
 editProfile:function(){wx.navigateTo({url:'/pages/register/index?mode=edit'});},
 openCharisma:function(){wx.navigateTo({url:'/pages/charisma/index'});},
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
