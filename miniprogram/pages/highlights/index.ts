Page({
 data:{loading:true,total:0,counts:[] as Array<{name:string,count:number}>,recent:[] as Array<{id:string,name:string}>,partial:false,error:''},
 async onShow(){
  const names:{[key:string]:string}={straight_flush:'同花顺',four_of_a_kind:'四条',full_house:'葫芦',flush:'同花',straight:'顺子',three_of_a_kind:'三条',two_pair:'两对',one_pair:'一对',high_card:'高牌'};
  this.setData({loading:true,error:''});
  try{
   const res=await wx.cloud.callFunction({name:'highlightStats'});
   const data=(res.result||{}) as any;
   this.setData({total:data.total||0,counts:Object.keys(names).map(k=>({name:names[k],count:(data.counts||{})[k]||0})),recent:(data.recent||[]).map((x:any)=>({id:x.id,name:names[x.category]||x.category})),partial:!!data.partial});
  }catch(e){this.setData({error:'数据加载失败，请检查云函数及权限'});}
  finally{this.setData({loading:false});}
 }
})