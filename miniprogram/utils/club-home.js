// Product introductions are not scheduled events. Do not seed fake recaps here.
var products = [
 {id:'poker',name:'德州扑克主题局',pillar:'智力竞技',tag:'策略与交流',description:'从规则入门到策略复盘，在思考与交流中认识同桌的新朋友。',keywords:['德州','扑克','poker']},
 {id:'outdoor',name:'户外同行计划',pillar:'兴趣社交',tag:'一起去探索',description:'徒步、露营与桨板，走出日常，在共同体验中自然熟悉彼此。',keywords:['户外','徒步','露营','桨板','登山']},
 {id:'hardware',name:'硬件好物研究所',pillar:'兴趣社交',tag:'好奇心聚场',description:'体验有趣硬件，聊产品设计、技术和生活方式，分享你的发现。',keywords:['硬件','好物','产品分享','科技体验']},
 {id:'psychology',name:'青年心理学沙龙',pillar:'兴趣社交',tag:'理解自己与他人',description:'围绕情绪、自我认知和人际关系开展知识分享与交流。',keywords:['心理','情绪','自我认知']},
 {id:'pitch',name:'周五创意路演夜',pillar:'青年共创',tag:'让想法被听见',description:'带着一个想法来分享，听见不同反馈，寻找能够一起行动的伙伴。',keywords:['路演','创意','想法分享']},
 {id:'mvp',name:'30天MVP共创挑战',pillar:'青年共创',tag:'从想法到作品',description:'把想法拆成行动，以最小可行作品验证方向，互相反馈、共同推进。',keywords:['mvp','共创挑战','30天','创业挑战']}
];
function findProduct(id){return products.filter(function(p){return p.id===id;})[0]||null;}
function matches(activity,id){
 var p=findProduct(id);if(!p)return true;
 if(activity.productId)return activity.productId===id;
 var title=String(activity.title||'').toLowerCase();
 return p.keywords.some(function(word){return title.indexOf(word.toLowerCase())>=0;});
}
function startMillis(activity){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(activity.startDate||'')||!/^\d{2}:\d{2}$/.test(activity.startTime||''))return NaN;
 return Date.parse(activity.startDate+'T'+activity.startTime+':00+08:00');
}
function upcoming(rows,now){
 return rows.filter(function(a){return a.status==='published'&&a.isTest!==true&&startMillis(a)>now;})
  .sort(function(a,b){return startMillis(a)-startMillis(b);});
}
module.exports={products:products,findProduct:findProduct,matches:matches,upcoming:upcoming};
