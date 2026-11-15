Page({
  data: {
    message: '活动与成长记录即将上线。',
    isAdmin: false,
    registered: false,
    nickname: '',
    memberNo: '',
    avatarSrc: '',
    champions: []
  },
  onShow: function () {
    var page = this;
    page.setData({ avatarSrc: '', isAdmin: false, champions: [] });
    wx.cloud.callFunction({ name: 'memberHome' }).then(function (response) {
      var result = response.result || {};
      var member = result.member || {};
      page.setData({
        registered: !!result.registered,
        nickname: member.nickname || '',
        memberNo: member.memberNo || '',
        avatarSrc: ''
      });
      if (result.registered && member.avatarFileID) {
        wx.cloud.getTempFileURL({ fileList: [member.avatarFileID] }).then(function (fileResult) {
          var file = fileResult.fileList && fileResult.fileList[0];
          if (file && file.tempFileURL) {
            page.setData({ avatarSrc: file.tempFileURL });
          }
        }).catch(function (error) {
          console.warn('[profile:avatar]', error);
        });
      }
    }).catch(function (error) {
      console.error('[profile:memberHome]', error);
    });
    wx.cloud.callFunction({ name: 'adminProfile' }).then(function (response) {
      page.setData({ isAdmin: !!(response.result && response.result.role) });
    }).catch(function () {
      page.setData({ isAdmin: false });
    });
    wx.cloud.callFunction({ name: 'championAdmin', data: { action: 'mine' } }).then(function (response) {
      page.setData({ champions: (response.result && response.result.records) || [] });
    }).catch(function (error) {
      console.warn('[profile:champions]', error);
      page.setData({ champions: [] });
    });
  },
  openRegister: function () {
    wx.navigateTo({ url: '/pages/register/index' });
  },
  editProfile: function () {
    wx.navigateTo({ url: '/pages/register/index?mode=edit' });
  },
  openAdmin: function () {
    wx.navigateTo({ url: '/pages/admin-highlights/index' });
  },
  openChampionAdmin: function () {
    wx.navigateTo({ url: '/pages/admin-champions/index' });
  },
  openHighlights: function () {
    wx.navigateTo({ url: '/pages/highlights/index' });
  },
  openChampion: function (event) {
    wx.navigateTo({
      url: '/pages/moment/index?type=champion&id=' +
        encodeURIComponent(event.currentTarget.dataset.id)
    });
  }
});
