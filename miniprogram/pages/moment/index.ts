const labels:{[key:string]:string}={straight_flush:'同花顺',four_of_a_kind:'四条',full_house:'葫芦',flush:'同花',straight:'顺子',three_of_a_kind:'三条',two_pair:'两对',one_pair:'一对',high_card:'高牌'};
Page({
 data:{loading:true,ready:false,error:''},
 async onLoad(options:{type?:string,id?:string}){
  if(!options.id||!options.type){this.setData({loading:false,error:'缺少荣誉记录编号'});return;}
  try{
   const res=await wx.cloud.callFunction({name:'momentDetail',data:{id:options.id,type:options.type}});
   const item=res.result as any;
   if(!item||!item.id)throw Error('NOT_FOUND');
   this.setData({loading:false,ready:true});
   setTimeout(()=>this.draw(item),50);
  }catch(e){this.setData({loading:false,error:'无法获取已认证荣誉，可能尚未审核或已撤销'});}
 },
 draw(item:any){
  const ctx=wx.createCanvasContext('momentPoster',this);
  ctx.setFillStyle('#172334');ctx.fillRect(0,0,300,450);
  ctx.setFillStyle('#D9BE87');ctx.setFontSize(12);ctx.setTextAlign('center');ctx.fillText('YOUTH COMMUNE  ·  POKER CLUB',150,42);
  ctx.setFillStyle('#FFFFFF');ctx.setFontSize(26);ctx.fillText(item.type==='champion'?'CHAMPION':'POKER MOMENT',150,112);
  ctx.setFillStyle('#D9BE87');ctx.setFontSize(28);ctx.fillText(item.type==='champion'?'冠军荣誉':(labels[item.category]||'精彩手牌'),150,184);
  if(item.type==='hand'&&item.category==='four_of_a_kind'){
   ['♠','♥','♦','♣'].forEach((s,i)=>{const x=27+i*64;ctx.setFillStyle('#FFFDF6');ctx.fillRect(x,218,54,75);ctx.setFillStyle(i===1||i===2?'#B83434':'#172334');ctx.setFontSize(22);ctx.fillText('A',x+27,247);ctx.fillText(s,x+27,274);});
  }else{ctx.setFillStyle('#D9BE87');ctx.setFontSize(18);ctx.fillText(item.type==='champion'?'★  ★  ★':'♠  ♥  ♦  ♣',150,262);}
  ctx.setFillStyle('#FFFFFF');ctx.setFontSize(18);ctx.fillText(String(item.nickname||'会员').slice(0,18),150,340);
  ctx.setFillStyle('#AEB9CB');ctx.setFontSize(11);
  const date=item.date?new Date(item.date).toISOString().slice(0,10):'';
  ctx.fillText(date,150,369);
  if(item.certificateId)ctx.fillText('证书编号 '+String(item.certificateId).slice(0,30),150,389);
  ctx.setFillStyle('#D9BE87');ctx.setFontSize(11);ctx.fillText('PLAY  ·  CONNECT  ·  GROW',150,423);
  ctx.draw();
 },
 savePoster(){
  wx.canvasToTempFilePath({canvasId:'momentPoster',success:res=>wx.saveImageToPhotosAlbum({filePath:res.tempFilePath,success:()=>wx.showToast({title:'已保存'}),fail:()=>wx.showModal({title:'保存失败',content:'请在系统设置中允许保存图片',showCancel:false})}),fail:()=>wx.showToast({title:'生成图片失败',icon:'none'})},this);
 }
});