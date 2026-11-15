const types=[{value:'straight_flush',label:'同花顺'},{value:'four_of_a_kind',label:'四条'},{value:'full_house',label:'葫芦'},{value:'flush',label:'同花'},{value:'straight',label:'顺子'},{value:'three_of_a_kind',label:'三条'}];
Page({
 data:{keyword:'',members:[] as any[],memberId:'',memberName:'',types,typeIndex:1,date:new Date().toISOString().slice(0,10),note:'',pending:[] as any[],busy:false},
 onShow(){this.loadPending();},
 onKeyword(e:any){this.setData({keyword:e.detail.value});},
 onNote(e:any){this.setData({note:e.detail.value});},
 changeType(e:any){this.setData({typeIndex:Number(e.detail.value)});},
 changeDate(e:any){this.setData({date:e.detail.value});},
 async search(){if(this.data.keyword.trim().length<2)return wx.showToast({title:'至少输入2个字',icon:'none'});
  try{const r=await wx.cloud.callFunction({name:'highlightAdmin',data:{action:'members',keyword:this.data.keyword.trim()}});this.setData({members:(r.result as any).members||[]});}catch(e){wx.showToast({title:'搜索失败或无权限',icon:'none'});}},
 chooseMember(e:any){this.setData({memberId:e.currentTarget.dataset.id,memberName:e.currentTarget.dataset.name,members:[]});},
 async create(){if(!this.data.memberId)return wx.showToast({title:'请先选择会员',icon:'none'});
  this.setData({busy:true});try{
   // Store is read from authorized profile by admin service; avoid accepting arbitrary client store.
   const profile=await wx.cloud.callFunction({name:'adminProfile'});
   const storeId=(profile.result as any).storeId;
   await wx.cloud.callFunction({name:'highlightAdmin',data:{action:'create',memberId:this.data.memberId,storeId,category:types[this.data.typeIndex].value,occurredAt:this.data.date+'T12:00:00+08:00',note:this.data.note}});
   wx.showToast({title:'已提交审核'});this.setData({note:''});this.loadPending();
  }catch(e){wx.showToast({title:'提交失败，请检查权限',icon:'none'});}finally{this.setData({busy:false});}},
 async loadPending(){try{const r=await wx.cloud.callFunction({name:'highlightAdmin',data:{action:'list',status:'pending'}});this.setData({pending:(r.result as any).records||[]});}catch(e){}},
 review(e:any){const id=e.currentTarget.dataset.id,decision=e.currentTarget.dataset.decision;wx.showModal({title:'确认审核',content:decision==='verified'?'确认这条精彩手牌记录真实有效？':'确认驳回此记录？',success:async r=>{if(!r.confirm)return;try{await wx.cloud.callFunction({name:'highlightAdmin',data:{action:'review',id,decision}});wx.showToast({title:'审核完成'});this.loadPending();}catch(e){wx.showToast({title:'审核失败或无权限',icon:'none'});}}});}
});