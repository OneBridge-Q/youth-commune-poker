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

function loadImage(canvas,src){
 return new Promise((resolve,reject)=>{
  const image=canvas.createImage();
  image.onload=()=>resolve(image);
  image.onerror=reject;
  image.src=src;
 });
}

async function draw(canvas,item,details){
 const template=TEMPLATES[item.place]||TEMPLATES[1];
 const [background,avatar]=await Promise.all([
  loadImage(canvas,'/assets/posters/'+template.file+'.jpg'),
  details.avatar?loadImage(canvas,details.avatar.path).catch(()=>null):null
 ]);
 // Render at export size so small QR modules survive the preview layout.
 canvas.width=WIDTH;
 canvas.height=HEIGHT;
 const ctx=canvas.getContext('2d');
 ctx.drawImage(background,0,0,WIDTH,HEIGHT);

 if(avatar){
  const [x,y,r]=template.avatar;
  const {width:imageWidth,height:imageHeight}=details.avatar;
  const side=Math.min(imageWidth,imageHeight);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x,y,r,0,Math.PI*2);
  ctx.clip();
  ctx.drawImage(avatar,(imageWidth-side)/2,(imageHeight-side)/2,side,side,x-r,y-r,r*2,r*2);
  ctx.restore();
 }

 const [x,y,w,h]=template.name;
 ctx.fillStyle=template.color;
 ctx.fillRect(x,y,w,h);
 ctx.fillStyle='#fff3df';
 ctx.textBaseline='middle';
 ctx.textAlign='left';
 ctx.font='51px sans-serif';
 ctx.fillText(String(item.nickname||'会员'),x+6,y+h/2,w-12);
 ctx.textAlign='center';
 template.scores.forEach(([cx,cy],index)=>{
  const score=index===0?details.skill:details.charisma;
  ctx.fillStyle=template.color;
  ctx.fillRect(cx-81,cy-23,162,48);
  ctx.fillStyle='#fff3df';
  ctx.font='43px sans-serif';
  ctx.fillText(Number.isSafeInteger(score)&&score>=0?String(score):'—',cx,cy,146);
 });
}

module.exports={draw,loadMemberDetails,WIDTH,HEIGHT};
