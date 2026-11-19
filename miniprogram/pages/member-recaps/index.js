const handLabels={
 straight_flush:'同花顺',four_of_a_kind:'四条',full_house:'葫芦',flush:'同花',
 straight:'顺子',three_of_a_kind:'三条',two_pair:'两对',one_pair:'一对',high_card:'高牌'
};

Page({
 data:{loading:true,error:false,recaps:[]},
 onShow(){this.load();},
 async load(){
  this.setData({loading:true,error:false});
  try{
   const {result}=await wx.cloud.callFunction({name:'activityMember',data:{action:'recaps'}});
   if(!result||!Array.isArray(result.recaps))throw Error('RECAPS_UNAVAILABLE');
   const recaps=result.recaps.map(recap=>({
    ...recap,
    recentHands:recap.recentHands.map(hand=>({...hand,name:handLabels[hand.category]||'精彩手牌'}))
   }));
   this.setData({recaps});
  }catch(e){
   this.setData({error:true});
  }finally{
   this.setData({loading:false});
  }
 }
});
