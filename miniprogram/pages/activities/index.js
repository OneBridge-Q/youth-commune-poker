Page({
 data:{activities:[],loading:false,error:'',categories:['全部','社交交流','知识分享','户外运动','创业共创','其他'],selected:'全部',visible:[]},
 onShow:function(){this.load();},
 chooseCategory:function(e){this.setData({selected:e.currentTarget.dataset.value});this.filter();},
 filter:function(){
  var category=this.data.selected,all=this.data.activities;
  this.setData({visible:category==='全部'?all:all.filter(function(a){return a.category===category;})});
 },
 load:function(){
  var page=this;page.setData({loading:true,error:''});
  wx.cloud.callFunction({name:'activityMember',data:{action:'list'}}).then(function(res){
   var activities=(res.result&&res.result.activities)||[];
   page.setData({activities:activities,loading:false});
   page.filter();

  }).catch(function(e){console.error('[activities:list]',e);page.setData({loading:false,error:'活动加载失败，请检查云函数和数据库集合'});});
 },
 open:function(e){wx.navigateTo({url:'/pages/activity-detail/index?id='+encodeURIComponent(e.currentTarget.dataset.id)});}
});
