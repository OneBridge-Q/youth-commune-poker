const sngPoster=require('./sng-poster');
const labels={straight_flush:'同花顺',four_of_a_kind:'四条',full_house:'葫芦',flush:'同花',straight:'顺子',three_of_a_kind:'三条',two_pair:'两对',one_pair:'一对',high_card:'高牌'};
const designs={
 straight_flush:[['A','♠'],['K','♠'],['Q','♠'],['J','♠'],['10','♠']],
 four_of_a_kind:[['A','♠'],['A','♥'],['A','♦'],['A','♣'],['K','♠']],
 full_house:[['K','♠'],['K','♥'],['K','♦'],['Q','♣'],['Q','♥']],
 flush:[['A','♥'],['J','♥'],['9','♥'],['6','♥'],['3','♥']],
 straight:[['9','♠'],['8','♥'],['7','♦'],['6','♣'],['5','♠']],
 three_of_a_kind:[['Q','♠'],['Q','♥'],['Q','♦'],['8','♣'],['3','♠']]
};
Page({
 data:{loading:true,ready:false,error:'',isSng:false,rendered:false,posterWidth:320,posterHeight:480},
 async onLoad(options){
  if(!options.id||!['hand','champion'].includes(options.type)){this.setData({loading:false,error:'缺少有效荣誉编号'});return;}
  try{
   const res=await wx.cloud.callFunction({name:'momentDetail',data:{id:options.id,type:options.type}});
   const item=res.result;if(!item||!item.id)throw Error('NOT_FOUND');
   const isSng=item.type==='champion'&&item.competitionType==='sng';
   const details=isSng?await sngPoster.loadMemberDetails():null;
   const posterWidth=Math.min(320,wx.getSystemInfoSync().windowWidth-56);
   const posterHeight=Math.round(posterWidth*(isSng?4/3:3/2));
   this.setData({loading:false,ready:true,isSng,posterWidth,posterHeight},()=>{
    if(isSng)this.drawSng(item,details);
    else this.draw(item);
   });
  }catch(e){this.setData({loading:false,error:'无法获取已认证荣誉，可能尚未审核或已撤销'});}
 },
 drawSng(item,details){
  wx.createSelectorQuery().select('#sngMomentPoster').node(async result=>{
   try{
    const canvas=result?.node;
    if(!canvas)throw Error('POSTER_CANVAS_UNAVAILABLE');
    await sngPoster.draw(canvas,item,details);
    this.sngCanvas=canvas;
    this.setData({rendered:true});
   }catch(e){this.setData({ready:false,error:'生成海报失败，请返回后重试'});}
  }).exec();
 },
 draw(item){
  const ctx=wx.createCanvasContext('momentPoster',this);
  const placeTitle=item.place===2?'亚军':'冠军';
  const competitionTitle={sng:'单场SNG',weekly:'周赛',monthly:'月赛'}[item.competitionType];
  const navy='#142238',gold=item.place===2?'#C7D3E3':'#D9BC80',white='#FFF9EE';
  const scale=this.data.posterWidth/320;ctx.scale(scale,scale);
  ctx.setFillStyle(navy);ctx.fillRect(0,0,320,480);
  ctx.setStrokeStyle(gold);ctx.setLineWidth(1);ctx.strokeRect(15,15,290,450);
  ctx.setTextAlign('center');ctx.setFillStyle(gold);ctx.setFontSize(12);ctx.fillText('RED CIRCLE CLUB',160,49);
  ctx.setFillStyle(white);ctx.setFontSize(29);ctx.fillText(item.type==='champion'?(item.place===2?'RUNNER-UP':'CHAMPION'):'POKER MOMENT',160,111);
  ctx.setFillStyle(gold);ctx.setFontSize(24);ctx.fillText(item.type==='champion'?(competitionTitle?competitionTitle+placeTitle+'奖杯':placeTitle+'荣誉'):labels[item.category]||'精彩手牌',160,158);
  if(item.type==='champion'){
   ctx.setFillStyle(gold);ctx.setFontSize(46);ctx.fillText('★',160,228);
   ctx.setFillStyle(white);ctx.setFontSize(15);ctx.fillText(String(item.title||'策略挑战活动').slice(0,19),160,273);
  }else{
   const cards=designs[item.category]||[['A','♠'],['K','♥'],['Q','♦'],['J','♣'],['9','♠']];
   cards.forEach(([rank,suit],i)=>{
    const x=19+i*57;ctx.setFillStyle('#FFFAF0');ctx.fillRect(x,194,52,82);
    ctx.setFillStyle(suit==='♥'||suit==='♦'?'#BD343D':'#18283C');
    ctx.setFontSize(rank==='10'?17:22);ctx.fillText(rank,x+26,224);ctx.setFontSize(24);ctx.fillText(suit,x+26,256);
   });
   ctx.setFillStyle('#B5BED0');ctx.setFontSize(10);ctx.fillText('牌面为牌型示意，非实际手牌记录',160,303);
  }
  ctx.setFillStyle(white);ctx.setFontSize(20);ctx.fillText(String(item.nickname||'会员').slice(0,14),160,347);
  const d=item.date?new Date(item.date):null;const date=d&&!Number.isNaN(d.getTime())?d.toISOString().slice(0,10):'';
  ctx.setFillStyle('#B5BED0');ctx.setFontSize(12);ctx.fillText(date,160,378);
  if(item.certificateId){ctx.setFontSize(10);ctx.fillText('CERT ID: '+String(item.certificateId).slice(0,27),160,400);}
  ctx.setFillStyle(gold);ctx.setFontSize(11);ctx.fillText('PLAY · CONNECT · GROW',160,444);
  ctx.draw(false,()=>this.setData({rendered:true}));
 },
 exportPoster(onReady){
  if(!this.data.rendered)return;
  const options={success:res=>onReady(res.tempFilePath),
   fail:()=>wx.showToast({title:'生成失败，请重试',icon:'none'})};
  if(this.data.isSng){
   options.canvas=this.sngCanvas;
   options.width=sngPoster.WIDTH;
   options.height=sngPoster.HEIGHT;
   options.destWidth=sngPoster.WIDTH;
   options.destHeight=sngPoster.HEIGHT;
   options.fileType='png';
  }else options.canvasId='momentPoster';
  wx.canvasToTempFilePath(options,this);
 },
 sharePoster(){
  this.exportPoster(path=>{
   if(typeof wx.showShareImageMenu==='function'){
    wx.showShareImageMenu({path,fail:e=>{
     if(!String(e.errMsg||'').includes('cancel'))wx.previewImage({current:path,urls:[path]});
    }});
   }else wx.previewImage({current:path,urls:[path]});
  });
 },
 savePoster(){
  this.exportPoster(filePath=>wx.saveImageToPhotosAlbum({filePath,
   success:()=>wx.showToast({title:'已保存'}),
   fail:()=>wx.showModal({title:'保存失败',content:'请检查相册权限',showCancel:false})
  }));
 }
});
