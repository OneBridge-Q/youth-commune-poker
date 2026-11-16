Page({
 data:{loading:true,error:'',profile:null,summary:null,timeline:[],avatarSrc:'',partial:false},
 onShow:function(){this.load();},onHide:function(){this._seq=(this._seq||0)+1;},
 load:function(){
  var page=this,seq=(page._seq||0)+1;page._seq=seq;
  page.setData({loading:true,error:'',avatarSrc:'',profile:null,summary:null,timeline:[],partial:false});
  wx.cloud.callFunction({name:'memberGrowth'}).then(function(r){
   if(seq!==page._seq)return;var data=r.result||{};
   if(!data.registered){page.setData({loading:false,error:'请先注册成为青年公社会员'});return;}
   var flags=data.partial||{};
   page.setData({loading:false,profile:data.profile||{},summary:data.summary||{},timeline:data.timeline||[],partial:Object.keys(flags).some(function(k){return flags[k]===true;})});
   if(data.profile&&data.profile.avatarFileID){
    wx.cloud.getTempFileURL({fileList:[data.profile.avatarFileID]}).then(function(x){var f=x.fileList&&x.fileList[0];if(seq===page._seq&&f&&f.tempFileURL)page.setData({avatarSrc:f.tempFileURL});}).catch(function(){});
   }
  }).catch(function(e){console.error('[memberGrowth]',e);if(seq===page._seq)page.setData({loading:false,error:'成长履历加载失败，请检查云函数或重试'});});
 }
});
