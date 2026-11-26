Page({
 data:{keyword:'',members:[],searched:false,busy:false,error:''},
 onKeyword(e){
  this.setData({keyword:e.detail.value,members:[],searched:false,error:''});
 },
 async search(){
  const keyword=this.data.keyword.trim();
  if(this.data.busy)return;
  if(Array.from(keyword).length<2)return this.setData({error:'请输入会员的完整昵称。'});
  this.setData({busy:true,error:''});
  try{
   const {result}=await wx.cloud.callFunction({name:'adminProfile',data:{action:'findCandidates',keyword}});
   if(!result||!Array.isArray(result.members))throw Error('SEARCH_FAILED');
   if(this.data.keyword.trim()===keyword)this.setData({members:result.members,searched:true});
  }catch(e){this.setData({error:'查询失败，请检查管理员权限后重试。'});}
  finally{this.setData({busy:false});}
 },
 confirm(e){
  if(this.data.busy)return;
  const member=this.data.members.find(m=>m.id===e.currentTarget.dataset.id);
  if(!member)return;
  wx.showModal({
   title:'指派门店管理员',
   content:member.nickname+' 将获得本门店的管理和指派权限。确认指派？',
   success:r=>{if(r.confirm)this.appoint(member.id);}
  });
 },
 async appoint(memberId){
  if(this.data.busy)return;
  this.setData({busy:true,error:''});
  try{
   const {result}=await wx.cloud.callFunction({name:'adminProfile',data:{action:'appointAdmin',memberId}});
   if(!result||!result.appointed)throw Error('APPOINT_FAILED');
   this.setData({members:this.data.members.filter(m=>m.id!==memberId)});
   wx.showToast({title:'指派成功'});
  }catch(e){this.setData({error:'指派失败，请重新搜索并确认该会员仍符合条件。'});}
  finally{this.setData({busy:false});}
 }
});
