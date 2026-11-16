Page({
 data:{title:'',description:'',location:'',date:'',time:'19:30',categories:['社交交流','知识分享','户外运动','创业共创','其他'],categoryIndex:0,activities:[],loading:false,busy:false,error:'',posterLocalPath:''},
 onLoad:function(){this.setData({date:new Date(Date.now()+86400000).toISOString().slice(0,10)});},
 onShow:function(){this.load();},
 onTitle:function(e){this.setData({title:e.detail.value});},
 onDescription:function(e){this.setData({description:e.detail.value});},
 onLocation:function(e){this.setData({location:e.detail.value});},
 onDate:function(e){this.setData({date:e.detail.value});},
 onTime:function(e){this.setData({time:e.detail.value});},
 onCategory:function(e){this.setData({categoryIndex:Number(e.detail.value)});},
 choosePoster:function(){
  var page=this;
  wx.chooseMedia({count:1,mediaType:['image'],sourceType:['album','camera'],sizeType:['compressed'],success:function(res){
   var file=res.tempFiles&&res.tempFiles[0];
   if(!file||!file.tempFilePath)return;
   if(file.size>5*1024*1024)return wx.showModal({title:'图片过大',content:'请选择不超过5MB的活动海报',showCancel:false});
   page.setData({posterLocalPath:file.tempFilePath});
  }});
 },
 removePoster:function(){this.setData({posterLocalPath:''});},
 load:function(){
  var page=this;page.setData({loading:true,error:''});
  wx.cloud.callFunction({name:'activityAdmin',data:{action:'list'}}).then(function(r){
   page.setData({activities:(r.result&&r.result.activities)||[],loading:false});
  }).catch(function(e){console.error('[admin:activities:list]',e);page.setData({loading:false,error:'无法加载活动，请检查管理员权限及云函数部署'});});
 },
 create:function(){
  var page=this;if(page.data.busy)return;
  if(!page.data.title.trim()||!page.data.location.trim()||!page.data.date)return wx.showToast({title:'请填写活动名称、日期和地点',icon:'none'});
  page.setData({busy:true});
  var posterId='';
  var upload=Promise.resolve();
  if(page.data.posterLocalPath){
   upload=wx.cloud.uploadFile({cloudPath:'activity-posters/cover_'+Date.now()+'_'+Math.random().toString(36).slice(2,12)+'.jpg',filePath:page.data.posterLocalPath}).then(function(r){
    if(!r.fileID)throw Error('POSTER_UPLOAD_FAILED');
    posterId=r.fileID;
   });
  }
  upload.then(function(){return wx.cloud.callFunction({name:'activityAdmin',data:{action:'create',title:page.data.title.trim(),description:page.data.description.trim(),location:page.data.location.trim(),startDate:page.data.date,startTime:page.data.time,category:page.data.categories[page.data.categoryIndex],posterFileID:posterId}});}).then(function(r){
   if(!r.result||!r.result.id)throw Error('CREATE_FAILED');
   wx.showToast({title:'草稿已创建'});page.setData({title:'',description:'',location:'',posterLocalPath:''});page.load();
  }).catch(function(e){console.error('[admin:activities:create]',e);wx.showModal({title:'创建失败',content:String(e&&e.message||e).indexOf('POSTER')>=0||String(e&&e.errMsg||'').indexOf('upload')>=0?'海报上传失败，可重新选择图片或暂时不上传':'请确认活动日期在未来，以及云函数和数据库状态正常。',showCancel:false});}).then(function(){page.setData({busy:false});});
 },
 act:function(e){
  var page=this,action=e.currentTarget.dataset.action,id=e.currentTarget.dataset.id;
  var text=action==='publish'?'确认发布活动，让会员可以报名？':'确认取消此活动？';
  wx.showModal({title:'活动操作',content:text,success:function(result){
   if(!result.confirm)return;
   wx.cloud.callFunction({name:'activityAdmin',data:{action:action,id:id}}).then(function(){wx.showToast({title:'操作成功'});page.load();})
    .catch(function(err){console.error('[admin:activities:'+action+']',err);wx.showToast({title:'操作失败',icon:'none'});});
  }});
 },
 viewSignups:function(e){
  var id=e.currentTarget.dataset.id,page=this;
  wx.cloud.callFunction({name:'activityAdmin',data:{action:'applications',id:id}}).then(function(r){
   var result=r.result||{},people=result.applications||[];
   var names=people.map(function(x){return x.nickname+'（'+x.memberId+'）';}).join('\n');
   wx.showModal({title:'报名名单 · '+people.length+'人',content:names||'暂无报名',showCancel:false});
  }).catch(function(err){console.error('[admin:applications]',err);wx.showToast({title:'名单加载失败',icon:'none'});});
 }
});
