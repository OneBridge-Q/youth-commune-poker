function hint(e){
 var t=String((e&&(e.errMsg||e.message))||e||'');
 var labels={REVOKE_PLACEMENTS_FIRST:'请先在赛果管理撤销该会员的奖杯，再撤销签到。',WRONG_STORE:'只能管理本门店的活动。',FORBIDDEN:'当前账号没有签到管理权限。',APP_ID_MISMATCH:'小程序身份配置不匹配。',ATTENDANCE_CHANGED:'名单状态已变化，请刷新后重新确认。',SIGNUP_CANCELLED:'该会员已取消报名，请刷新名单。',SIGNUP_NOT_FOUND:'报名记录不存在，请刷新名单。',ACTIVITY_NOT_AVAILABLE:'活动未发布或已取消，不能新增签到。',CHECKIN_NOT_OPEN:'签到在活动开始前2小时开放。',MEMBER_NOT_ACTIVE:'该会员已停用，不能签到。',REVOKE_REASON_REQUIRED:'请填写2至200个字符的撤销原因。',ROSTER_LIMIT_REACHED:'报名超过1000条，请联系管理员升级名单查询。',IDEMPOTENCY_CONFLICT:'操作请求不一致，请刷新后重试。',FUNCTION_NOT_FOUND:'请先部署 activityAttendance 云函数。'};
 var keys=Object.keys(labels);for(var i=0;i<keys.length;i++)if(t.indexOf(keys[i])>=0)return labels[keys[i]];
 if(/collection.*(not exist|not found)|table not exist|COLLECTION_NOT_EXIST/i.test(t))return '缺少签到审计集合，请创建 attendance_audit 后重试。';
 return '操作未确认成功，请刷新名单后重试。系统不会重复计次。';
}
Page({
 data:{id:'',activity:null,stats:{registered:0,checkedIn:0,notCheckedIn:0},rows:[],keyword:'',filter:'all',nextOffset:null,loading:false,busy:false,error:'',canCheckIn:false,revokeTarget:null,reason:''},
 onLoad:function(o){this.setData({id:o.id||'',filter:['all','checked_in','not_checked_in'].indexOf(o.filter)>=0?o.filter:'all'});},
 onShow:function(){if(this.data.id)this.load(false);},
 onHide:function(){this._seq=(this._seq||0)+1;},
 onUnload:function(){this._seq=(this._seq||0)+1;},
 onKeyword:function(e){this.setData({keyword:e.detail.value});},
 search:function(){if(!this.data.busy)this.load(false);},
 chooseFilter:function(e){if(this.data.busy)return;this.setData({filter:e.currentTarget.dataset.filter});this.load(false);},
 more:function(){if(this.data.nextOffset!==null&&!this.data.busy&&!this.data.loading)this.load(true);},
 load:function(append){
  var page=this,seq=(page._seq||0)+1;page._seq=seq;
  page.setData({loading:true,error:''});
  wx.cloud.callFunction({name:'activityAttendance',data:{action:'list',activityId:page.data.id,keyword:page.data.keyword,filter:page.data.filter,offset:append?page.data.nextOffset:0}}).then(function(r){
   if(seq!==page._seq)return;var v=r.result||{};
   if(!v.activity||!Array.isArray(v.rows))throw Error('INVALID_RESPONSE');
   page.setData({loading:false,activity:v.activity,stats:v.stats,rows:append?page.data.rows.concat(v.rows):v.rows,nextOffset:v.nextOffset===undefined?null:v.nextOffset,canCheckIn:!!v.canCheckIn});
  }).catch(function(e){if(seq===page._seq)page.setData({loading:false,error:hint(e)});});
 },
 checkIn:function(e){
  var page=this;if(page.data.busy||page.data.loading)return;
  var row=page.data.rows.filter(function(x){return x.id===e.currentTarget.dataset.id;})[0];if(!row)return;
  wx.showModal({title:'确认到场',content:'确认「'+row.nickname+'」已经到场？'+(row.isTest?'这是测试活动，不计入正式成长。':''),success:function(r){if(r.confirm)page.operate('checkIn',row,'');}});
 },
 openRevoke:function(e){if(this.data.busy||this.data.loading)return;var row=this.data.rows.filter(function(x){return x.id===e.currentTarget.dataset.id;})[0];if(row)this.setData({revokeTarget:row,reason:''});},
 onReason:function(e){this.setData({reason:e.detail.value});},
 closeRevoke:function(){if(!this.data.busy)this.setData({revokeTarget:null,reason:''});},
 revoke:function(){var r=this.data.reason.trim();if(r.length<2)return this.setData({error:'请填写具体撤销原因，至少2个字符。'});if(this.data.revokeTarget)this.operate('revoke',this.data.revokeTarget,r);},
 operate:function(action,row,reason){
  var page=this;if(page.data.busy)return;
  var key=[action,row.id,row.attendanceVersion,reason].join('|');
  if(!page._pending||page._pending.key!==key)page._pending={key:key,id:'att_'+Date.now()+'_'+Math.random().toString(36).slice(2,12)+'_'+Math.random().toString(36).slice(2,12)};
  var request={action:action,activityId:page.data.id,signupId:row.id,expectedVersion:row.attendanceVersion,requestId:page._pending.id,reason:reason};
  page.setData({busy:true,error:''});
  wx.cloud.callFunction({name:'activityAttendance',data:request}).then(function(r){
   if(!r.result||!r.result.id)throw Error('INVALID_RESPONSE');page._pending=null;
   page.setData({busy:false,revokeTarget:null,reason:''});wx.showToast({title:action==='checkIn'?'已确认签到':'已撤销签到'});page.load(false);
  }).catch(function(e){page.setData({busy:false,error:hint(e)});});
 },
 history:function(e){
  var page=this;if(page.data.busy)return;page.setData({busy:true});
  wx.cloud.callFunction({name:'activityAttendance',data:{action:'history',activityId:page.data.id,signupId:e.currentTarget.dataset.id}}).then(function(r){
   var rows=(r.result&&r.result.records)||[];
   wx.showModal({title:'最近签到操作',content:rows.length?rows.map(function(x){return x.at+' '+(x.action==='checkIn'?'确认签到':'撤销签到')+(x.reason?'\n原因：'+x.reason:'');}).join('\n\n'):'暂无签到操作记录',showCancel:false});
  }).catch(function(e){page.setData({error:hint(e)});}).then(function(){page.setData({busy:false});});
 }
});
