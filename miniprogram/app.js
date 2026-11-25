App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('当前基础库不支持云开发，请切换到支持云开发的基础库。');
      return;
    }

    const env = 'COMPANY_CLOUD_ENV_PENDING';
    if (env === 'COMPANY_CLOUD_ENV_PENDING') {
      console.error('请先配置公司主体云开发环境 ID。');
      return;
    }
    wx.cloud.init({
      env,
      traceUser: true
    });
  }
});
