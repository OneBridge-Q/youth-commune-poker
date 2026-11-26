const WIDTH=1086;
const HEIGHT=1448;
const TEMPLATES={
 1:{file:'sng-champion',avatar:[205,1083,88],name:[362,972,610,72],scores:[[508,1148],[831,1148]],color:'#2e140f'},
 2:{file:'sng-runner-up',avatar:[227,1123,94],name:[400,1007,565,76],scores:[[535,1186],[824,1186]],color:'#261818'}
};

async function avatarImage(fileID){
 if(!fileID)return null;
 try{
  const {tempFilePath}=await wx.cloud.downloadFile({fileID});
  return await new Promise((resolve,reject)=>wx.getImageInfo({src:tempFilePath,success:resolve,fail:reject}));
 }catch(e){return null;}
}

async function loadMemberDetails(){
 const [home,attendance]=await Promise.all([
  wx.cloud.callFunction({name:'memberHome'}).catch(()=>null),
  wx.cloud.callFunction({name:'activityAttendance',data:{action:'storeCheckInStatus'}}).catch(()=>null)
 ]);
 const member=home?.result?.member;
 return {
  avatar:await avatarImage(member?.avatarFileID),
  skill:member?.skillPoints,charisma:attendance?.result?.count
 };
}

function draw(ctx,item,details,width,height,done){
 const template=TEMPLATES[item.place]||TEMPLATES[1];
 ctx.save();
 ctx.scale(width/WIDTH,height/HEIGHT);
 ctx.drawImage('/assets/posters/'+template.file+'.jpg',0,0,WIDTH,HEIGHT);

 if(details.avatar){
  const [x,y,r]=template.avatar;
  const {path,width:imageWidth,height:imageHeight}=details.avatar;
  const side=Math.min(imageWidth,imageHeight);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x,y,r,0,Math.PI*2);
  ctx.clip();
  ctx.drawImage(path,(imageWidth-side)/2,(imageHeight-side)/2,side,side,x-r,y-r,r*2,r*2);
  ctx.restore();
 }

 const [x,y,w,h]=template.name;
 ctx.setFillStyle(template.color);
 ctx.fillRect(x,y,w,h);
 ctx.setFillStyle('#fff3df');
 ctx.setTextBaseline('middle');
 ctx.setTextAlign('left');
 ctx.setFontSize(51);
 ctx.fillText(String(item.nickname||'会员'),x+6,y+h/2,w-12);
 ctx.setTextAlign('center');
 template.scores.forEach(([cx,cy],index)=>{
  const score=index===0?details.skill:details.charisma;
  ctx.setFillStyle(template.color);
  ctx.fillRect(cx-81,cy-23,162,48);
  ctx.setFillStyle('#fff3df');
  ctx.setFontSize(43);
  ctx.fillText(Number.isSafeInteger(score)&&score>=0?String(score):'—',cx,cy,146);
 });
 ctx.restore();
 ctx.draw(false,done);
}

module.exports={draw,loadMemberDetails,WIDTH,HEIGHT};
