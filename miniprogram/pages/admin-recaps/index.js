Page({
 data:{activities:[],selectedIndex:-1,selected:null,title:'',body:'',photos:[],uploadDir:'',completed:false,consent:false,isTest:true,busy:false,loading:true,error:''},
 onShow:function(){this.load();},
 load:function(){
  var page=this;page.setData({loading:true,error:''});
  wx.cloud.callFunction({name:'activityRecaps',data:{action:'manage'}}).then(function(r){
   var result=r.result||{},rows=result.activities||[];rows.forEach(function(x){x.label=x.startDate+' · '+x.title;});
   var old=page.data.selected,id=old&&old.id,index=-1;
   rows.forEach(function(x,i){if(x.id===id)index=i;});
   page.setData({activities:rows,uploadDir:result.uploadDir||'',selectedIndex:index,selected:index>=0?rows[index]:null,loading:false});
  }).catch(function(){page.setData({loading:false,error:'无法加载回顾管理。请确认管理员权限和 activityRecaps 云函数部署。'});});
 },
 chooseActivity:function(e){var i=Number(e.detail.value),a=this.data.activities[i];if(!a)return;this.setData({selectedIndex:i,selected:a,title:a.recapTitle||a.title,body:a.recapBody||'',photos:[],completed:false,consent:false,isTest:a.recapStatus==='none'?true:!!a.isTest,error:''});},
 onTitle:function(e){this.setData({title:e.detail.value});},onBody:function(e){this.setData({body:e.detail.value});},
 onChecks:function(e){var v=e.detail.value||[];this.setData({completed:v.indexOf('completed')>=0,consent:v.indexOf('consent')>=0});},
 onTest:function(e){this.setData({isTest:!!e.detail.value});},
 choosePhotos:function(){
  var page=this;
  if(page.data.busy)return;
  wx.chooseMedia({
   count:3,
   mediaType:['image'],
   sourceType:['album'],
   sizeType:['compressed'],
   success:function(r){
    var files=r.tempFiles||[];
    if(!files.length)return;
    if(files.some(function(file){
     return !file.tempFilePath||file.size>5*1024*1024;
    })){
     page.setData({error:'请选择每张不超过5MB的图片。'});
     return;
    }
    // Keep the map callback and Promise executor separate to avoid mismatched closures.
    var imageChecks=files.map(function(file){
     return new Promise(function(resolve,reject){
      wx.getImageInfo({
       src:file.tempFilePath,
       success:function(info){
        var ext=String(info.type||'').toLowerCase();
        if(ext==='jpeg')ext='jpg';
        if(['jpg','png','webp'].indexOf(ext)<0){
         reject(Error('UNSUPPORTED_IMAGE'));
         return;
        }
        resolve({path:file.tempFilePath,ext:ext});
       },
       fail:reject
      });
     });
    });
    Promise.all(imageChecks).then(function(photos){
     page.setData({photos:photos,error:''});
    }).catch(function(){
     page.setData({error:'请使用 JPG、PNG 或 WebP 图片。'});
    });
   },
   fail:function(e){
    if(String(e.errMsg||'').indexOf('cancel')<0){
     page.setData({error:'无法选择照片，请检查相册权限。'});
    }
   }
  });
 },
 save:function(){
  var page=this,a=page.data.selected;if(page.data.busy)return;
  if(!a||!a.canPublish)return page.setData({error:'请选择已经开始、并确认实际结束的已发布活动。'});
  if(!page.data.title.trim()||!page.data.body.trim()||!page.data.photos.length)return page.setData({error:'请填写标题、回顾文字，并选择1至3张照片。'});
  if(!page.data.completed||!page.data.consent)return page.setData({error:'请先确认活动真实结束，以及照片展示已获必要同意。'});
  var request={action:'save',id:a.id,expectedRevision:a.revision,title:page.data.title.trim(),body:page.data.body.trim(),isTest:page.data.isTest,completedConfirmed:true,consentConfirmed:true};
  page.setData({busy:true,error:''});
  Promise.all(page.data.photos.map(function(f,i){return wx.cloud.uploadFile({cloudPath:page.data.uploadDir+Date.now()+'_'+Math.random().toString(36).slice(2,12)+'_'+i+'.'+f.ext,filePath:f.path}).then(function(r){if(!r.fileID)throw Error('UPLOAD_FAILED');return r.fileID;});})).then(function(ids){request.photoFileIDs=ids;return wx.cloud.callFunction({name:'activityRecaps',data:request});}).then(function(r){
   if(!r.result||!r.result.id)throw Error('SAVE_FAILED');page.setData({photos:[]});wx.showToast({title:request.isTest?'测试回顾已保存':'活动回顾已发布'});page.load();
  }).catch(function(e){var text=String(e.errMsg||e.message||'');page.setData({error:text.indexOf('RECAP_CHANGED_REFRESH')>=0?'内容已被其他管理员更新，请刷新后重试。':text.indexOf('INVALID_PHOTO_OWNER')>=0?'图片来源校验失败，请检查云环境并重新选择照片。':'保存失败，请核对云函数、照片上传权限与活动状态。'});}).then(function(){page.setData({busy:false});});
 },
 hide:function(){var page=this,a=page.data.selected;if(!a||page.data.busy)return;wx.showModal({title:'下架回顾',content:'首页将不再展示这条回顾，活动及报名记录不会删除。',success:function(r){if(!r.confirm)return;page.setData({busy:true});wx.cloud.callFunction({name:'activityRecaps',data:{action:'hide',id:a.id,expectedRevision:a.revision}}).then(function(){wx.showToast({title:'已下架'});page.load();}).catch(function(){page.setData({error:'下架失败，请刷新后重试。'});}).then(function(){page.setData({busy:false});});}});}
});
