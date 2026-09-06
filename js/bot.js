// Aoi-system — QQ 机器人接入（OneBot v11，经服务端 relay 转发）
// relay 部署在阿里云 ECS（与 NapCat 同机），token 只在 relay/NapCat 侧，前端不存任何密钥。
window.Aoi = window.Aoi || {};
Aoi.bot = {};

// 机器人配置（默认关；团长在「账号与设置」填 relay 地址 + 群号）
Aoi.bot.config = {
  enabled: false,
  relay: '',     // relay 服务地址，如 http://1.2.3.4:8080
  groupId: ''    // 群发兜底目标群号
};

// 从团队数据回填配置（持久化在 team_data blob 的 botConfig）
Aoi.bot.load = function () {
  var d = Aoi.orders.ensure();
  if (!d.botConfig) return;
  Aoi.bot.config.enabled = !!d.botConfig.enabled;
  Aoi.bot.config.relay = d.botConfig.relay || '';
  Aoi.bot.config.groupId = d.botConfig.groupId || '';
};

// 推送鉴权令牌（v3：admin token；relay 端经 admin_verify_session 校验）
Aoi.bot.sessionToken = async function () {
  var s = Aoi.adminLoadSession();
  return s ? s.token : '';
};

// 统一请求：POST relay，带 Supabase token；非 2xx 抛错
Aoi.bot.request = async function (payload) {
  if (!Aoi.bot.config.enabled || !Aoi.bot.config.relay) throw new Error('QQ 机器人未接入');
  var token = await Aoi.bot.sessionToken();
  var r = await fetch(Aoi.bot.config.relay, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    var text = '';
    try { text = await r.text(); } catch (e) { /* ignore */ }
    throw new Error('推送失败（' + r.status + '）：' + text);
  }
  return r.json();
};

// 私聊单发
Aoi.bot.sendPrivate = function (qq, message) {
  return Aoi.bot.request({ user_id: qq, message: message });
};

// 群发
Aoi.bot.sendGroup = function (message) {
  return Aoi.bot.request({ group_id: Aoi.bot.config.groupId, message: message });
};

// 批量私聊：按 memberMeta 的 QQ 逐人 send_private_msg。
// 此前 sendPrivate 从未被任何链路调用，私聊推送实际不存在——此函数补上该链路。
// relay 侧对 NapCat 转发做 ≥1s 节流防风控，前端顺序发送即可。
// 返回 { sent, failed, sentIds, unbound }：sentIds 标记哪些通知已私聊成功，
// unbound 为未绑定 QQ 的圈名（需走群发兜底）。
Aoi.bot.pushPrivate = async function (notifications) {
  var d = Aoi.orders.ensure();
  var meta = d.memberMeta || {};
  var sent = 0, failed = 0;
  var sentIds = [], unbound = [];
  for (var i = 0; i < notifications.length; i++) {
    var n = notifications[i];
    var qq = (n.buyer && meta[n.buyer]) ? meta[n.buyer].qq : null;
    if (!qq) {
      if (n.buyer && unbound.indexOf(n.buyer) < 0) unbound.push(n.buyer);
      continue;
    }
    try {
      await Aoi.bot.sendPrivate(qq, n.body);
      sent++;
      sentIds.push(n.id);
    } catch (e) {
      failed++;
    }
  }
  return { sent: sent, failed: failed, sentIds: sentIds, unbound: unbound };
};

// 群发（@ 每个已绑定 QQ 的人；@ 映射按 buyer→qq 查 memberMeta，不依赖 body 前缀格式）
Aoi.bot.pushAll = async function (notifications) {
  if (!Aoi.bot.config.enabled || !Aoi.bot.config.relay) throw new Error('QQ 机器人未接入');
  var d = Aoi.orders.ensure();
  var meta = d.memberMeta || {};
  var lines = notifications.map(function (n) {
    var qq = (n.buyer && meta[n.buyer]) ? meta[n.buyer].qq : null;
    if (qq) return '[CQ:at,qq=' + qq + '] ' + n.body;
    return n.body;
  });
  await Aoi.bot.sendGroup(lines.join('\n'));
};

// 渲染设置页机器人配置
Aoi.bot.renderSettings = function () {
  Aoi.bot.load();
  var set = function (id, v) { var el = document.getElementById(id); if (el) el.value = v; };
  var chk = document.getElementById('botEnabled');
  if (chk) chk.checked = Aoi.bot.config.enabled;
  set('botRelay', Aoi.bot.config.relay);
  set('botGroupId', Aoi.bot.config.groupId);
};

// 保存设置页机器人配置
Aoi.bot.saveSettings = async function () {
  var d = Aoi.orders.ensure();
  var get = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
  var chk = document.getElementById('botEnabled');
  var enabled = !!(chk && chk.checked);
  var relay = get('botRelay');
  // https 页面下浏览器会拦截 http 请求（混合内容），CSP 也不放行 —— 直接拦在保存时
  if (enabled && relay && window.location.protocol === 'https:' && !/^https:\/\//i.test(relay)) {
    Aoi.toast('relay 地址必须为 https：当前页面是 https，请求 http 地址会被浏览器直接拦截，推送必然失败', 'error');
    return;
  }
  d.botConfig = {
    enabled: enabled,
    relay: relay,
    groupId: get('botGroupId')
  };
  await Aoi.saveTeamData(d);
  Aoi.bot.load();
  Aoi.toast('机器人设置已保存', 'success');
};
