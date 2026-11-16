// 青年公社六个常设活动产品的海报映射。
// 将原图放入 miniprogram/assets/activity-posters/ 后立即生效。
// 海报路径为可选资源；未添加原图时页面显示文字卡片，不影响报名。
var PRODUCTS=[
 {key:'poker',name:'德州扑克主题局',category:'社交交流',image:'/assets/activity-posters/poker.png',keywords:['德州','扑克','Poker']},
 {key:'outdoor',name:'青年公社户外同行计划',category:'户外运动',image:'/assets/activity-posters/outdoor.png',keywords:['徒步','桨板','露营','户外','登山']},
 {key:'hardware',name:'硬件好物研究所',category:'知识分享',image:'/assets/activity-posters/hardware.png',keywords:['硬件','产品分享','好物','科技体验']},
 {key:'psychology',name:'青年心理学沙龙',category:'知识分享',image:'/assets/activity-posters/psychology.png',keywords:['心理','情绪','自我认知']},
 {key:'pitch',name:'周五创意路演夜',category:'创业共创',image:'/assets/activity-posters/pitch.png',keywords:['路演','创意','想法分享']},
 {key:'mvp',name:'30天MVP共创挑战',category:'创业共创',image:'/assets/activity-posters/mvp.png',keywords:['MVP','共创挑战','30天','创业挑战']}
];
function match(activity){
 var title=String((activity&&activity.title)||'');
 for(var i=0;i<PRODUCTS.length;i++){
  var words=PRODUCTS[i].keywords;
  for(var j=0;j<words.length;j++)if(title.toLowerCase().indexOf(words[j].toLowerCase())>=0)return PRODUCTS[i];
 }
 return null;
}
function decorate(activity){
 var p=match(activity),result={};
 for(var key in activity)result[key]=activity[key];
 result.productKey=p?p.key:'';
 result.posterSrc=p?p.image:'';
 return result;
}
module.exports={products:PRODUCTS,decorate:decorate,match:match};
