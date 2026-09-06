// Aoi-system — 团队设置（v3）：团名 / 团员密钥 / 管理员账号管理 / 公告
window.Aoi = window.Aoi || {};

// 渲染「账号与设置」页
Aoi.renderSettings = function () {
  var t = Aoi.state.team;
  var isSuper = Aoi.state.role === 'super';

  document.getElementById('teamName').textContent = t.name || '我的团';
  document.getElementById('myRole').textContent = isSuper ? '超级管理员' : '管理员';

  var renameBox = document.getElementById('teamRenameBox');
  if (renameBox) renameBox.classList.toggle('hidden', !isSuper);

  var mkSection = document.getElementById('memberKeySection');
  if (mkSection) mkSection.classList.toggle('hidden', !isSuper);
  var mkLabel = document.getElementById('memberKeyLabel');
  if (mkLabel) mkLabel.textContent = t.member_key || '（未生成）';

  var amSection = document.getElementById('adminMgmtSection');
  if (amSection) amSection.classList.toggle('hidden', !isSuper);
  if (isSuper) Aoi.adminMgmt.render();
};

// —— 管理员账号管理（仅 super，走 admin_* RPC）——
Aoi.adminMgmt = {};

Aoi.adminMgmt.render = async function () {
  var ul = document.getElementById('adminMgmtList');
  if (!ul) return;
  var s = Aoi.adminLoadSession();
  if (!s) return;
  try {
    var r = await Aoi.db.rpc('admin_list', { p_token: s.token });
    if (r.error) { ul.innerHTML = '<li class="text-sm text-red-500 py-1">' + Aoi.escapeHtml(r.error.message) + '</li>'; return; }
    ul.innerHTML = (r.data || []).map(function (a) {
      var isSelf = a.username === (Aoi.state.user && Aoi.state.user.username);
      var actions = [];
      if (!isSelf) {
        actions.push('<button data-am-reset="' + a.id + '" data-am-user="' + Aoi.escapeHtml(a.username) + '" class="text-blue-500 text-sm hover:underline">重置密码</button>');
        actions.push('<button data-am-del="' + a.id + '" data-am-user="' + Aoi.escapeHtml(a.username) + '" class="text-red-500 text-sm hover:underline">删除</button>');
      }
      return '<li class="flex items-center justify-between border-b border-gray-200 py-2">'
        + '<span>' + (a.role === 'super' ? '👑 ' : '👤 ') + Aoi.escapeHtml(a.username)
        + ' <span class="text-xs text-gray-400">（' + (a.role === 'super' ? '超级管理员' : '管理员') + (isSelf ? ' · 我' : '') + '）</span></span>'
        + '<span class="flex gap-3">' + actions.join('') + '</span></li>';
    }).join('');
  } catch (e) {
    ul.innerHTML = '<li class="text-sm text-red-500 py-1">' + Aoi.escapeHtml(e.message) + '</li>';
  }
};

Aoi.adminMgmt.add = async function () {
  var get = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
  var username = get('amUsername'), password = get('amPassword'), role = get('amRole');
  if (!username || !password) { Aoi.toast('请填写用户名和密码', 'warning'); return; }
  var s = Aoi.adminLoadSession();
  if (!s) { Aoi.toast('会话已过期，请重新登录', 'error'); return; }
  try {
    var r = await Aoi.db.rpc('admin_create', { p_token: s.token, p_username: username, p_password: password, p_role: role });
    if (r.error) { Aoi.toast(r.error.message, 'error'); return; }
    document.getElementById('amUsername').value = '';
    document.getElementById('amPassword').value = '';
    Aoi.adminMgmt.render();
    Aoi.toast('已添加管理员 ' + username, 'success');
  } catch (e) { Aoi.toast(e.message, 'error'); }
};

Aoi.adminMgmt.remove = async function (adminId, username) {
  if (!(await Aoi.confirm('确定删除管理员「' + username + '」？该账号将立即失效', { danger: true }))) return;
  var s = Aoi.adminLoadSession();
  if (!s) { Aoi.toast('会话已过期，请重新登录', 'error'); return; }
  try {
    var r = await Aoi.db.rpc('admin_delete', { p_token: s.token, p_admin_id: adminId });
    if (r.error) { Aoi.toast(r.error.message, 'error'); return; }
    Aoi.adminMgmt.render();
    Aoi.toast('已删除 ' + username, 'success');
  } catch (e) { Aoi.toast(e.message, 'error'); }
};

Aoi.adminMgmt.resetPwd = async function (adminId, username) {
  var pwd = prompt('为「' + username + '」设置新密码（至少 6 位）：');
  if (pwd === null) return;
  if (pwd.length < 6) { Aoi.toast('密码至少 6 位', 'warning'); return; }
  var s = Aoi.adminLoadSession();
  if (!s) { Aoi.toast('会话已过期，请重新登录', 'error'); return; }
  try {
    var r = await Aoi.db.rpc('admin_reset_password', { p_token: s.token, p_admin_id: adminId, p_new_password: pwd });
    if (r.error) { Aoi.toast(r.error.message, 'error'); return; }
    Aoi.toast('已重置「' + username + '」的密码，该账号已全部下线', 'success');
  } catch (e) { Aoi.toast(e.message, 'error'); }
};

// 重新生成团员密钥
Aoi.onRegenerateMemberKey = async function () {
  try {
    var code = await Aoi.regenerateMemberKey();
    document.getElementById('memberKeyLabel').textContent = code;
    Aoi.toast('团员密钥已更新', 'success');
  } catch (e) { Aoi.toast(e.message, 'error'); }
};

// 修改团名
Aoi.onRenameTeam = async function () {
  var input = document.getElementById('teamRenameInput');
  var name = input.value.trim();
  if (!name) { Aoi.toast('请输入新团名', 'warning'); return; }
  try {
    await Aoi.renameTeam(name);
    Aoi.state.team.name = name;
    Aoi.renderSettings();
    input.value = '';
    Aoi.toast('团名已更新', 'success');
  } catch (e) { Aoi.toast(e.message, 'error'); }
};

// 公告（手动发布/删除，展示给团员端）
Aoi.announce = {};

// 发布公告。pushGroup 为 true 时同时把公告推送到 QQ 群（机器人未接入/失败不影响站内发布）
Aoi.announce.publish = async function (pushGroup) {
  var ta = document.getElementById('announceInput');
  var text = ta.value.trim();
  if (!text) { Aoi.toast('请输入公告内容', 'warning'); return; }
  var d = Aoi.orders.ensure();
  if (!Array.isArray(d.announcements)) d.announcements = [];
  d.announcements.push({ id: Aoi.genId(), text: text, date: new Date().toISOString().slice(0, 10) });
  await Aoi.saveTeamData(d);
  ta.value = '';
  Aoi.announce.render();
  if (!pushGroup) { Aoi.toast('公告已发布', 'success'); return; }
  try {
    await Aoi.bot.sendGroup('【公告】' + text);
    Aoi.toast('公告已发布并推送到 QQ 群', 'success');
  } catch (e) {
    Aoi.toast('公告已发布，但 QQ 群推送失败：' + (e.message || '未知错误'), 'warning');
  }
};

Aoi.announce.render = function () {
  var ul = document.getElementById('announceList');
  if (!ul) return;
  var d = Aoi.orders.ensure();
  var list = (d.announcements || []).slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
  ul.innerHTML = list.length ? list.map(function (a) {
    return '<li class="flex items-start justify-between border-b border-gray-100 py-2">'
      + '<div class="flex-1"><p class="text-sm whitespace-pre-wrap">' + Aoi.escapeHtml(a.text) + '</p>'
      + '<p class="text-xs text-gray-400 mt-1">' + Aoi.escapeHtml(a.date || '') + '</p></div>'
      + '<button data-remove-announce="' + a.id + '" class="text-red-500 text-sm hover:underline ml-2">删</button>'
      + '</li>';
  }).join('') : '<li class="text-sm text-gray-400 py-2">暂无公告</li>';
};

Aoi.announce.remove = async function (id) {
  var d = Aoi.orders.ensure();
  d.announcements = (d.announcements || []).filter(function (a) { return a.id !== id; });
  await Aoi.saveTeamData(d);
  Aoi.announce.render();
};

// 事件委托：管理员账号列表操作
document.getElementById('adminMgmtList').addEventListener('click', function (e) {
  var del = e.target.closest('button[data-am-del]');
  if (del) { Aoi.adminMgmt.remove(del.getAttribute('data-am-del'), del.getAttribute('data-am-user')); return; }
  var rst = e.target.closest('button[data-am-reset]');
  if (rst) Aoi.adminMgmt.resetPwd(rst.getAttribute('data-am-reset'), rst.getAttribute('data-am-user'));
});

// 事件委托：公告列表里的「删」按钮
document.getElementById('announceList').addEventListener('click', function (e) {
  var btn = e.target.closest('[data-remove-announce]');
  if (btn) Aoi.announce.remove(btn.getAttribute('data-remove-announce'));
});
