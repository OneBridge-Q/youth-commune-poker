function shareTitle(a){return ('红圈青年｜'+a.title+' · '+a.startDate+' '+a.startTime).slice(0,80);}
function safePreview(v,max){return typeof v==='string'?v.slice(0,max):'';}
Page({
 data:{timelinePreview:false,previewTitle:'',previewDate:'',previewLocation:'',id:'',activity:null,myStatus:'none',loading:true,busy:false,error:'',feedbackStatus:'closed',sendingFeedback:false,games:[
  {name:'结对德州',selected:false,rating:0},{name:'明牌德州',selected:false,rating:0},{name:'技能德州',selected:false,rating:0}
 ],ratings:[1,2,3,4,5]},
 onLoad:function(o){o=o||{};var entry=typeof wx.getEnterOptionsSync==='function'?wx.getEnterOptionsSync():wx.getLaunchOptionsSync();var preview=entry&&entry.scene===1154;this.setData({id:o.id||'',timelinePreview:!!preview,previewTitle:safePreview(o.title,60),previewDate:safePreview(o.date,30),previewLocation:safePreview(o.location,120),loading:!preview});if(!preview&&wx.hideShareMenu)wx.hideShareMenu({menus:['shareAppMessage','shareTimeline']});},
 onShow:function(){if(this.data.id&&!this.data.timelinePreview)this.load();},
 onHide:function(){this._seq=(this._seq||0)+1;},
 load:function(){
  var page=this,seq=(page._seq||0)+1;page._seq=seq;page.setData({loading:true,error:'',activity:null});if(wx.hideShareMenu)wx.hideShareMenu({menus:['shareAppMessage','shareTimeline']});
  wx.cloud.callFunction({name:'activityMember',data:{action:'detail',id:page.data.id}}).then(function(r){
   if(seq!==page._seq)return;var v=r.result||{};page.setData({activity:v.activity||null,myStatus:v.myStatus||'none',feedbackStatus:v.feedbackStatus||'closed',loading:false});if(v.activity&&v.activity.status==='published'&&!v.activity.isTest&&wx.showShareMenu)wx.showShareMenu({menus:['shareAppMessage','shareTimeline']});else if(wx.hideShareMenu)wx.hideShareMenu({menus:['shareAppMessage','shareTimeline']});
  }).catch(function(){if(seq===page._seq)page.setData({loading:false,error:'活动已下架或暂时无法加载'});});
 },
 apply:function(){var page=this;if(page.data.busy||!page.data.activity)return;if(page.data.activity.feeFen>0)return wx.showToast({title:'支付尚未开通',icon:'none'});page.setData({busy:true});
  wx.cloud.callFunction({name:'activityMember',data:{action:'apply',id:page.data.id}}).then(function(r){if(!r.result||r.result.status!=='applied')throw Error('SIGNUP_NOT_CONFIRMED');wx.showToast({title:'报名成功'});page.load();}).catch(function(e){
   var text=String(e.errMsg||e.message||'');wx.showModal({title:'报名失败',content:text.indexOf('REGISTER_REQUIRED')>=0?'请先完成会员注册':text.indexOf('ACTIVITY_FULL')>=0?'报名人数已满':text.indexOf('PAYMENT_NOT_AVAILABLE')>=0?'微信支付尚未开通':text.indexOf('ACTIVITY_ENDED')>=0?'活动已开始，不能再报名':'暂时无法报名，请联系组织者或重试',showCancel:false});
  }).then(function(){page.setData({busy:false});});
 },
 cancel:function(){var page=this;if(page.data.busy)return;
  wx.showModal({title:'取消报名',content:'确认取消这次活动报名吗？',success:function(result){
   if(!result.confirm)return;page.setData({busy:true});
   wx.cloud.callFunction({name:'activityMember',data:{action:'cancel',id:page.data.id}}).then(function(){wx.showToast({title:'已取消报名'});page.load();}).catch(function(e){
    var text=String(e.errMsg||e.message||'');wx.showModal({title:'取消未完成',content:text.indexOf('CHECKED_IN_CONTACT_ADMIN')>=0?'你已签到，不能直接取消报名。如为误签，请联系管理员先撤销签到。':'操作未确认成功，请刷新活动后重试。',showCancel:false});page.load();
   }).then(function(){page.setData({busy:false});});
  }});
 },
 chooseGames:function(e){
  const selected=e.detail.value;
  this.setData({games:this.data.games.map(game=>Object.assign({},game,{selected:selected.includes(game.name)}))});
 },
 rateGame:function(e){
  const {game,rating}=e.currentTarget.dataset;
  this.setData({['games['+game+'].rating']:Number(rating)});
 },
 submitFeedback:function(){
  if(this.data.sendingFeedback)return;
  const answers=this.data.games.filter(game=>game.selected).map(game=>({game:game.name,rating:game.rating}));
  if(!answers.length||answers.some(answer=>!answer.rating)){
   wx.showToast({title:'请选择玩法并逐项评分',icon:'none'});
   return;
  }
  this.setData({sendingFeedback:true});
  wx.cloud.callFunction({name:'activityMember',data:{action:'feedback',id:this.data.id,answers}}).then(result=>{
   if(!result.result||result.result.feedbackStatus!=='submitted')throw Error('FEEDBACK_NOT_SAVED');
   this.setData({feedbackStatus:'submitted'});
   wx.showToast({title:'评价已提交'});
  }).catch(()=>wx.showToast({title:'提交失败，请稍后重试',icon:'none'})).then(()=>this.setData({sendingFeedback:false}));
 },
 shareTimelineHint:function(){wx.showModal({title:'分享到朋友圈',content:'点击右上角「···」，选择「分享到朋友圈」。',showCancel:false});},
 onShareAppMessage:function(){var a=this.data.activity;if(!a||a.isTest||a.status!=='published')return {title:'红圈青年',path:'/pages/home/index'};var result={title:shareTitle(a),path:'/pages/activity-detail/index?id='+encodeURIComponent(a.id)};if(a.posterSrc)result.imageUrl=a.posterSrc;return result;},
 onShareTimeline:function(){var a=this.data.activity;if(!a||a.isTest||a.status!=='published')return {title:'红圈青年',query:''};var result={title:shareTitle(a),query:'id='+encodeURIComponent(a.id)+'&title='+encodeURIComponent(a.title)+'&date='+encodeURIComponent(a.startDate+' '+a.startTime)+'&location='+encodeURIComponent(a.location||'')};if(a.posterSrc)result.imageUrl=a.posterSrc;return result;},
 register:function(){wx.navigateTo({url:'/pages/register/index?activityId='+encodeURIComponent(this.data.id)});}
});
