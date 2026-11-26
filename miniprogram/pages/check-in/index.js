Page({
 data:{registered:false,activities:[],loading:true,error:'',submitting:''},
 onShow(){this.load();},
 onUnload(){this._sequence=(this._sequence||0)+1;},
 async load(){
  const sequence=(this._sequence||0)+1;
  this._sequence=sequence;
  this.setData({loading:true,error:''});
  try{
   const {result}=await wx.cloud.callFunction({name:'activityAttendance',data:{action:'arrivalList'}});
   if(sequence!==this._sequence)return;
   if(!result||!Array.isArray(result.activities))throw Error('ARRIVAL_LIST_FAILED');
   this.setData({registered:result.registered,activities:result.activities,loading:false});
  }catch(e){
   if(sequence===this._sequence)this.setData({loading:false,error:'暂时无法加载签到活动，请重试。'});
  }
 },
 register(){
  wx.navigateTo({url:'/pages/register/index?from=check-in'});
 },
 async requestArrival(event){
  if(this.data.submitting)return;
  if(!this.data.registered)return this.register();
  const activityId=event.currentTarget.dataset.id;
  this.setData({submitting:activityId});
  try{
   const {result}=await wx.cloud.callFunction({name:'activityAttendance',data:{action:'requestArrival',activityId}});
   if(!result||!['requested','booked','checked_in'].includes(result.status))throw Error('ARRIVAL_FAILED');
   if(result.status==='requested')wx.showToast({title:'已提交，请找工作人员确认',icon:'none'});
   await this.load();
  }catch(e){
   const error=String(e.errMsg||e.message||e);
   wx.showToast({title:error.includes('ARRIVAL_NOT_OPEN')?'该活动暂不可签到':'提交失败，请重试',icon:'none'});
  }finally{
   this.setData({submitting:''});
  }
 }
});
