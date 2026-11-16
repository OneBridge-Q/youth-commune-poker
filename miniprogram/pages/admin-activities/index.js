Page({
 data:{title:'',description:'',location:'',date:'',time:'19:30',categories:['社交交流','知识分享','户外运动','创业共创','其他'],categoryIndex:0,activities:[],loading:false,busy:false,error:'',posterLocalPath:'',posterExt:'jpg',isTest:false},
 onLoad:function(){this.setData({date:new Date(Date.now()+86400000+28800000).toISOString().slice(0,10)});},
 onShow:function(){this.load();},
 onTitle:function(e){this.setData({title:e.detail.value});},onDescription:function(e){this.setData({description:e.detail.value});},onLocation:function(e){this.setData({location:e.detail.value});},onDate:function(e){this.setData({date:e.detail.value});},onTime:function(e){this.setData({time:e.detail.value});},onCategory:function(e){this.setData({categoryIndex:Number(e.detail.value)});},onTest:function(e){this.setData({isTest:!!e.detail.value});},
 choosePoster:function(){
  var page=this;if(page.data.busy)return;
  wx.chooseMedia({count:1,mediaType:['image'],sourceType:['album','camera'],sizeType:['compressed'],success:function(res){
   var file=res.tempFiles&&res.tempFiles[0];if(!file||!file.tempFilePath)return;
   if(file.size>5*1024*1024)return wx.showModal({title:'图片过大',content:'请选择不超过5MB的活动海报',showCancel:false});
   var extMatch=file.tempFilePath.match(/\.(png|jpe?g|webp)(?:\?|$)/i),ext=extMatch?extMatch[1].toLowerCase():'jpg';if(ext==='jpeg')ext='jpg';page.setData({posterLocalPath:file.tempFilePath,posterExt:ext});
  }});
 },
 removePoster:function(){if(!this.data.busy)this.setData({posterLocalPath:''});},
 load:function(){var page=this;page.setData({loading:true,error:''});
  wx.cloud.callFunction({name:'activityAdmin',data:{action:'list'}}).then(function(r){page.setData({activities:(r.result&&r.result.activities)||[],loading:false});}).catch(function(e){console.error('[admin:activities:list]',e);page.setData({loading:false,error:'无法加载活动，请检查管理员权限及云函数部署'});});
 },
 create:function(){
  var page=this;if(page.data.busy)return;
  if(!page.data.title.trim()||!page.data.location.trim()||!page.data.date)return wx.showToast({title:'请填写活动名称、日期和地点',icon:'none'});
  var request={action:'create',title:page.data.title.trim(),description:page.data.description.trim(),location:page.data.location.trim(),startDate:page.data.date,startTime:page.data.time,category:page.data.categories[page.data.categoryIndex],posterFileID:'',isTest:page.data.isTest};
  page.setData({busy:true});var upload=Promise.resolve();
  if(page.data.posterLocalPath)upload=wx.cloud.uploadFile({cloudPath:'activity-posters/cover_'+Date.now()+'_'+Math.random().toString(36).slice(2,12)+'.'+page.data.posterExt,filePath:page.data.posterLocalPath}).then(function(r){if(!r.fileID)throw Error('POSTER_UPLOAD_FAILED');request.posterFileID=r.fileID;});
  upload.then(function(){return wx.cloud.callFunction({name:'activityAdmin',data:request});}).then(function(r){if(!r.result||!r.result.id)throw Error('CREATE_FAILED');wx.showToast({title:'草稿已创建'});page.setData({title:'',description:'',location:'',posterLocalPath:'',isTest:false});page.load();}).catch(function(e){console.error('[admin:activities:create]',e);wx.showModal({title:'创建失败',content:'请检查活动日期、图片上传、云函数与数据库。',showCancel:false});}).then(function(){page.setData({busy:false});});
 },
 act:function(e){
  var page=this,action=e.currentTarget.dataset.action,id=e.currentTarget.dataset.id;if(page.data.busy)return;
  var text=action==='publish'?'确认发布活动，让会员可以报名？':action==='markTest'?'确认仅用于联调？标记后不计正式成长，本入口不支持恢复成正式活动。':'确认取消此活动？';
  wx.showModal({title:'活动操作',content:text,success:function(result){if(!result.confirm)return;page.setData({busy:true});
   wx.cloud.callFunction({name:'activityAdmin',data:{action:action,id:id}}).then(function(){wx.showToast({title:'操作成功'});page.load();}).catch(function(err){console.error('[admin:activities]',err);wx.showToast({title:'操作失败',icon:'none'});}).then(function(){page.setData({busy:false});});
  }});
 },
 viewSignups:function(e){if(e.currentTarget.dataset.id)wx.navigateTo({url:'/pages/admin-attendance/index?id='+encodeURIComponent(e.currentTarget.dataset.id)});}
});
