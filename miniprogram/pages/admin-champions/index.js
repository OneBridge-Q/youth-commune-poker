Page({data:{keyword:'',members:[],memberId:'',memberName:'',activities:[],activityLabels:[],activityIndex:-1,
 placeIndex:0,places:['冠军 · 战力 +3','亚军 · 战力 +1'],pending:[],verified:[],busy:false,activityError:false},
 onShow(){this.refresh();this.loadActivities();},
 onKeyword(e){this.setData({keyword:e.detail.value});},
 async search(){if(this.data.keyword.trim().length<2)return wx.showToast({title:'至少输入2字',icon:'none'});try{const r=await wx.cloud.callFunction({name:'highlightAdmin',data:{action:'members',keyword:this.data.keyword.trim()}});this.setData({members:r.result.members||[]});}catch(e){wx.showToast({title:'搜索失败',icon:'none'});}},
 choose(e){this.setData({memberId:e.currentTarget.dataset.id,memberName:e.currentTarget.dataset.name,members:[]});},
 async loadActivities(){
  try{
   const res=await wx.cloud.callFunction({name:'activityAdmin',data:{action:'list'}});
   const activities=(res.result.activities||[]).filter(item=>item.status==='published'&&!item.isTest&&
    new Date(item.startDate+'T'+item.startTime+':00+08:00').getTime()<=Date.now());
   const previous=this.data.activities[this.data.activityIndex];
   const previousIndex=previous?activities.findIndex(item=>item.id===previous.id):-1;
   const activityIndex=activities.length?Math.max(0,previousIndex):-1;
   this.setData({activities,activityIndex,activityLabels:activities.map(item=>item.startDate+' · '+item.title),activityError:false});
   this.refreshPlacements();
  }catch(e){this.setData({activityError:true});}
 },
 chooseActivity(e){
  this.setData({activityIndex:Number(e.detail.value),memberId:'',memberName:''});
  this.refreshPlacements();
 },
 async refreshPlacements(){
  const activity=this.data.activities[this.data.activityIndex];
  const sequence=(this._placementSequence||0)+1;
  this._placementSequence=sequence;
  this.setData({placements:[],placementError:false});
  if(!activity)return;
  try{
   const res=await wx.cloud.callFunction({name:'championAdmin',data:{action:'list',status:'verified',activityId:activity.id}});
   if(this._placementSequence===sequence)this.setData({placements:res.result.records||[]});
  }catch(e){
   if(this._placementSequence===sequence)this.setData({placementError:true});
  }
 },
 choosePlace(e){this.setData({placeIndex:Number(e.detail.value)});},
 async create(){
  const {busy,activities,activityIndex,memberId,placeIndex}=this.data;
  if(busy)return;
  const activity=activities[activityIndex];
  if(!activity||!memberId)return wx.showToast({title:'请选择活动和已签到会员',icon:'none'});
  this.setData({busy:true});
  try{
   const res=await wx.cloud.callFunction({name:'championAdmin',data:{
    action:'awardPlacement',activityId:activity.id,memberId,place:placeIndex+1
   }});
   if(!res.result||!res.result.id)throw Error('NO_AWARD');
   wx.showToast({title:res.result.unchanged?'已录入':'奖杯与战力已发放',icon:'none'});
   this.setData({memberId:'',memberName:''});
   this.refresh();
  }catch(e){
   const error=String(e.errMsg||e.message||e);
   const hints={
    PLACEMENT_TAKEN:'该名次已录入，或会员已有本场名次。更正前请撤销原记录。',
    CHECK_IN_REQUIRED:'请先为该会员完成本场有效签到。',
    ACTIVITY_NOT_ELIGIBLE:'请选择已开始的正式活动。',
    MEMBER_NOT_ELIGIBLE:'该会员不符合本场授奖条件。'
   };
   const code=Object.keys(hints).find(key=>error.includes(key));
   wx.showModal({title:'赛果录入失败',content:hints[code]||'请确认账号权限及云函数部署后重试。',showCancel:false});
  }finally{this.setData({busy:false});}
 },
 async refresh(){this.refreshPlacements();try{const [a,b]=await Promise.all(['pending','verified'].map(status=>wx.cloud.callFunction({name:'championAdmin',data:{action:'list',status}})));this.setData({pending:a.result.records||[],verified:(b.result.records||[]).filter(item=>!item.placement)});}catch(e){wx.showToast({title:'列表加载失败',icon:'none'});}},
 markTest(e){const id=e.currentTarget.dataset.id,isTest=e.currentTarget.dataset.test!==true,page=this;
 wx.showModal({title:isTest?'标记测试证书':'恢复正式证书',content:isTest?'确认这是联调测试荣誉，不计入成长履历？':'确认该证书对应真实活动，应纳入成长履历？',success:async function(r){
 if(!r.confirm)return;
 try{await wx.cloud.callFunction({name:'championAdmin',data:{action:'markTest',id,isTest,reason:isTest?'管理员确认：证书联调测试':'管理员核实：真实活动证书'}});
 wx.showToast({title:'标记成功'});page.refresh();
 }catch(err){console.error('[champion:markTest]',err);wx.showToast({title:'标记失败，仅超级管理员可操作',icon:'none'});}
 }});},review(e){const id=e.currentTarget.dataset.id,decision=e.currentTarget.dataset.decision;wx.showModal({title:'确认操作',content:'确认'+(decision==='verified'?'认证历史荣誉':decision==='voided'?'撤销荣誉及本次发放的战力值（如有）':'驳回记录')+'？',success:async r=>{if(!r.confirm)return;try{await wx.cloud.callFunction({name:'championAdmin',data:{action:'review',id,decision}});wx.showToast({title:'操作成功'});this.refresh();}catch(err){wx.showToast({title:'操作失败',icon:'none'});}}});}
});