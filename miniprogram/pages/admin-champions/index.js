Page({data:{keyword:'',members:[],memberId:'',memberName:'',eventName:'',date:new Date().toISOString().slice(0,10),pending:[],verified:[],busy:false,isTest:false},
 onShow(){this.refresh();},onKeyword(e){this.setData({keyword:e.detail.value});},onEventName(e){this.setData({eventName:e.detail.value});},onTest(e){this.setData({isTest:e.detail.value.indexOf('test')>=0});},onDate(e){this.setData({date:e.detail.value});},
 async search(){if(this.data.keyword.trim().length<2)return wx.showToast({title:'至少输入2字',icon:'none'});try{const r=await wx.cloud.callFunction({name:'highlightAdmin',data:{action:'members',keyword:this.data.keyword.trim()}});this.setData({members:r.result.members||[]});}catch(e){wx.showToast({title:'搜索失败',icon:'none'});}},
 choose(e){this.setData({memberId:e.currentTarget.dataset.id,memberName:e.currentTarget.dataset.name,members:[]});},
 async create(){
  if(!this.data.memberId||!this.data.eventName.trim())return wx.showToast({title:'请选择会员并填写活动',icon:'none'});
  this.setData({busy:true});
  try{
   const p=await wx.cloud.callFunction({name:'adminProfile'});
   if(!p.result||!p.result.storeId)throw Error('ADMIN_PROFILE_MISSING_STORE');
   const res=await wx.cloud.callFunction({name:'championAdmin',data:{
    action:'create',memberId:this.data.memberId,storeId:p.result.storeId,
    eventName:this.data.eventName.trim(),awardedAt:this.data.date+'T12:00:00+08:00',isTest:this.data.isTest
   }});
   if(!res.result||!res.result.id||res.result.status!=='pending')throw Error('CREATE_NO_RECORD_ID');
   wx.showToast({title:'已提交审核'});this.setData({isTest:false});
   this.refresh();
  }catch(e){
   console.error('[championAdmin:create] failed',e);
   const raw=String((e&&(e.errMsg||e.message))||e||'UNKNOWN_ERROR');
   const match=raw.match(/(INVALID_INPUT|WRONG_STORE|MEMBER_NOT_FOUND|FORBIDDEN|UNAUTHENTICATED|ADMIN_PROFILE_MISSING_STORE|CREATE_NO_RECORD_ID|FUNCTION_NOT_FOUND|COLLECTION_NOT_EXIST)/);
   const code=match?match[1]:'UNKNOWN_ERROR';
   const hints={
    INVALID_INPUT:'提交的数据格式不符合要求',
    WRONG_STORE:'会员与当前门店不匹配',
    MEMBER_NOT_FOUND:'未找到对应会员',
    FORBIDDEN:'当前账号没有管理权限',
    UNAUTHENTICATED:'微信登录状态不可用',
    ADMIN_PROFILE_MISSING_STORE:'管理员缺少门店配置',
    CREATE_NO_RECORD_ID:'云函数未返回有效记录编号',
    FUNCTION_NOT_FOUND:'冠军管理云函数尚未部署',
    COLLECTION_NOT_EXIST:'冠军数据库集合不存在'
   };
   wx.showModal({title:'冠军记录创建失败',content:(hints[code]||'请查看 Console 中的 championAdmin:create 报错')+'\n错误代码：'+code+'\n'+raw.slice(0,220),showCancel:false});
  }finally{this.setData({busy:false});}
 },
 async refresh(){try{const [a,b]=await Promise.all(['pending','verified'].map(status=>wx.cloud.callFunction({name:'championAdmin',data:{action:'list',status}})));this.setData({pending:a.result.records||[],verified:b.result.records||[]});}catch(e){wx.showToast({title:'列表加载失败',icon:'none'});}},
 markTest(e){const id=e.currentTarget.dataset.id,isTest=e.currentTarget.dataset.test!==true,page=this;
 wx.showModal({title:isTest?'标记测试证书':'恢复正式证书',content:isTest?'确认这是联调测试荣誉，不计入成长履历？':'确认该证书对应真实活动，应纳入成长履历？',success:async function(r){
 if(!r.confirm)return;
 try{await wx.cloud.callFunction({name:'championAdmin',data:{action:'markTest',id,isTest,reason:isTest?'管理员确认：证书联调测试':'管理员核实：真实活动证书'}});
 wx.showToast({title:'标记成功'});page.refresh();
 }catch(err){console.error('[champion:markTest]',err);wx.showToast({title:'标记失败，仅超级管理员可操作',icon:'none'});}
 }});},review(e){const id=e.currentTarget.dataset.id,decision=e.currentTarget.dataset.decision;wx.showModal({title:'确认操作',content:'确认'+(decision==='verified'?'认证冠军':decision==='voided'?'撤销证书':'驳回记录')+'？',success:async r=>{if(!r.confirm)return;try{await wx.cloud.callFunction({name:'championAdmin',data:{action:'review',id,decision}});wx.showToast({title:'操作成功'});this.refresh();}catch(err){wx.showToast({title:'操作失败',icon:'none'});}}});}
});