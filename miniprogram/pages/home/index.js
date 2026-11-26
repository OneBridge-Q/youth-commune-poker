var club=require('../../utils/club-home');
Page({
 data:{pillars:['全部','智力竞技','兴趣社交','青年共创'],selectedPillar:'全部',products:club.products,registered:false,nickname:'',memberLoading:true,memberError:'',events:[],eventsLoading:true,eventsError:'',recaps:[],recapsLoading:true,recapsError:''},
 onLoad:function(){wx.setNavigationBarTitle({title:'友德胜红圈青年'});},
 onShow:function(){this.loadHome();},
 onHide:function(){this._loadSeq=(this._loadSeq||0)+1;},
 onUnload:function(){this._loadSeq=(this._loadSeq||0)+1;},
 loadHome:function(){
  var page=this,seq=(page._loadSeq||0)+1;page._loadSeq=seq;
  page.setData({memberLoading:true,memberError:'',eventsLoading:true,eventsError:'',recapsLoading:true,recapsError:''});
  if(wx.getStorageSync('redcircle:signed-out')){
   page.setData({memberLoading:false,registered:false,nickname:''});
  }else wx.cloud.callFunction({name:'memberHome'}).then(function(r){
   if(seq!==page._loadSeq)return;var result=r.result||{},m=result.member||{};
   page.setData({memberLoading:false,registered:!!result.registered,nickname:m.nickname||'红圈会员'});
   if(result.registered)wx.cloud.callFunction({name:'memberIdentity'}).catch(function(){/* Optional identity sync cannot block the home page. */});
  }).catch(function(){if(seq===page._loadSeq)page.setData({memberLoading:false,memberError:'会员资料暂未加载，活动仍可浏览。'});});
  wx.cloud.callFunction({name:'activityMember',data:{action:'list'}}).then(function(r){
   if(seq!==page._loadSeq)return;
   page.setData({eventsLoading:false,events:club.upcoming((r.result&&r.result.activities)||[],Date.now()).slice(0,3)});
  }).catch(function(){if(seq===page._loadSeq)page.setData({eventsLoading:false,eventsError:'活动加载失败，请点击重试。'});});
  wx.cloud.callFunction({name:'activityRecaps',data:{action:'list'}}).then(function(r){
   if(seq!==page._loadSeq)return;
   page.setData({recapsLoading:false,recaps:(r.result&&r.result.recaps)||[]});
  }).catch(function(){if(seq===page._loadSeq)page.setData({recapsLoading:false,recapsError:'回顾暂未加载，请确认 activityRecaps 已部署。'});});
 },
 choosePillar:function(e){var p=e.currentTarget.dataset.pillar;if(this.data.pillars.indexOf(p)<0)return;this.setData({selectedPillar:p,products:p==='全部'?club.products:club.products.filter(function(x){return x.pillar===p;})});},
 openProduct:function(e){var id=e.currentTarget.dataset.id;if(club.findProduct(id))wx.navigateTo({url:'/pages/activities/index?product='+encodeURIComponent(id)});},
 openActivity:function(e){var id=e.currentTarget.dataset.id;if(id)wx.navigateTo({url:'/pages/activity-detail/index?id='+encodeURIComponent(id)});},
 previewRecap:function(e){var r=this.data.recaps[Number(e.currentTarget.dataset.index)],i=Number(e.currentTarget.dataset.photo);if(r&&r.photos&&r.photos.length)wx.previewImage({urls:r.photos,current:r.photos[i]||r.photos[0]});},
 onCoverError:function(e){var i=Number(e.currentTarget.dataset.index);if(Number.isInteger(i)&&this.data.events[i]){var patch={};patch['events['+i+'].posterSrc']='';this.setData(patch);}},
 goActivities:function(){wx.navigateTo({url:'/pages/activities/index'});},
 goCheckIn:function(){
  if(wx.getStorageSync('redcircle:signed-out'))return wx.switchTab({url:'/pages/profile/index'});
  if(this._scanning)return;
  this._scanning=true;
  wx.scanCode({
   onlyFromCamera:true,
   success:async scan=>{
    try{
     const scene=String(scan.path||'').match(/^\/?pages\/check-in\/index\?scene=([a-f0-9]{32})(?:&|$)/);
     if(!scene)return wx.showToast({title:'请扫描红圈门店签到码',icon:'none'});
     const token=scene[1];
     try{
      const {result}=await wx.cloud.callFunction({name:'activityAttendance',data:{action:'storeCheckIn',token}});
      if(!result||!['checked_in','already_checked_in'].includes(result.status))throw Error('CHECK_IN_FAILED');
      wx.showToast({title:result.status==='checked_in'?'签到成功 · 魅力值 +1':'今天已签到',icon:'none'});
     }catch(e){
      const error=String(e.errMsg||e.message||e);
      if(error.includes('REGISTER_REQUIRED')){
       return wx.navigateTo({url:'/pages/register/index?from=home-check-in&scene='+token});
      }
      wx.showToast({title:error.includes('STORE_CODE_EXPIRED')?'签到码已过期，请扫当天的新码':'签到暂未完成，请重试',icon:'none'});
     }
    }finally{this._scanning=false;}
   },
   fail:()=>{this._scanning=false;}
  });
 },
 onShareAppMessage:function(){return {title:'红圈青年｜智力竞技 · 兴趣社交 · 青年共创',path:'/pages/home/index'};}
});
