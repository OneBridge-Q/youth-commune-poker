Page({
 data:{loading:true,error:'',profile:null,summary:null,timeline:[],avatarSrc:''},
 onShow:function(){this.load();},
 load:function(){
  var page=this;page.setData({loading:true,error:'',avatarSrc:''});
  wx.cloud.callFunction({name:'memberGrowth'}).then(function(r){
   var data=r.result||{};
   if(!data.registered){page.setData({loading:false,error:'请先注册成为青年公社会员'});return;}
   page.setData({loading:false,profile:data.profile||{},summary:data.summary||{},timeline:data.timeline||[]});
   if(data.profile&&data.profile.avatarFileID){
    wx.cloud.getTempFileURL({fileList:[data.profile.avatarFileID]}).then(function(x){
     var file=x.fileList&&x.fileList[0];if(file&&file.tempFileURL)page.setData({avatarSrc:file.tempFileURL});
    }).catch(function(e){console.warn('[growth:avatar]',e);});
   }
  }).catch(function(e){console.error('[memberGrowth]',e);page.setData({loading:false,error:'成长履历加载失败，请检查 memberGrowth 云函数是否部署'});});
 }
});
