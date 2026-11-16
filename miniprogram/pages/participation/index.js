Page({
 data:{loading:true,error:'',tab:'attended',applications:[],participated:[],visible:[],limit:30},
 onShow:function(){this.load();},onHide:function(){this._seq=(this._seq||0)+1;},
 load:function(){var page=this,seq=(page._seq||0)+1;page._seq=seq;page.setData({loading:true,error:'',visible:[]});
  wx.cloud.callFunction({name:'activityMember',data:{action:'mine'}}).then(function(r){
   if(seq!==page._seq)return;var v=r.result||{};
   if(!Array.isArray(v.participated))throw Error('UPDATE_REQUIRED');
   page.setData({loading:false,applications:v.applications||[],participated:v.participated,limit:30});page.filter();
  }).catch(function(e){if(seq===page._seq)page.setData({loading:false,error:String(e.message||e.errMsg||'').indexOf('UPDATE_REQUIRED')>=0?'请重新部署 activityMember 云函数。':'活动记录加载失败，请重试。'});});
 },
 choose:function(e){this.setData({tab:e.currentTarget.dataset.tab,limit:30});this.filter();},
 filter:function(){var rows=this.data.tab==='attended'?this.data.participated:this.data.applications;this.setData({visible:rows.slice(0,this.data.limit),hasMore:rows.length>this.data.limit});},
 more:function(){this.setData({limit:this.data.limit+30});this.filter();},
 open:function(e){wx.navigateTo({url:'/pages/activity-detail/index?id='+encodeURIComponent(e.currentTarget.dataset.id)});}
});
