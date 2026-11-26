var club=require('../../utils/club-home');
function stage(a,now){if(a.status==='cancelled')return 'cancelled';if(a.status==='draft')return 'draft';if(a.feedbackOpen)return 'ended';return Date.parse(a.startDate+'T'+a.startTime+':00+08:00')>now?'upcoming':'started';}
var stageLabels={draft:'草稿',upcoming:'报名中',started:'已开始',ended:'已结束',cancelled:'已取消'};
function themes(category){return [{id:'',name:'不指定主题'}].concat(club.products.filter(function(p){return p.category===category;}));}
Page({
 data:{editVersion:0,editId:'',posterFileID:'',filter:'all',filters:[{id:'all',name:'全部'},{id:'upcoming',name:'报名中'},{id:'draft',name:'草稿'},{id:'started',name:'已开始'},{id:'ended',name:'已结束'},{id:'cancelled',name:'已取消'}],visible:[],feeEnabled:false,feeInput:'',capacityInput:'',mode:'manage',title:'',description:'',location:'',date:'',time:'19:30',categories:['主题社交','德州活动','知识分享','户外运动','创业共创','其他'],categoryIndex:0,themeOptions:themes('主题社交'),themeIndex:0,activities:[],loading:false,busy:false,error:'',posterLocalPath:'',posterExt:'jpg',isTest:false},
 onLoad:function(o){var mode=o&&['create','edit'].indexOf(o.mode)>=0?o.mode:'manage';wx.setNavigationBarTitle({title:mode==='edit'?'编辑活动':mode==='create'?'创建活动':'活动管理'});this.setData({mode:mode,date:new Date(Date.now()+86400000+28800000).toISOString().slice(0,10),editId:o&&o.id||''});if(mode==='edit')this.loadEdit();},
 onShow:function(){if(this.data.mode==='manage')this.load();},
 onTitle:function(e){this.setData({title:e.detail.value});},onDescription:function(e){this.setData({description:e.detail.value});},onLocation:function(e){this.setData({location:e.detail.value});},onDate:function(e){this.setData({date:e.detail.value});},onTime:function(e){this.setData({time:e.detail.value});},onCategory:function(e){var i=Number(e.detail.value),opts=themes(this.data.categories[i]);this.setData({categoryIndex:i,themeOptions:opts,themeIndex:opts.length===2?1:0});},onTheme:function(e){this.setData({themeIndex:Number(e.detail.value)});},onTest:function(e){this.setData({isTest:!!e.detail.value});},
 onFeeEnabled:function(e){this.setData({feeEnabled:!!e.detail.value});},onFee:function(e){this.setData({feeInput:e.detail.value});},onCapacity:function(e){this.setData({capacityInput:e.detail.value});},
 choosePoster:function(){
  var page=this;if(page.data.busy)return;
  wx.chooseMedia({count:1,mediaType:['image'],sourceType:['album','camera'],sizeType:['compressed'],success:function(res){
   var file=res.tempFiles&&res.tempFiles[0];if(!file||!file.tempFilePath)return;
   if(file.size>5*1024*1024)return wx.showModal({title:'图片过大',content:'请选择不超过5MB的活动海报',showCancel:false});
   var extMatch=file.tempFilePath.match(/\.(png|jpe?g|webp)(?:\?|$)/i),ext=extMatch?extMatch[1].toLowerCase():'jpg';if(ext==='jpeg')ext='jpg';page.setData({posterLocalPath:file.tempFilePath,posterExt:ext});
  }});
 },
 removePoster:function(){if(!this.data.busy)this.setData({posterLocalPath:'',posterFileID:''});},
 load:function(){var page=this;page.setData({loading:true,error:''});
  wx.cloud.callFunction({name:'activityAdmin',data:{action:'list'}}).then(function(r){page.setData({activities:((r.result&&r.result.activities)||[]).map(function(a){var known=typeof a.registered==='number'&&typeof a.checkedIn==='number';var st=stage(a,Date.now());return Object.assign({},a,{stage:st,stageLabel:st==='upcoming'&&a.feeFen>0?'待开放支付':stageLabels[st],canEdit:st==='draft'||(st==='upcoming'&&a.checkedIn===0),registered:known?a.registered:'—',checkedIn:known?a.checkedIn:'—',attendanceRate:known?(a.registered?Math.round(a.checkedIn/a.registered*100)+'%':'—'):'—'});}),loading:false});page.filterRows();}).catch(function(e){console.error('[admin:activities:list]',e);page.setData({loading:false,error:'无法加载活动，请检查管理员权限及云函数部署'});});
 },
 filterRows:function(){var f=this.data.filter;this.setData({visible:this.data.activities.filter(function(a){return f==='all'||f===a.stage;})});},
 chooseFilter:function(e){this.setData({filter:e.currentTarget.dataset.filter});this.filterRows();},
 edit:function(e){wx.navigateTo({url:'/pages/admin-activities/index?mode=edit&id='+encodeURIComponent(e.currentTarget.dataset.id)});},
 loadEdit:function(){var page=this;page.setData({loading:true,error:''});wx.cloud.callFunction({name:'activityAdmin',data:{action:'get',id:page.data.editId}}).then(function(r){var a=r.result&&r.result.activity;if(!a)throw Error('NOT_FOUND');var i=page.data.categories.indexOf(a.category);if(i<0)i=page.data.categories.length-1;var opts=themes(page.data.categories[i]),theme=opts.findIndex(function(p){return p.id===a.productId;});page.setData({editVersion:a.editVersion,title:a.title,description:a.description,location:a.location,date:a.startDate,time:a.startTime,categoryIndex:i,themeOptions:opts,themeIndex:Math.max(0,theme),feeEnabled:a.feeFen>0,feeInput:a.feeFen>0?String(a.feeFen/100):'',capacityInput:a.capacity?String(a.capacity):'',posterFileID:a.posterFileID||'',isTest:a.isTest,loading:false});}).catch(function(){page.setData({loading:false,error:'活动加载失败，请返回重试'});});},
 create:function(){
  var page=this;if(page.data.busy||page.data.loading||page.data.error)return;
  if(!page.data.title.trim()||!page.data.location.trim()||!page.data.date)return wx.showToast({title:'请填写活动名称、日期和地点',icon:'none'});
  var fee=page.data.feeEnabled?String(page.data.feeInput).trim():'0',cap=String(page.data.capacityInput).trim()||'0';
  if(!/^\d{1,5}(\.\d{1,2})?$/.test(fee)||Number(fee)>10000||(page.data.feeEnabled&&Number(fee)<=0)||!/^\d{1,4}$/.test(cap)||Number(cap)>1000)return wx.showToast({title:'请填写有效报名费用及人数',icon:'none'});
  var request={feeFen:Math.round(Number(fee)*100),capacity:Number(cap),action:page.data.mode==='edit'?'edit':'create',id:page.data.editId,editVersion:page.data.editVersion,title:page.data.title.trim(),description:page.data.description.trim(),location:page.data.location.trim(),startDate:page.data.date,startTime:page.data.time,category:page.data.categories[page.data.categoryIndex],productId:page.data.themeOptions[page.data.themeIndex].id,posterFileID:page.data.posterFileID,isTest:page.data.isTest};
  page.setData({busy:true});var upload=Promise.resolve();
  if(page.data.posterLocalPath)upload=wx.cloud.uploadFile({cloudPath:'activity-posters/cover_'+Date.now()+'_'+Math.random().toString(36).slice(2,12)+'.'+page.data.posterExt,filePath:page.data.posterLocalPath}).then(function(r){if(!r.fileID)throw Error('POSTER_UPLOAD_FAILED');request.posterFileID=r.fileID;});
  upload.then(function(){return wx.cloud.callFunction({name:'activityAdmin',data:request});}).then(function(r){if(!r.result||!r.result.id)throw Error('CREATE_FAILED');if(page.data.mode==='edit'){wx.showToast({title:'已保存'});wx.navigateBack();return;}page.setData({title:'',description:'',location:'',posterLocalPath:'',isTest:false,feeEnabled:false,feeInput:'',capacityInput:''});wx.showModal({title:'草稿已创建',content:'前往活动管理发布草稿？',confirmText:'去管理',cancelText:'继续创建',success:function(v){if(v.confirm)wx.redirectTo({url:'/pages/admin-activities/index?mode=manage'});}});}).catch(function(e){console.error('[admin:activities:create]',e);wx.showModal({title:'保存失败',content:String(e.errMsg||e.message||'').indexOf('CONCURRENT_UPDATE')>=0?'活动信息或报名状态已变化，请返回后重新编辑。':String(e.errMsg||e.message||'').indexOf('SIGNUPS_EXIST')>=0?'已有报名，不能修改费用或人数上限。':String(e.errMsg||e.message||'').indexOf('EDIT_NOT_AVAILABLE')>=0?'已开始、已签到或取消的活动不能编辑。':'请检查活动日期、图片上传、云函数与数据库。',showCancel:false});}).then(function(){page.setData({busy:false});});
 },
 act:function(e){
  var page=this,action=e.currentTarget.dataset.action,id=e.currentTarget.dataset.id;if(page.data.busy)return;
  var text=action==='publish'?'确认发布活动，让会员可以报名？':action==='markTest'?'确认仅用于联调？标记后不计正式成长，本入口不支持恢复成正式活动。':action==='openFeedback'?'确认活动已结束，并向已签到会员开放问卷？':'确认取消此活动？';
  wx.showModal({title:'活动操作',content:text,success:function(result){if(!result.confirm)return;page.setData({busy:true});
   wx.cloud.callFunction({name:'activityAdmin',data:{action:action,id:id}}).then(function(){wx.showToast({title:'操作成功'});page.load();}).catch(function(err){console.error('[admin:activities]',err);if(String(err.errMsg||err.message||err).includes('REVOKE_PLACEMENTS_FIRST')){
    wx.showModal({title:'请先撤销本场奖杯',content:'该活动已录入赛果，请在赛果与奖杯管理中撤销对应名次后重试。',showCancel:false});
   }else wx.showToast({title:'操作失败',icon:'none'});}).then(function(){page.setData({busy:false});});
  }});
 },
 viewSignups:function(e){if(e.currentTarget.dataset.id)wx.navigateTo({url:'/pages/admin-attendance/index?id='+encodeURIComponent(e.currentTarget.dataset.id)+'&filter='+encodeURIComponent(e.currentTarget.dataset.filter||'all')});}
});
