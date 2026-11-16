var club=require('../../utils/club-home');
Page({
 data:{activities:[],loading:false,error:'',categories:['全部','社交交流','知识分享','户外运动','创业共创','其他'],selected:'全部',visible:[],product:null},
 onLoad:function(options){var p=club.findProduct(options.product);if(p)this.setData({product:p});},
 onShow:function(){this.load();},
 chooseCategory:function(e){this.setData({selected:e.currentTarget.dataset.value,product:null});this.filter();},
 clearProduct:function(){this.setData({product:null,selected:'全部'});this.filter();},
 filter:function(){
  var category=this.data.selected,id=this.data.product&&this.data.product.id;
  var rows=this.data.activities.filter(function(a){return (category==='全部'||a.category===category)&&(!id||club.matches(a,id));});
  if(id)rows=club.upcoming(rows,Date.now());
  this.setData({visible:rows});
 },
 load:function(){
  var page=this;page.setData({loading:true,error:''});
  wx.cloud.callFunction({name:'activityMember',data:{action:'list'}}).then(function(res){page.setData({activities:(res.result&&res.result.activities)||[],loading:false});page.filter();})
   .catch(function(e){console.error('[activities:list]',e);page.setData({loading:false,error:'活动加载失败，请检查云函数和数据库集合'});});
 },
 open:function(e){wx.navigateTo({url:'/pages/activity-detail/index?id='+encodeURIComponent(e.currentTarget.dataset.id)});}
});
