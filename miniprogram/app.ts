App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('当前基础库不支持云开发，请切换到支持云开发的基础库。');
      return;
    }

    wx.cloud.init({
      env: 'cloud1-d5girmhw10f03643a',
      traceUser: true
    });
  }
});
